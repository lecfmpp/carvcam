import { ToolSchema } from "@carvcam/cam-engine";
import { toast } from "../state/ui";
import { GrblController, GrblError } from "./grbl/controller";
import { alarmKind, ERROR_TEXT, type StatusReport, type V3 } from "./grbl/parse";
import { resumePreamble } from "./grbl/resume";
import { BridgeTransport, WebSerialTransport, type SerialPortLike, type Transport } from "./grbl/transport";
import { useMachine, zeroPatch, type AlarmCode, type MachineStatus, type Vec3 } from "./store";

/**
 * The real machine behind the same state (useMachine) the screens already use. Converts the
 * controller's coordinates to CarvCAM's (X/Y from 0 to the bed size, home at the back right,
 * Z 0 at the top) and maps the grbl state to the app's.
 */
export type ConnTarget =
  | { kind: "webserial"; port: SerialPortLike; label: string }
  | { kind: "serial"; path: string; label: string }
  | { kind: "tcp"; host: string; port: number; label: string };

let ctl: GrblController | null = null;
/** Negative machine coordinates (homing to the back right corner, the Sienci default). */
let negSpace = true;
let jobFinishing = false;
let lastSeg = 0;
let homingNow = false;

export const realController = () => ctl;

const set = (p: Partial<ReturnType<typeof useMachine.getState>>) => useMachine.setState(p);
const get = () => useMachine.getState();

/** Controller coordinate → CarvCAM coordinate. */
function toUi(p: V3): Vec3 {
  if (p.x > 1 || p.y > 1) negSpace = false;
  const b = get().bed;
  return negSpace ? { x: b.x + p.x, y: b.y + p.y, z: p.z } : { x: p.x, y: p.y, z: p.z };
}
function toMachine(p: { x: number; y: number }) {
  const b = get().bed;
  return negSpace ? { x: p.x - b.x, y: p.y - b.y } : p;
}

export async function connectReal(target: ConnTarget, onLog?: (dir: "in" | "out", text: string) => void) {
  await disconnectReal();
  const t: Transport =
    target.kind === "webserial"
      ? new WebSerialTransport(target.port, target.label)
      : target.kind === "serial"
        ? new BridgeTransport({ kind: "serial", path: target.path }, target.label)
        : new BridgeTransport({ kind: "tcp", host: target.host, port: target.port }, target.label);
  set({ status: "connecting", port: target.label, conn: "real" });
  const c = new GrblController(t, {
    status: onStatus,
    alarm: (code) => {
      const kind: AlarmCode = alarmKind(code);
      set({ status: "alarm", alarm: kind, homed: kind === "probe" ? get().homed : false });
    },
    error: (code, line, inJob) => {
      const why = ERROR_TEXT[code] ?? `error ${code}`;
      set({ lastError: `${why} (${line})` });
      if (inJob) {
        set({ status: "paused" });
        toast(`The machine rejected a line and paused: ${why}.`, 6000);
      }
    },
    message: (text) => {
      if (/door/i.test(text)) set({ status: "alarm", alarm: "door" });
    },
    log: (dir, text) => {
      pushLog(dir, text);
      onLog?.(dir, text);
    },
    jobLine: onJobLine,
    jobDone: () => {
      jobFinishing = true;
    },
    toolChange: (tool) => set({ status: "toolchange", pendingTool: tool }),
    closed: (reason) => {
      ctl = null;
      set({ status: "disconnected", conn: null, homed: false, port: null });
      toast(`${reason}. The machine is disconnected.`, 6000);
    },
  });
  try {
    await c.connect();
  } catch (e) {
    set({ status: "disconnected", conn: null, port: null });
    throw e;
  }
  ctl = c;
  negSpace = true;
  // Without limit switches ($22=0) there is no homing: the current position is taken as valid.
  const homingEnabled = (Number(c.settings["22"] ?? "1") & 1) === 1;
  set({ firmware: `${c.firmware ?? "grbl"} ${c.version}`.trim(), homed: !homingEnabled, homingEnabled, lastError: null, workZero: null, zMeasured: false, zeroMethod: null });
  if (c.last) onStatus(c.last);
}

export async function disconnectReal() {
  const c = ctl;
  ctl = null;
  if (c) await c.close().catch(() => {});
}

function onStatus(s: StatusReport) {
  const st = get();
  const patch: Partial<typeof st> = {};
  if (s.mpos) patch.pos = toUi(s.mpos);
  if (st.workZero && ctl) {
    patch.workZero = toUi(ctl.wco);
  }
  if (s.ov) {
    patch.feedOverride = s.ov[0];
    patch.rpmOverride = s.ov[2];
  }
  const busy = !!ctl?.busy;
  let status: MachineStatus = st.status;
  switch (s.state) {
    case "Idle":
      if (jobFinishing) {
        jobFinishing = false;
        status = "done";
        if (st.job) patch.elapsed = st.job.total;
      } else if (st.status === "toolchange") status = "toolchange";
      else if (st.status === "done" || (st.status === "paused" && busy)) status = st.status;
      else status = busy ? "running" : "idle";
      if (homingNow) status = "homing";
      break;
    case "Run":
      status = busy || jobFinishing ? "running" : homingNow ? "homing" : "idle";
      break;
    case "Jog":
      status = "idle";
      break;
    case "Hold":
      status = busy || jobFinishing ? "paused" : "idle";
      break;
    case "Home":
      status = "homing";
      break;
    case "Alarm":
      status = "alarm";
      if (!st.alarm) patch.alarm = s.pins?.includes("E") ? "estop" : "lost";
      break;
    case "Door":
      status = "alarm";
      patch.alarm = "door";
      break;
    case "Tool":
      status = "toolchange";
      break;
    default:
      status = st.status === "connecting" ? "idle" : st.status;
  }
  patch.status = status;
  patch.liveFeed = s.feed ?? 0;
  patch.liveRpm = s.rpm ?? 0;
  set(patch);
}

/** Acknowledged line → segment → elapsed time and carved heightmap. */
function onJobLine(line: number) {
  const st = get();
  const job = st.job;
  if (!job) return;
  let i = lastSeg;
  while (i < job.segs.length - 1 && job.segs[i + 1].line <= line) i++;
  if (i === lastSeg && job.segs[i].line > line) return;
  stampCarved(lastSeg, i);
  lastSeg = i;
  set({ elapsed: job.times[i] ?? st.elapsed });
}

function stampCarved(from: number, to: number) {
  const st = get();
  const job = st.job;
  const hm = st.carved;
  if (!job || !hm) return;
  const tool = job.tools.find((t) => t.id === st.activeTool) ?? job.tools[0] ?? ToolSchema.parse({});
  for (let i = Math.max(0, from); i <= Math.min(to, job.segs.length - 1); i++) {
    const s = job.segs[i];
    if (s.from.z >= 0 && s.to.z >= 0) continue;
    const len = Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y);
    const n = Math.max(1, Math.ceil(len / (hm.res * 0.5)));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      hm.stamp(s.from.x + (s.to.x - s.from.x) * t, s.from.y + (s.to.y - s.from.y) * t, s.from.z + (s.to.z - s.from.z) * t, tool);
    }
  }
}

/* ---------------- actions ---------------- */

/** Runs the action and shows a toast if it fails. Returns true on success. */
async function guard(p: Promise<unknown>, what: string): Promise<boolean> {
  try {
    await p;
    return true;
  } catch (e) {
    const msg = e instanceof GrblError ? (ERROR_TEXT[e.code] ?? `error ${e.code}`) : e instanceof Error ? e.message : String(e);
    if (!/Stopped|Disconnected/.test(msg)) toast(`${what}: ${msg}`, 5000);
    set({ lastError: `${what}: ${msg}` });
    return false;
  }
}

export async function homeReal() {
  if (!ctl) return;
  homingNow = true;
  set({ status: "homing" });
  const ok = await guard(ctl.home(), "Homing failed");
  homingNow = false;
  set({ status: get().status === "alarm" ? "alarm" : "idle", homed: ok || get().homed });
}

const JOG_XY = 3000;
const JOG_Z = 600;
export function jogReal(dx: number, dy: number, dz: number) {
  if (!ctl) return;
  void guard(ctl.jog(dx, dy, dz, dz && !dx && !dy ? JOG_Z : JOG_XY), "Move failed");
}
export function moveToReal(x: number, y: number) {
  if (!ctl) return;
  const b = get().bed;
  const m = toMachine({ x: Math.max(0, Math.min(b.x, x)), y: Math.max(0, Math.min(b.y, y)) });
  void guard(ctl.jogTo(m.x, m.y, JOG_XY), "Move failed");
}
export async function setWorkZeroReal(axes: ("x" | "y" | "z")[]) {
  if (!ctl) return;
  const ok = await guard(ctl.setZero(axes), "Setting zero failed");
  if (!ok) return;
  const s = get();
  const wz = { ...(s.workZero ?? s.pos) };
  for (const a of axes) wz[a] = s.pos[a];
  set({ workZero: wz, ...zeroPatch(axes) });
}
export async function probeZReal(plate: number) {
  if (!ctl) return;
  const ok = await guard(ctl.probeZ(plate), "Measuring failed");
  if (!ok) return;
  const s = get();
  // Z zero = touch point − plate thickness. The touch point is 5 mm below where the bit is now.
  const touchZ = s.pos.z - 5;
  set({ workZero: { ...(s.workZero ?? s.pos), z: touchZ - plate }, zMeasured: true, zeroMethod: "probe" });
}
export function startReal() {
  const s = get();
  if (!ctl || !s.job) return;
  lastSeg = 0;
  jobFinishing = false;
  set({ status: "running", elapsed: 0 });
  ctl.runJob(s.job.gcode);
}
export function restartFromReal(fromLine: number) {
  const s = get();
  if (!ctl || !s.job) return;
  const lines = s.job.gcode.split(/\r?\n/);
  const pre = resumePreamble(lines, fromLine);
  lastSeg = Math.max(0, s.job.segs.findIndex((g) => g.line >= fromLine));
  jobFinishing = false;
  set({ status: "running", alarm: null });
  ctl.runJob([...pre, ...lines.slice(fromLine - 1)].join("\n"));
}
export const pauseReal = () => void ctl?.pause();
export const resumeReal = () => ctl?.resume();
export async function stopReal() {
  if (!ctl) return;
  jobFinishing = false;
  await ctl.stop();
  set({ pendingTool: null, status: "idle" });
}
export function confirmToolChangeReal() {
  const s = get();
  if (!ctl || s.pendingTool == null) return;
  set({ status: "running", activeTool: s.pendingTool, pendingTool: null });
  ctl.confirmToolChange();
}
export const feedOverrideReal = (v: number) => void ctl?.setFeedOverride(v);
export const rpmOverrideReal = (v: number) => void ctl?.setRpmOverride(v);
export async function clearAlarmReal() {
  if (!ctl) return;
  const code = get().alarm;
  if (code === "door") {
    ctl.resume();
    set({ alarm: null });
    return;
  }
  const ok = await guard(ctl.unlock(), "Unlock failed");
  if (ok) set({ alarm: null, status: "idle", homed: code === "probe" ? get().homed : !get().homingEnabled });
}
export async function spinTestReal(rpm: number, ms: number) {
  if (!ctl) return false;
  return guard(ctl.spinTest(rpm, ms), "Spindle test failed");
}
export async function sendRaw(line: string) {
  if (!ctl) return;
  if (line.length === 1 && "?!~".includes(line)) return ctl.rt(line);
  await guard(ctl.send(line), "Command failed");
}

/* ---------------- console ---------------- */

const LOG_MAX = 300;
function pushLog(dir: "in" | "out", text: string) {
  const log = get().log;
  set({ log: [...log.slice(-(LOG_MAX - 1)), { dir, text, t: Date.now() }] });
}
