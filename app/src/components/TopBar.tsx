import { AccountChip } from "../account/AccountChip";
import { Brand } from "./Brand";
import { Check, ChevronDown, Maximize, Menu, Minimize, Monitor, Plus, Square } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { machineById, machineName, HEADS } from "../lib/catalog";
import { usePanelMode } from "../lib/panel";
import { useMachine } from "../machine/store";
import { openConnect } from "../state/ui";
import { useActiveMachine, useWorkshop } from "../state/workshop";
import { Seg } from "./ui";

export type JobStep = "create" | "prepare" | "position" | "carve";
const STEPS: [JobStep, string][] = [
  ["create", "Create"],
  ["prepare", "Prepare"],
  ["position", "Position"],
  ["carve", "Carve"],
];
const FILL: Record<JobStep, number> = { create: 16, prepare: 40, position: 64, carve: 88 };

/**
 * App header. Variants:
 * - "app": workshop navigation (First cuts / My bits / Settings)
 * - "job": the 4 steps Create → Carve, Simple/Pro mode
 * - "tool": breadcrumb for a tool (e.g. Tools › Surface the bed)
 * - "onboarding": first-run steps (content comes in `center`)
 */
export function TopBar(props: { variant: "app" | "job" | "tool" | "onboarding"; step?: JobStep; reachable?: JobStep[]; center?: ReactNode; right?: ReactNode; crumbs?: string[] }) {
  const nav = useNavigate();
  const loc = useLocation();
  const { mode, setMode } = useWorkshop();
  const status = useMachine((s) => s.status);
  const connected = status !== "disconnected" && status !== "connecting";

  return (
    <header className="topbar" style={props.variant === "app" || props.variant === "onboarding" ? { paddingLeft: 20 } : undefined}>
      {props.variant === "job" ? (
        <button className="icon-btn" aria-label="Menu: First cuts, My bits, Settings" onClick={() => nav("/workshop")}>
          <Menu size={20} strokeWidth={1.5} />
        </button>
      ) : null}
      <div className="topbar__brand">
        <Brand size={28} />
      </div>

      {props.variant === "app" ? (
        <nav aria-label="Main" className="navtabs" style={{ marginLeft: 20 }}>
          {[
            ["/workshop", "First cuts"],
            ["/workshop/bits", "My bits"],
            ["/workshop/settings", "Settings"],
          ].map(([to, label]) => (
            <button key={to} className="navtab" aria-current={loc.pathname === to ? "page" : undefined} onClick={() => nav(to)}>
              {label}
            </button>
          ))}
        </nav>
      ) : null}

      {props.variant === "tool" ? (
        <nav aria-label="Breadcrumb" style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, font: "500 14px var(--font)" }}>
          {props.crumbs?.map((c, i) => (
            <span key={c} style={{ color: i === props.crumbs!.length - 1 ? "var(--text)" : "var(--text-3)" }}>
              {i > 0 ? <span style={{ color: "var(--text-4)", marginRight: 8 }}>›</span> : null}
              {c}
            </span>
          ))}
        </nav>
      ) : null}

      {props.variant === "onboarding" ? <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>{props.center}</div> : null}

      {props.variant === "job" && props.step ? <JobSteps step={props.step} reachable={props.reachable ?? []} /> : null}

      {props.variant === "job" ? (
        <Seg<"simple" | "pro">
          label="Interface mode"
          value={mode}
          onChange={setMode}
          options={[
            ["simple", "Simple"],
            ["pro", "Pro"],
          ]}
        />
      ) : null}

      {props.right}
      <FullscreenButton />
      {props.variant !== "onboarding" ? (
        <>
          <AccountChip className={props.variant === "job" ? "acct-chip--job" : undefined} />
          <MachineChip />
          <StatusPill />
          {connected ? <StopButton /> : null}
        </>
      ) : null}
    </header>
  );
}

function JobSteps({ step, reachable }: { step: JobStep; reachable: JobStep[] }) {
  const nav = useNavigate();
  const idx = STEPS.findIndex(([s]) => s === step);
  const progress = useMachine((s) => (s.job && s.status !== "idle" ? s.elapsed / Math.max(1, s.job.total) : 0));
  const fill = step === "carve" ? FILL.carve - 10 + 10 * progress : FILL[step];
  return (
    <nav aria-label="Steps" className="steps">
      <div className="steps__row">
        {STEPS.map(([s, label], i) => {
          const cls = i === idx ? "step step--current" : i < idx ? "step step--done" : "step";
          const can = i < idx || reachable.includes(s);
          return (
            <button key={s} className={cls} aria-current={i === idx ? "step" : undefined} disabled={!can && i !== idx} onClick={() => can && nav(`/${s}`)}>
              <span className="step__dot">{i < idx ? <Check size={12} strokeWidth={2} /> : i + 1}</span>
              {label}
            </button>
          );
        })}
        <div className="steps__track" />
        <div className="steps__fill" style={{ width: `${fill}%` }} />
      </div>
    </nav>
  );
}

/** Active machine chip; opens the machine switcher. */
export function MachineChip() {
  const { machine, head } = useActiveMachine();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="machine-chip" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)} title="Switch machine">
        <Monitor size={16} strokeWidth={1.5} color="var(--text-3)" />
        {machineName(machine)} · {head.name.replace("Makita RT0701", "Makita").replace("AutoSpin T1", "AutoSpin")}
        <ChevronDown size={14} color="var(--text-3)" />
      </button>
      {open ? <MachineSwitcher onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function MachineSwitcher({ onClose }: { onClose(): void }) {
  const { machines, active, setActive } = useWorkshop();
  const status = useMachine((s) => s.status);
  const busy = status === "running" || status === "paused" || status === "toolchange";
  const nav = useNavigate();
  return (
    <div role="dialog" aria-label="Switch machine" className="popover" style={{ right: 0, top: 48, width: 360 }}>
      <div className="tiny muted" style={{ padding: "6px 12px 8px" }}>
        {busy ? "Finish or stop the carve to switch machines" : "Your machines"}
      </div>
      {machines.map((m, i) => {
        const mm = machineById(m.id);
        return (
          <button
            key={i}
            role="menuitemradio"
            aria-checked={i === active}
            className="menu-item"
            disabled={busy}
            onClick={() => {
              setActive(i);
              onClose();
            }}
          >
            <Monitor size={18} strokeWidth={1.5} color="var(--text-3)" />
            <span style={{ flex: 1 }}>
              <div style={{ font: "500 14px var(--font)" }}>{machineName(mm)}</div>
              <div className="tiny muted">
                {HEADS[m.head].name} · {Math.round(mm.area[0] / 10)} × {Math.round(mm.area[1] / 10)} cm
              </div>
            </span>
            {i === active ? <Check size={16} color="var(--ready)" /> : null}
          </button>
        );
      })}
      <div style={{ height: 1, background: "var(--line)", margin: "8px 0" }} />
      <button
        className="menu-item"
        onClick={() => {
          onClose();
          nav("/workshop/onboarding?add=1");
        }}
      >
        <Plus size={18} strokeWidth={1.5} color="var(--text-3)" />
        Add a machine
      </button>
      <button
        className="menu-item"
        onClick={() => {
          onClose();
          nav("/workshop/settings");
        }}
      >
        <Square size={18} strokeWidth={1.5} color="var(--text-3)" />
        Settings › My machine
      </button>
    </div>
  );
}

/** Machine status: always color + shape + text. */
export function StatusPill() {
  const s = useMachine();
  const { machine } = useActiveMachine();
  const pct = s.job ? Math.round((100 * s.elapsed) / Math.max(1, s.job.total)) : 0;
  const map: Record<string, [string, ReactNode]> = {
    disconnected: ["", "Not connected"],
    connecting: ["pill--running", "Connecting…"],
    idle: ["pill--ready", <>Ready <span style={{ color: "var(--text-3)" }}>{machineName(machine)}</span></>],
    homing: ["pill--running", "Finding home"],
    running: ["pill--running", <>Carving <span style={{ opacity: 0.8 }}>{pct}%</span></>],
    paused: ["pill--paused", <>Paused <span style={{ opacity: 0.8 }}>{pct}%</span></>],
    toolchange: ["pill--paused", "Change bit"],
    alarm: ["pill--alarm", "Alarm"],
    done: ["pill--ready", "Done"],
  };
  const [cls, label] = map[s.status];
  // Disconnected: the badge becomes a shortcut to the connection wizard.
  if (s.status === "disconnected")
    return (
      <button className={`pill pill--button ${cls}`} onClick={openConnect} title="Connect your machine">
        <span className="pill__dot" />
        {label} · Connect
      </button>
    );
  return (
    <div role="status" className={`pill ${cls}`}>
      <span className="pill__dot" />
      {label}
    </div>
  );
}

/** Stop: always visible while the machine is connected. Shortcuts: Esc stops, Space pauses/resumes. */
export function StopButton() {
  const stop = useMachine((s) => s.stop);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest("input, textarea, [contenteditable=true]");
      if (e.key === "Escape") {
        const st = useMachine.getState().status;
        if (st === "running" || st === "paused" || st === "toolchange" || st === "homing") useMachine.getState().stop();
      }
      if (e.code === "Space" && !typing) {
        const m = useMachine.getState();
        if (m.status === "running") {
          e.preventDefault();
          m.pause();
        } else if (m.status === "paused") {
          e.preventDefault();
          m.resume();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <button className="stop-btn" onClick={stop} aria-keyshortcuts="Escape">
      <span style={{ width: 12, height: 12, borderRadius: 2, background: "var(--alarm)" }} />
      Stop <span className="kbd">Esc</span>
    </button>
  );
}

/** Full screen (Panel mode only): on gControl, the app fills the whole screen, like a kiosk. */
function FullscreenButton() {
  const panel = usePanelMode();
  const [full, setFull] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  if (!panel || !document.fullscreenEnabled) return null;
  return (
    <button
      className="icon-btn"
      aria-label={full ? "Exit full screen" : "Full screen"}
      title={full ? "Exit full screen" : "Full screen"}
      onClick={() => (full ? document.exitFullscreen() : document.documentElement.requestFullscreen())}
    >
      {full ? <Minimize size={20} strokeWidth={1.5} /> : <Maximize size={20} strokeWidth={1.5} />}
    </button>
  );
}
