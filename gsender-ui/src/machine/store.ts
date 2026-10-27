import { Heightmap, parseLines, ToolSchema, toSegments, type Segment, type Tool } from "@gsender-next/cam-engine";
import { create } from "zustand";
import * as R from "./real";

/**
 * Machine state. With conn === "real" the actions go to the actual controller (real.ts,
 * grbl/grblHAL protocol over USB or Ethernet); with "sim" or no connection, the built-in simulator
 * animates everything so the UI can be tested without a CNC.
 */
export type MachineStatus = "disconnected" | "connecting" | "idle" | "homing" | "running" | "paused" | "toolchange" | "alarm" | "done";

export type AlarmCode = "door" | "limit" | "estop" | "lost" | "probe";

export const ALARMS: Record<AlarmCode, { eyebrow: string; title: string; body: string; tech: string; steps: string[]; video: string }> = {
  door: {
    eyebrow: "Alarm · Door open",
    title: "The enclosure door was opened",
    body: "The machine paused and lifted the bit so nobody gets hurt. Your place in the job is saved.",
    tech: "Safety door input (grblHAL state Door:1)",
    steps: ["Close the door", "Check nothing is touching the bit", "Resume the carve"],
    video: "alarm-door",
  },
  limit: {
    eyebrow: "Alarm · Travel limit",
    title: "The bit reached the edge of the machine",
    body: "The machine stopped so it doesn't crash into the frame. Your work zero is saved.",
    tech: "ALARM:2 / ALARM:1 (soft or hard limit)",
    steps: ["Unlock the machine", "Find machine home again", "Check the board fits inside the machine area"],
    video: "alarm-limit",
  },
  estop: {
    eyebrow: "Alarm · Emergency stop",
    title: "The emergency stop was pressed",
    body: "Everything stopped at once. Nothing will move until you release the button and reset.",
    tech: "E-stop input / ALARM:10",
    steps: ["Make sure it's safe", "Release the emergency stop button", "Reset and find machine home"],
    video: "alarm-estop",
  },
  lost: {
    eyebrow: "Alarm · Position lost",
    title: "The machine is not sure where it is",
    body: "This happens after a reset or a missed step. We need to find home again before cutting.",
    tech: "ALARM:3 (reset while in motion) or homing required",
    steps: ["Find machine home", "Re-check work zero on the corner", "Restart the operation that was running"],
    video: "alarm-lost",
  },
  probe: {
    eyebrow: "Alarm · Touch plate",
    title: "The touch plate didn't make contact",
    body: "The bit went down without touching the plate. Probably the magnet clip isn't on the bit.",
    tech: "ALARM:5 (probe fail)",
    steps: ["Clip the magnet on the bit", "Place the plate under the bit", "Measure again"],
    video: "alarm-probe",
  },
};

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Job {
  name: string;
  gcode: string;
  segs: Segment[];
  /** Cumulative time (s) at the end of each segment. */
  times: number[];
  total: number;
  /** Segment indices preceded by a tool change (T# M6). */
  toolChanges: { seg: number; tool: number }[];
  tools: Tool[];
  board: { width: number; height: number; thickness: number };
  /** Segment → operation name (from the "; --- name ---" comments). */
  opOfSeg: number[];
  ops: string[];
}

interface MachineState {
  status: MachineStatus;
  port: string | null;
  /** "real": actual controller; "sim": simulator; null: disconnected. */
  conn: "real" | "sim" | null;
  /** Firmware and version reported by the controller (real connection only). */
  firmware: string;
  /** The machine has homing switches ($22). Without them, the power-on position is taken as valid. */
  homingEnabled: boolean;
  lastError: string | null;
  /** Traffic with the controller (console). */
  log: { dir: "in" | "out"; text: string; t: number }[];
  /** Actual feed rate (mm/min) and spindle speed reported by the controller. */
  liveFeed: number;
  liveRpm: number;
  homed: boolean;
  /** Bit position in machine coordinates (mm). */
  pos: Vec3;
  /** Work zero in machine coordinates. */
  workZero: Vec3 | null;
  zMeasured: boolean;
  bed: { x: number; y: number; z: number };
  job: Job | null;
  /** Simulated job time (s). */
  elapsed: number;
  feedOverride: number;
  rpmOverride: number;
  alarm: AlarmCode | null;
  pendingTool: number | null;
  activeTool: number;
  carved: Heightmap | null;
  /** Simulation speed-up factor (1 = real time). */
  speedup: number;

  setBed(b: { x: number; y: number; z: number }): void;
  connect(port: string): Promise<void>;
  /** Connects to an actual controller (USB through the browser or the bridge, or Ethernet). */
  connectReal(target: R.ConnTarget): Promise<void>;
  disconnect(): void;
  home(): Promise<void>;
  jog(dx: number, dy: number, dz: number): void;
  moveTo(x: number, y: number): void;
  setWorkZero(axes?: ("x" | "y" | "z")[]): void;
  probeZ(plateThickness?: number): Promise<void>;
  loadJob(job: Omit<Job, "segs" | "times" | "total" | "toolChanges" | "opOfSeg" | "ops">): void;
  start(): void;
  pause(): void;
  resume(): void;
  stop(): void;
  confirmToolChange(): void;
  setFeedOverride(v: number): void;
  setRpmOverride(v: number): void;
  raiseAlarm(code: AlarmCode): void;
  clearAlarm(): void;
  /** Resumes the job from a point in time (s), e.g. the start of the operation an alarm interrupted. */
  restartFrom(elapsed: number): void;
  reset(): void;
}

const SAFE_Z = -5; // machine Z after homing is at the top (0); work happens below
let timer: ReturnType<typeof setInterval> | null = null;

export const useMachine = create<MachineState>()((set, get) => ({
  status: "disconnected",
  port: null,
  conn: null,
  firmware: "",
  homingEnabled: true,
  lastError: null,
  log: [],
  liveFeed: 0,
  liveRpm: 0,
  homed: false,
  pos: { x: 0, y: 0, z: 0 },
  workZero: null,
  zMeasured: false,
  bed: { x: 805, y: 830, z: 129 },
  job: null,
  elapsed: 0,
  feedOverride: 100,
  rpmOverride: 100,
  alarm: null,
  pendingTool: null,
  activeTool: 1,
  carved: null,
  speedup: 20,

  setBed: (bed) => set({ bed }),

  connect: async (port) => {
    await R.disconnectReal();
    set({ status: "connecting", port, conn: "sim", firmware: "Simulator", homingEnabled: true });
    await sleep(700);
    // At power-on the machine doesn't know where it is until it homes.
    set({ status: "idle", homed: false, pos: { x: get().bed.x / 2, y: get().bed.y / 2, z: SAFE_Z } });
  },
  connectReal: (target) => R.connectReal(target),
  disconnect: () => {
    stopTimer();
    void R.disconnectReal();
    set({ status: "disconnected", port: null, homed: false, conn: null });
  },

  home: async () => {
    if (get().status !== "idle") return;
    if (get().conn === "real") return R.homeReal();
    set({ status: "homing" });
    const from = get().pos;
    // LongMill and AltMill home: back right corner, Z at the top.
    const to = { x: get().bed.x, y: get().bed.y, z: 0 };
    await animate(from, to, 1400, (p) => set({ pos: p }));
    set({ status: "idle", homed: true });
  },

  jog: (dx, dy, dz) => {
    const s = get();
    if (s.status !== "idle") return;
    if (s.conn === "real") return R.jogReal(dx, dy, dz);
    const p = { x: clamp(s.pos.x + dx, 0, s.bed.x), y: clamp(s.pos.y + dy, 0, s.bed.y), z: clamp(s.pos.z + dz, -s.bed.z, 0) };
    set({ pos: p });
  },
  moveTo: (x, y) => {
    const s = get();
    if (s.status !== "idle") return;
    if (s.conn === "real") return R.moveToReal(x, y);
    animate(s.pos, { x: clamp(x, 0, s.bed.x), y: clamp(y, 0, s.bed.y), z: s.pos.z }, 600, (p) => set({ pos: p }));
  },
  setWorkZero: (axes = ["x", "y", "z"]) => {
    const s = get();
    if (s.conn === "real") return void R.setWorkZeroReal(axes);
    const wz = s.workZero ?? { ...s.pos };
    const next = { ...wz };
    for (const a of axes) next[a] = s.pos[a];
    set({ workZero: next, zMeasured: axes.includes("z") ? s.zMeasured : s.zMeasured });
  },
  probeZ: async (plate = 15) => {
    const s = get();
    // During a tool change the queue is held and the machine is at rest, so probing is allowed.
    if (s.conn === "real" && (s.status === "idle" || s.status === "toolchange")) return R.probeZReal(plate);
    if (s.status !== "idle") return;
    // Moves down until it touches the plate (simulated 40 mm below) and backs off 5 mm.
    const touch = { ...s.pos, z: Math.max(-s.bed.z, s.pos.z - 40) };
    await animate(s.pos, touch, 900, (p) => set({ pos: p }));
    const zero = touch.z - plate;
    const wz = { ...(get().workZero ?? touch), z: zero };
    await animate(touch, { ...touch, z: touch.z + 5 }, 300, (p) => set({ pos: p }));
    set({ workZero: wz, zMeasured: true });
  },

  loadJob: (j) => {
    const lines = parseLines(j.gcode);
    const segs = toSegments(lines, { x: 0, y: 0, z: 10 });
    const times: number[] = [];
    let t = 0;
    const maxRate = 4000;
    for (const s of segs) {
      const len = Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y, s.to.z - s.from.z);
      t += (len / (s.rapid ? maxRate : Math.max(1, s.feed))) * 60;
      times.push(t);
    }
    // Tool changes and operation names, read from the G-code text.
    const toolChanges: Job["toolChanges"] = [];
    const ops: string[] = [];
    const opAtLine: number[] = [];
    let curOp = -1;
    for (const l of lines) {
      const m = /;\s*---\s*(.+?)\s*---/.exec(l.raw);
      if (m) {
        ops.push(m[1]);
        curOp = ops.length - 1;
      }
      opAtLine[l.number] = curOp;
      if (/^\s*T(\d+)\s+M6/.test(l.raw)) {
        const tool = Number(/T(\d+)/.exec(l.raw)![1]);
        const seg = segs.findIndex((s) => s.line > l.number);
        if (seg > 0) toolChanges.push({ seg, tool });
      }
    }
    const opOfSeg = segs.map((s) => Math.max(0, opAtLine[s.line] ?? 0));
    const hm = new Heightmap(-2, -2, j.board.width + 4, j.board.height + 4, Math.max(0.4, Math.max(j.board.width, j.board.height) / 400));
    set({ job: { ...j, segs, times, total: t, toolChanges, opOfSeg, ops }, elapsed: 0, carved: hm, activeTool: j.tools[0]?.id ?? 1, pendingTool: null });
  },

  start: () => {
    const s = get();
    if (!s.job || !s.homed || !s.workZero || s.status !== "idle") return;
    if (s.conn === "real") return R.startReal();
    set({ status: "running", elapsed: 0 });
    startTimer();
  },
  pause: () => {
    if (get().conn === "real") return R.pauseReal();
    if (get().status === "running") set({ status: "paused" });
  },
  resume: () => {
    if (get().conn === "real") return void R.resumeReal();
    if (get().status === "paused") set({ status: "running" });
  },
  stop: () => {
    stopTimer();
    const s = get();
    if (s.status === "disconnected") return;
    if (s.conn === "real") return void R.stopReal();
    set({ status: s.status === "alarm" ? "alarm" : "idle", pendingTool: null });
  },
  confirmToolChange: () => {
    const s = get();
    if (s.conn === "real") return R.confirmToolChangeReal();
    if (s.status !== "toolchange" || s.pendingTool == null) return;
    set({ status: "running", activeTool: s.pendingTool, pendingTool: null });
  },
  setFeedOverride: (v) => {
    set({ feedOverride: clamp(v, 50, 150) });
    if (get().conn === "real") R.feedOverrideReal(clamp(v, 50, 150));
  },
  setRpmOverride: (v) => {
    set({ rpmOverride: clamp(v, 50, 150) });
    if (get().conn === "real") R.rpmOverrideReal(clamp(v, 50, 150));
  },
  raiseAlarm: (code) => set({ status: "alarm", alarm: code }),
  clearAlarm: () => {
    if (get().conn === "real") return void R.clearAlarmReal();
    const code = get().alarm;
    // Limit, E-stop and lost position all require homing again.
    const needsHome = code === "limit" || code === "estop" || code === "lost";
    set({ alarm: null, status: get().job && get().elapsed > 0 && code === "door" ? "paused" : "idle", homed: needsHome ? false : get().homed });
  },
  restartFrom: (elapsed) => {
    const s = get();
    if (!s.job) return;
    if (s.conn === "real") {
      const seg = s.job.segs[upperBound(s.job.times, elapsed)];
      return R.restartFromReal(seg?.line ?? 1);
    }
    set({ status: "running", alarm: null, homed: true, elapsed: Math.max(0, Math.min(elapsed, s.job.total)) });
    startTimer();
  },
  reset: () => {
    stopTimer();
    set({ job: null, elapsed: 0, carved: null, status: get().status === "disconnected" ? "disconnected" : "idle", alarm: null });
  },
}));

/** Current bit position in work coordinates. */
export function workPos(s: { pos: Vec3; workZero: Vec3 | null }): Vec3 {
  const z = s.workZero ?? { x: 0, y: 0, z: 0 };
  return { x: s.pos.x - z.x, y: s.pos.y - z.y, z: s.pos.z - z.z };
}

function startTimer() {
  stopTimer();
  let last = performance.now();
  let segIdx = 0;
  timer = setInterval(() => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;
    const s = useMachine.getState();
    if (s.status !== "running" || !s.job) return;
    const job = s.job;
    let elapsed = s.elapsed + dt * s.speedup * (s.feedOverride / 100);
    // Tool change: stop at the first segment after the M6.
    const tc = job.toolChanges.find((c) => c.tool !== s.activeTool && job.times[c.seg - 1] <= elapsed && c.seg > segIdx - 1);
    if (tc) {
      elapsed = job.times[tc.seg - 1];
      segIdx = tc.seg;
    }
    if (elapsed >= job.total) {
      stamp(job, s.carved, segIdx, job.segs.length, 1);
      const end = job.segs[job.segs.length - 1].to;
      useMachine.setState({ elapsed: job.total, status: "done", pos: toMachine(s, end) });
      stopTimer();
      return;
    }
    const i = upperBound(job.times, elapsed);
    const seg = job.segs[i];
    const t0 = i > 0 ? job.times[i - 1] : 0;
    const f = (elapsed - t0) / Math.max(1e-9, job.times[i] - t0);
    stamp(job, s.carved, segIdx, i, f);
    segIdx = i;
    const p = lerp(seg.from, seg.to, f);
    useMachine.setState({ elapsed, pos: toMachine(s, p), ...(tc ? { status: "toolchange", pendingTool: tc.tool } : {}) });
  }, 50);
}

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Stamps the segments traveled since the last frame onto the heightmap. */
function stamp(job: Job, hm: Heightmap | null, from: number, to: number, f: number) {
  if (!hm) return;
  const tool = job.tools.find((t) => t.id === useMachine.getState().activeTool) ?? job.tools[0] ?? ToolSchema.parse({});
  for (let i = Math.max(0, from); i <= Math.min(to, job.segs.length - 1); i++) {
    const s = job.segs[i];
    const end = i === to && f < 1 ? lerp(s.from, s.to, f) : s.to;
    if (s.from.z >= 0 && end.z >= 0) continue;
    const len = Math.hypot(end.x - s.from.x, end.y - s.from.y);
    const n = Math.max(1, Math.ceil(len / (hm.res * 0.5)));
    for (let k = 0; k <= n; k++) {
      const p = lerp(s.from, end, k / n);
      hm.stamp(p.x, p.y, p.z, tool);
    }
  }
}

function toMachine(s: { workZero: Vec3 | null }, p: Vec3): Vec3 {
  const z = s.workZero ?? { x: 0, y: 0, z: 0 };
  return { x: p.x + z.x, y: p.y + z.y, z: p.z + z.z };
}

function upperBound(a: number[], v: number) {
  let lo = 0;
  let hi = a.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function animate(from: Vec3, to: Vec3, ms: number, onFrame: (p: Vec3) => void): Promise<void> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / ms);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      onFrame(lerp(from, to, e));
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

// In development, the machine state is reachable from the browser console (__machine.getState()).
if (import.meta.env.DEV && typeof window !== "undefined") (window as unknown as { __machine: typeof useMachine }).__machine = useMachine;
