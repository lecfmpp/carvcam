import { AlertTriangle, ArrowDown, ArrowUp, Check, OctagonAlert, Pause, Printer } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Banner, Seg, SidePanel } from "../../components/ui";
import { dialFor, materialById, TRACK } from "../../lib/catalog";
import { useMachine, workPos, type AlarmCode } from "../../machine/store";
import { useDesign } from "../../state/design";
import { toast } from "../../state/ui";
import { useWorkshop } from "../../state/workshop";
import { Board, LayoutOverlay, ToolpathOverlay, useSegments } from "../../stage/Board";
import { KeepOutLayer } from "../../stage/KeepOutLayer";
import { SimCanvas } from "../../stage/SimCanvas";
import { fitScale, Stage } from "../../stage/Stage";
import { ThreeView } from "../../stage/ThreeView";
import { tabMarks } from "../../stage/tabs";
import type { JobCtx } from "./Job";
import { bitNameFor, fmtMin, rpmText, useFlow } from "./jobUtil";
import { zoneIssues, zoneOverhang } from "./zones";
import { SetupSheetDialog } from "./SetupSheetDialog";

/** Alarms with guided recovery (prototype copy). "hold" = pause only, the position is still valid. */
const ALARMS: Record<AlarmCode, { kind: string; hold?: boolean; title: string; why: string; steps: [string, string][]; resume: string; code: string }> = {
  door: { kind: "Paused · door open", hold: true, title: "The enclosure door opened and the carve paused", why: "The bit stopped spinning so nobody gets hurt. Your position is kept.", steps: [["Close the enclosure door", "Door is closed"]], resume: "Resume carving", code: "Hold:1 · Safety door opened" },
  limit: {
    kind: "Alarm · travel limit",
    title: "The bit reached the edge of the machine",
    why: "The machine stopped so it doesn't crash into the frame. Your work zero is saved.",
    steps: [["Move the bit 5 mm away from the edge", "Move 5 mm back"], ["Find machine home again", "Find home"], ["Check the design fits inside the work area", "Check fit"]],
    resume: "Restart this operation",
    code: "ALARM:1 · Hard limit triggered",
  },
  probe: {
    kind: "Alarm · touch plate",
    title: "The bit went down but never touched the plate",
    why: "Without that touch, the machine doesn't know how high the board is.",
    steps: [["Check the magnet clip is on the bit", "Clip is on"], ['Tap "Test contact" and touch the plate to the bit', "Test contact"], ["Move the bit within 25 mm of the plate", "Done"]],
    resume: "Measure again",
    code: "ALARM:5 · Probe fail, no contact within travel",
  },
  estop: {
    kind: "Alarm · emergency stop",
    title: "The emergency stop was pressed",
    why: "Everything stopped instantly. The machine may have lost its position.",
    steps: [["Check the bed is safe", "Bed is safe"], ["Twist the red button to release it", "Released"], ["Find machine home", "Find home"]],
    resume: "Restart this operation",
    code: "ALARM:10 · E-stop asserted",
  },
  lost: {
    kind: "Alarm · position lost",
    title: "The machine no longer knows where it is",
    why: "A motor may have skipped. Continuing could carve in the wrong place.",
    steps: [["Find machine home", "Find home"], ["Re-apply your saved work zero", "Re-apply zero"]],
    resume: "Restart this operation",
    code: "ALARM:3 · Reset while in motion, position lost",
  },
};

type Phase = "check" | "running" | "paused" | "toolchange" | "alarm" | "done";

export function CarveStep({ ctx }: { ctx: JobCtx }) {
  const nav = useNavigate();
  const m = useMachine();
  const flow = useFlow();
  const mode = useWorkshop((s) => s.mode);
  const markDone = useWorkshop((s) => s.markDone);
  const newBlank = useDesign((s) => s.newBlank);
  const { design, result, sim, machine, head, groups } = ctx;
  const segs = useSegments(result?.gcode);
  const [resolving, setResolving] = useState(false);
  const [alarmStep, setAlarmStep] = useState(0);
  const [codeOpen, setCodeOpen] = useState(false);
  const [tcStep, setTcStep] = useState(0);
  const [probeLeft, setProbeLeft] = useState<number | null>(null);
  /** Bit change without a touch plate: set the new bit's Z by hand (paper method). */
  const [tcManual, setTcManual] = useState(false);
  const [tcJog, setTcJog] = useState(0.1);
  const [doneSpin, setDoneSpin] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);

  const phase: Phase = m.status === "running" ? "running" : m.status === "paused" ? "paused" : m.status === "toolchange" ? "toolchange" : m.status === "alarm" ? "alarm" : m.status === "done" ? "done" : "check";
  const b = result?.layout.stock;
  const mat = materialById(design.material);
  const simTabs = useMemo(() => tabMarks({ ...design.tabs, mode: "auto" }, result), [design.tabs, result]);
  const job = m.job;
  const progress = job && phase !== "check" ? Math.min(1, m.elapsed / Math.max(1, job.total)) : 0;

  // Current operation (group) from the segment being cut.
  const segIdx = job ? upper(job.times, m.elapsed) : 0;
  const rawOp = job ? (job.opOfSeg[Math.min(segIdx, job.opOfSeg.length - 1)] ?? 0) : 0;
  const curGroup = Math.max(0, groups.findIndex((g) => g.raw.includes(rawOp)));

  // Stopping mid-job goes back to the checklist with a notice.
  const prev = useRef(m.status);
  useEffect(() => {
    if ((prev.current === "running" || prev.current === "paused" || prev.current === "toolchange") && m.status === "idle") {
      toast("Stopped. The bit lifted and the router turned off. The job was cancelled.");
      flow.set({ routerOn: false });
    }
    if (m.status === "toolchange" && prev.current !== "toolchange") setTcStep(0);
    if (m.status === "alarm" && prev.current !== "alarm") {
      setResolving(false);
      setAlarmStep(0);
      setCodeOpen(false);
    }
    if (m.status === "done" && prev.current !== "done") {
      setDoneSpin((n) => n + 1);
      if (design.projectId && TRACK.some((t) => t.id === design.projectId)) markDone(design.projectId);
    }
    prev.current = m.status;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.status]);

  // ---------- Checklist ----------
  const connected = m.status !== "disconnected" && m.status !== "connecting";
  const positioned = connected && m.homed && flow.zeroSet && m.zMeasured && !!m.workZero;
  const firstTool = groups[0]?.tool ?? 1;
  const firstBit = bitNameFor(design, firstTool);
  const twoBits = new Set(groups.map((g) => g.tool)).size > 1;
  const rpm = result?.params.main.rpm ?? 18000;
  const dial = result?.manualAdjustments.find((a) => a.tool === firstTool) ?? null;
  const zones = design.keepOut ?? [];
  const koIssues = zoneIssues(result, zones);
  const fits = b ? b.width <= machine.area[0] && b.height <= machine.area[1] : true;

  type Check = { label: string; sub: string; ok: boolean; fix?: [string, () => void]; dial?: number };
  const checks: Check[] = b
    ? [
        fits
          ? { label: "Fits on the machine", sub: `${fmtN(b.width)} × ${fmtN(b.height)} mm inside ${machine.area[0]} × ${machine.area[1]} mm`, ok: true }
          : { label: "Too big for your machine", sub: `Needs ${fmtN(b.width)} × ${fmtN(b.height)} mm, the work area is ${machine.area[0]} × ${machine.area[1]} mm`, ok: false, fix: ["Change machine", () => nav("/workshop/settings")] },
        positioned
          ? {
              label: "Work zero set",
              sub: m.zeroMethod === "manual" ? "Z set by hand — double-check the bit just touches the top" : "Bottom-left corner, top face · height measured with the touch plate",
              ok: true,
            }
          : { label: connected ? "Work zero not set" : "Machine not connected", sub: "The machine does not know where the board is", ok: false, fix: ["Set zero", () => nav("/position")] },
        flow.bitIn
          ? { label: `${firstBit} bit installed`, sub: twoBits ? `You'll switch to ${bitNameFor(design, 2)} halfway` : "Same bit for the whole job", ok: true }
          : { label: `Install the ${firstBit} bit`, sub: "The first operation uses this bit", ok: false, fix: ["It's in", () => flow.set({ bitIn: true })] },
        head.auto
          ? { label: "Automatic speed ✓", sub: `${head.name} will run at ${rpmText(rpm)} on its own`, ok: true }
          : flow.routerOn
            ? { label: `Dial on ${dial?.dial ?? 3} · router on`, sub: `${rpmText(dial?.rpm ?? rpm)} on the Makita`, ok: true, dial: dial?.dial ?? 3 }
            : { label: `Turn the dial to ${dial?.dial ?? 3} · ${rpmText(dialFor(ctx.headId, dial?.rpm ?? rpm)?.rpm ?? rpm)}`, sub: "Then switch the Makita on. Its speed is set by hand.", ok: false, fix: ["It's on", () => flow.set({ routerOn: true })], dial: dial?.dial ?? 3 },
        ctx.hasProfile && ctx.tabs > 0
          ? { label: `${ctx.tabs} holding tabs`, sub: `${ctx.tabs} tabs, ${design.tabs.width ?? 6} mm wide × ${design.tabs.height} mm high`, ok: true }
          : { label: "Piece held down", sub: ctx.hasProfile ? "Double-sided tape under the board" : "Clamped on the bed; nothing gets cut loose", ok: true },
        ...(zones.length
          ? [
              koIssues.length
                ? { label: "A clamp is in the bit's way", sub: koIssues[0].title, ok: false, fix: ["Fix", () => nav("/position")] as [string, () => void] }
                : { label: "Clamps clear of the toolpath", sub: `${zones.length} keep-out zone${zones.length > 1 ? "s" : ""} checked · travel raised over them`, ok: true },
            ]
          : []),
      ]
    : [];
  const toFix = checks.filter((c) => !c.ok).length;
  const allOk = !!b && toFix === 0 && !!result?.ok;
  const totalSec = result?.verification?.stats.estimatedTimeSec ?? 0;
  const leftMin = job ? (job.total - m.elapsed) / 60 / (m.feedOverride / 100) : totalSec / 60;

  const start = () => {
    if (!result || !b) return;
    useMachine.getState().loadJob({ name: design.name, gcode: result.gcode, tools: result.tools, board: { width: b.width, height: b.height, thickness: b.thickness } });
    useMachine.getState().start();
  };

  // ---------- Bit change ----------
  const tcFrom = bitNameFor(design, m.activeTool);
  const tcTo = bitNameFor(design, m.pendingTool ?? 2);
  const dialNext = result?.manualAdjustments.find((a) => a.tool === (m.pendingTool ?? 2));
  const dialPrev = result?.manualAdjustments.find((a) => a.tool === m.activeTool);
  const tcRouter: [string, string] = head.auto
    ? ["Automatic speed ✓", "Nothing to set. The carve picks up where it stopped."]
    : dialNext && dialPrev && dialNext.dial !== dialPrev.dial
      ? [`Set the dial to ${dialNext.dial} · ${rpmText(dialNext.rpm)}`, `It was on ${dialPrev.dial} for the previous bit. Then switch the router back on.`]
      : ["Turn the router back on", `The dial stays on ${dialNext?.dial ?? dialPrev?.dial ?? 3}. The carve picks up where it stopped.`];
  const tcSteps: [string, string][] = [
    ["Swap the bit", `Loosen the collet, take out the ${tcFrom} bit, put in the ${tcTo} bit.`],
    tcManual
      ? ["Set the new bit height by hand", "Paper on the board under the bit. Lower it until it just pinches the paper, then set Z."]
      : ["Measure the new bit height", "Put the touch plate under the bit and attach the magnet clip."],
    tcRouter,
  ];
  const probeTc = async () => {
    if (useMachine.getState().conn === "real") {
      // Real machine: measure the new bit on the touch plate (15 mm) before continuing.
      setProbeLeft(0);
      useMachine.setState({ zMeasured: false });
      await useMachine.getState().probeZ(15);
      setProbeLeft(null);
      if (useMachine.getState().zMeasured) setTcStep(2);
      return;
    }
    let z = 25;
    setProbeLeft(z);
    const t = setInterval(() => {
      z -= 2.5;
      if (z <= 0) {
        clearInterval(t);
        setProbeLeft(null);
        setTcStep(2);
      } else setProbeLeft(z);
    }, 90);
  };

  const manualTc = async () => {
    // Real machine: Z zero where the new bit touches the paper. The simulator only plays the step.
    if (useMachine.getState().conn === "real") {
      useMachine.setState({ zMeasured: false });
      await useMachine.getState().setWorkZero(["z"]);
      if (!useMachine.getState().zMeasured) return;
    }
    toast("Z set by hand for the new bit.");
    setTcStep(2);
  };

  // ---------- Alarm ----------
  const A = m.alarm ? ALARMS[m.alarm] : null;
  const alarmResolved = !!A && alarmStep >= A.steps.length;
  const resumeFromAlarm = () => {
    if (!A || !job) return;
    if (A.hold) {
      m.clearAlarm();
      useMachine.getState().resume();
      toast("Resumed.");
      return;
    }
    const g = groups[curGroup];
    const firstSeg = job.opOfSeg.findIndex((o) => g?.raw.includes(o));
    const t = firstSeg > 0 ? job.times[firstSeg - 1] : 0;
    m.restartFrom(t);
    toast(`Restarting "${g?.label ?? "the operation"}" from the beginning.`);
  };

  // ---------- Panel ----------
  let title = "Before you carve";
  let hint = "";
  let primary: { label: string; click(): void; enabled: boolean } | null = null;
  let secondary: { label: string; kbd: string; click(): void } | null = null;
  if (phase === "check") {
    hint = allOk ? "Stand clear, glasses on. You can pause or stop at any time." : "Fix the items marked above to start.";
    primary = { label: "Start carving", click: start, enabled: allOk };
  }
  if (phase === "running") {
    title = "Carving";
    secondary = { label: "Pause", kbd: "Space", click: () => m.pause() };
  }
  if (phase === "paused") {
    title = "Paused";
    primary = { label: "Resume carving", click: () => m.resume(), enabled: true };
  }
  if (phase === "toolchange") {
    title = `Change to the ${tcTo} bit`;
    primary =
      tcStep === 0
        ? { label: "Bit is swapped", click: () => setTcStep(1), enabled: true }
        : tcStep === 1
          ? tcManual
            ? { label: "Set Z zero here", click: () => void manualTc(), enabled: true }
            : { label: probeLeft != null ? "Measuring…" : "Measure height", click: probeTc, enabled: probeLeft == null }
          : { label: "Done, continue", click: () => m.confirmToolChange(), enabled: true };
  }
  if (phase === "alarm" && A) {
    title = A.hold ? "Carve paused" : "Machine stopped";
    primary = !resolving ? { label: "Resolve", click: () => setResolving(true), enabled: true } : { label: A.resume, click: resumeFromAlarm, enabled: alarmResolved };
  }
  if (phase === "done") {
    title = "Done";
    primary = {
      label: "Carve again",
      click: () => {
        m.reset();
        flow.set({ bitIn: false, routerOn: false });
      },
      enabled: true,
    };
  }

  const video = phase === "check" ? "carve-checklist" : phase === "running" || phase === "paused" ? "carve-running" : phase === "toolchange" ? "carve-toolchange" : phase === "alarm" ? `alarm-${m.alarm}` : "carve-finishing";
  const caption = phase === "done" ? "Finished piece" : phase === "check" ? "Planned toolpath" : `Live · ${groups[curGroup]?.label ?? ""}`;
  const wp = workPos(m);
  const carved = m.carved;

  return (
    <>
      <Stage
        video={video}
        caption={caption}
        overlay={
          phase === "alarm" && A && !A.hold ? (
            <div style={{ position: "absolute", left: 24, right: 24, top: 76, zIndex: 3 }}>
              <Banner>Machine stopped. Nothing will move until you resolve it.</Banner>
            </div>
          ) : null
        }
        bottomLeft={
          phase === "running" || phase === "paused" ? (
            <div className="simbar">
              <span className="simbar__tag mono">Prototype · simulate</span>
              {(
                [
                  ["door", "Door open"],
                  ["limit", "Travel limit"],
                  ["estop", "E-stop"],
                  ["lost", "Position lost"],
                ] as [AlarmCode, string][]
              ).map(([k, l]) => (
                <button key={k} className="simbar__btn" onClick={() => m.raiseAlarm(k)}>
                  {l}
                </button>
              ))}
            </div>
          ) : null
        }
        render={(api) => {
          if (!b) return <div className="muted">Preparing the job…</div>;
          const oh = zoneOverhang(zones, b);
          const s = fitScale(api.size, b.width + 2 * oh.x, b.height + 2 * oh.y);
          if ((api.view === "3d" || phase === "done") && sim)
            return <ThreeView sim={sim} thickness={b.thickness} material={mat} board={{ width: b.width, height: b.height }} zoom={api.zoom} spin={api.spin + doneSpin} size={api.size} tabs={simTabs} />;
          const live = phase !== "check" && carved;
          return (
            <Board width={b.width} height={b.height} scale={s} zoom={api.zoom} label={`Board ${fmtN(b.width)} × ${fmtN(b.height)} mm`}>
              <div className={`job-face ${mat.grain ? "job-face--grain" : ""}`} style={{ background: mat.face }} />
              {live ? (
                <SimCanvas sim={{ x0: carved.x0, y0: carved.y0, cols: carved.cols, rows: carved.rows, res: carved.res, h: carved.h }} thickness={b.thickness} material={mat} scale={s} board={{ width: b.width, height: b.height }} tabs={simTabs} />
              ) : (
                <ToolpathOverlay segments={segs} width={b.width} height={b.height} scale={s} opacity={0.75} />
              )}
              {zones.length ? <KeepOutLayer zones={zones} scale={s} frame={{ width: b.width, height: b.height }} /> : null}
              {live && phase !== "done" ? (
                <>
                  <div className="live-bit" style={{ left: wp.x * s - 8, bottom: wp.y * s - 8 }} />
                  <div className="live-tag mono" style={{ left: wp.x * s + 14, bottom: wp.y * s + 6 }}>
                    X {wp.x.toFixed(1)} Y {wp.y.toFixed(1)} Z {wp.z.toFixed(1)}
                  </div>
                </>
              ) : null}
            </Board>
          );
        }}
      />
      <SidePanel
        title={title}
        sub={design.name}
        foot={
          <>
            {hint ? <div className="sidepanel__hint">{hint}</div> : null}
            {primary ? (
              <button className="btn btn--primary btn--lg" disabled={!primary.enabled} onClick={primary.click}>
                {primary.label}
              </button>
            ) : null}
            {secondary ? (
              <button className="btn btn--outline btn--lg" onClick={secondary.click}>
                {secondary.label} <span className="kbd">{secondary.kbd}</span>
              </button>
            ) : null}
          </>
        }
      >
        {phase === "check" ? (
          <>
            <div className="job-body">Everything below is checked automatically. Fix anything marked before starting.</div>
            <div className="checks">
              {checks.map((c, i) => (
                <div key={i} className={c.ok ? "check" : "check check--warn"}>
                  {c.ok ? (
                    <span className="num num--done">
                      <Check size={12} strokeWidth={2.5} />
                    </span>
                  ) : (
                    <AlertTriangle size={20} color="var(--paused)" strokeWidth={1.75} style={{ flex: "none" }} />
                  )}
                  {c.dial ? <Dial pos={c.dial} /> : null}
                  <span className="check__text">
                    <span className="check__label">{c.label}</span>
                    <span className="check__sub">{c.sub}</span>
                  </span>
                  {c.fix ? (
                    <button className="btn btn--light btn--sm" onClick={c.fix[1]}>
                      {c.fix[0]}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            {!zones.length ? (
              <div className="job-tip">
                <span>Tip: mark your clamps so CarvCAM can keep the bit away from them.</span>
                <button className="link" onClick={() => nav("/position")}>
                  Mark clamps
                </button>
              </div>
            ) : null}
            <div className="job-row job-row--box">
              <span>{toFix ? `${toFix} to fix` : "All checks passed"}</span>
              <span className="mono" style={{ color: "var(--text)" }}>
                {fmtMin(totalSec / 60)}
              </span>
            </div>
            <button className="btn btn--outline btn--sm job-sheet-btn" disabled={!result?.gcode} onClick={() => setSheetOpen(true)}>
              <Printer size={15} strokeWidth={1.75} />
              Print setup sheet
            </button>
            {sheetOpen ? <SetupSheetDialog ctx={ctx} onClose={() => setSheetOpen(false)} /> : null}
          </>
        ) : null}

        {phase === "running" || phase === "paused" ? (
          <>
            {phase === "paused" ? (
              <div className="job-paused">
                <Pause size={18} color="var(--paused)" strokeWidth={1.75} />
                <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ font: "500 15px var(--font)" }}>Paused at {Math.floor(progress * 100)}%</span>
                  <span className="small" style={{ color: "var(--text-2)", lineHeight: 1.45 }}>
                    The bit lifted 5 mm and stopped spinning. Your position is kept, so you can resume exactly where it stopped.
                  </span>
                </span>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span className="job-pct">{Math.floor(progress * 100)}%</span>
                  <span className="muted">{fmtMin(leftMin)} left</span>
                </div>
                <div role="progressbar" aria-valuenow={Math.floor(progress * 100)} aria-valuemin={0} aria-valuemax={100} className="bar">
                  <div className="bar__fill" style={{ width: `${progress * 100}%` }} />
                </div>
              </>
            )}
            <div>
              {groups.map((g, i) => {
                const done = i < curGroup;
                const now = i === curGroup;
                return (
                  <div key={i} className="job-op">
                    <span className="job-op__n">{done ? <Check size={14} strokeWidth={2.5} color="var(--ready-text)" /> : now ? <span className="dot-now" /> : i + 1}</span>
                    <span className="job-op__label" style={{ fontWeight: now ? 500 : 400, color: done ? "var(--text-3)" : undefined }}>
                      {g.label}
                    </span>
                    <span className="job-op__bit">{bitNameFor(design, g.tool)}</span>
                  </div>
                );
              })}
            </div>
            {phase === "running" ? (
              <>
                <label className="slider">
                  <span className="slider__head">
                    <span>Feed speed</span>
                    <span className="mono">{m.feedOverride}%</span>
                  </span>
                  <input type="range" min={50} max={150} step={5} value={m.feedOverride} onChange={(e) => m.setFeedOverride(+e.target.value)} aria-label="Feed speed" />
                  <span className="slider__ends mono">
                    <span>50% safer</span>
                    <span>150% max</span>
                  </span>
                </label>
                <label className="slider">
                  <span className="slider__head">
                    <span>Bit rotation</span>
                    <span className="mono">{rpmText((rpm * m.rpmOverride) / 100)}</span>
                  </span>
                  <input
                    type="range"
                    min={head.rpm[0]}
                    max={head.rpm[1]}
                    step={500}
                    value={Math.round((rpm * m.rpmOverride) / 100)}
                    onChange={(e) => m.setRpmOverride((+e.target.value / rpm) * 100)}
                    aria-label="Bit rotation"
                    disabled={!head.auto}
                  />
                  {!head.auto ? <span className="slider__ends">Set by hand on the Makita dial</span> : null}
                </label>
                {mode === "pro" ? (
                  <div className="console mono">
                    <div>
                      {"> "}G1 X{wp.x.toFixed(3)} Y{wp.y.toFixed(3)} Z{wp.z.toFixed(3)}
                    </div>
                    <div>ok · feed {m.feedOverride}% · rapid 100%</div>
                    <div>
                      {"< "}Run|MPos:{m.pos.x.toFixed(3)},{m.pos.y.toFixed(3)},{m.pos.z.toFixed(3)}|FS:{Math.round(((result?.params.main.feed ?? 1000) * m.feedOverride) / 100)},{Math.round((rpm * m.rpmOverride) / 100)}
                    </div>
                    <div>ok</div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="job-row job-row--box">
                <span>{groups[curGroup]?.label}</span>
                <span className="mono" style={{ color: "var(--text)" }}>
                  {fmtMin(leftMin)} left
                </span>
              </div>
            )}
          </>
        ) : null}

        {phase === "toolchange" ? (
          <>
            <div className="job-body">The first part is done. The machine moved to the front so you can reach the bit. {head.auto ? "The spindle stopped." : "The router must be off."}</div>
            <div className="illus">
              line illustration · two wrenches loosening the collet, {tcFrom} out, {tcTo} in
            </div>
            <div className="substeps">
              {tcSteps.map(([l, sb], i) => (
                <div key={i} className="substep">
                  <span className={`num ${i < tcStep ? "num--done" : i === tcStep ? "num--current" : ""}`}>{i < tcStep ? "✓" : i + 1}</span>
                  <span className="substep__text">
                    <span className="substep__label">{l}</span>
                    <span className="substep__sub">{sb}</span>
                  </span>
                </div>
              ))}
            </div>
            {probeLeft != null ? (
              <div role="status" className="mono job-live">
                Lowering… contact in {probeLeft.toFixed(1)} mm
              </div>
            ) : null}
            {tcStep === 1 && tcManual ? (
              <>
                <div className="zman">
                  <button className="jog__btn jog__btn--zh mono" aria-label="Raise bit (Z+)" onClick={() => m.jog(0, 0, tcJog)}>
                    <ArrowUp size={18} strokeWidth={1.75} />
                    Up
                  </button>
                  <button className="jog__btn jog__btn--zh mono" aria-label="Lower bit (Z−)" onClick={() => m.jog(0, 0, -tcJog)}>
                    <ArrowDown size={18} strokeWidth={1.75} />
                    Down
                  </button>
                </div>
                <Seg<string>
                  label="Z step"
                  value={String(tcJog)}
                  onChange={(v) => setTcJog(Number(v))}
                  options={[
                    ["0.01", <span className="mono">0.01 mm</span>],
                    ["0.1", <span className="mono">0.1 mm</span>],
                    ["1", <span className="mono">1 mm</span>],
                  ]}
                />
              </>
            ) : null}
            {tcStep === 1 && probeLeft == null ? (
              <button className="link" style={{ alignSelf: "flex-start", color: "var(--text-2)" }} onClick={() => setTcManual(!tcManual)}>
                {tcManual ? "Use the touch plate instead" : "No touch plate? Set Z by hand"}
              </button>
            ) : null}
          </>
        ) : null}

        {phase === "alarm" && A ? (
          <>
            <div role="alert" className={A.hold ? "alarm alarm--hold" : "alarm"}>
              <div className="alarm__kind">
                <OctagonAlert size={16} strokeWidth={1.75} />
                {A.kind}
              </div>
              <div className="alarm__title">{A.title}</div>
              <div className="alarm__why">{A.why}</div>
              <button className="alarm__code-btn" aria-expanded={codeOpen} onClick={() => setCodeOpen(!codeOpen)}>
                {codeOpen ? "Hide technical details" : "Show technical details"}
              </button>
              {codeOpen ? <div className="alarm__code mono">{A.code}</div> : null}
            </div>
            {resolving ? (
              <div>
                {A.steps.map(([l, action], i) => (
                  <div key={i} className="alarm-step">
                    <span className={`num ${i < alarmStep ? "num--done" : i === alarmStep ? "num--current" : ""}`}>{i < alarmStep ? "✓" : i + 1}</span>
                    <span style={{ flex: 1, font: "400 14px/1.4 var(--font)", color: "#E4E1DB" }}>{l}</span>
                    {i === alarmStep ? (
                      <button
                        className="btn btn--outline btn--sm"
                        onClick={() => {
                          if (action === "Find home") toast("Home found. Position is known again.");
                          if (action === "Test contact") toast("Contact detected. The plate is working.");
                          setAlarmStep(i + 1);
                        }}
                      >
                        {action}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : null}

        {phase === "done" ? (
          <>
            <div className="job-body">
              “{design.name}” is carved. It took {fmtMin((job?.total ?? totalSec) / 60)} with {twoBits ? "one bit change" : "no bit changes"}.
            </div>
            <div className="stats3">
              <div className="stat">
                <span className="stat__k">Time</span>
                <span className="stat__v mono">{fmtMin((job?.total ?? totalSec) / 60)}</span>
              </div>
              <div className="stat">
                <span className="stat__k">Operations</span>
                <span className="stat__v mono">{groups.length}</span>
              </div>
              <div className="stat">
                <span className="stat__k">Bits</span>
                <span className="stat__v mono">{twoBits ? 2 : 1}</span>
              </div>
            </div>
            <div className="finish">
              <div style={{ font: "600 16px var(--font)" }}>{ctx.hasProfile ? "Piece done: cut the tabs and sand the edges" : "Piece done: clean up and sand"}</div>
              <div className="illus">line illustration · flush-cut saw through a tab, then sanding block along the edge</div>
              <ol className="finish__steps">
                <li>Vacuum the dust, then lift the board off the bed.</li>
                <li>{ctx.hasProfile && ctx.tabs ? `Cut the ${ctx.tabs} tab${ctx.tabs === 1 ? "" : "s"} (${design.tabs.width ?? 6} mm wide, the amber marks on the preview) with a flush-cut saw or a utility knife and pop the piece out.` : ctx.hasProfile ? "Peel the piece off the tape." : "Unclamp the board."}</li>
                <li>Sand the edges and the tab marks with 120, then 220 grit.</li>
              </ol>
            </div>
            <div style={{ display: "flex", gap: 16 }}>
              <button
                className="link"
                style={{ color: "var(--text-2)" }}
                onClick={() => {
                  m.reset();
                  newBlank();
                  nav("/create");
                }}
              >
                New project
              </button>
              <button
                className="link"
                style={{ color: "var(--text-2)" }}
                onClick={() => {
                  m.reset();
                  nav("/workshop");
                }}
              >
                Back to First cuts
              </button>
            </div>
          </>
        ) : null}
      </SidePanel>
    </>
  );
}

/** Makita dial with the setting highlighted (1 to 6). */
function Dial({ pos }: { pos: number }) {
  return (
    <div aria-hidden="true" className="dial">
      {[1, 2, 3, 4, 5, 6].map((n) => {
        const a = ((-210 + n * 40) * Math.PI) / 180;
        return (
          <span key={n} className={n === pos ? "dial__tick dial__tick--on" : "dial__tick"} style={{ left: 26 + Math.cos(a) * 17 - 8, top: 26 + Math.sin(a) * 17 - 8 }}>
            {n}
          </span>
        );
      })}
    </div>
  );
}

function upper(a: number[], v: number) {
  let lo = 0;
  let hi = a.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return Math.max(0, lo);
}

const fmtN = (n: number) => String(Math.round(n * 10) / 10);
