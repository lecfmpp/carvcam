import { AlertCircle, AlertTriangle, Check, ChevronDown, Info, Play, XCircle } from "lucide-react";
import { useCallback, useState, type ReactNode } from "react";
import { VIDEOS } from "../lib/videos";
import { useUi } from "../state/ui";
import { VideoTheater } from "./VideoTheater";

/** Segmented control (Top/3D, Simple/Pro, Whole bed/Custom area…). */
export function Seg<T extends string>(props: { options: [T, ReactNode][]; value: T; onChange(v: T): void; label: string; size?: "lg"; style?: React.CSSProperties }) {
  return (
    <div role="group" aria-label={props.label} className={`seg ${props.size === "lg" ? "seg--lg" : ""}`} style={props.style}>
      {props.options.map(([v, label]) => (
        <button key={v} className="seg__opt" aria-pressed={props.value === v} onClick={() => props.onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

/** Number field with − and +. */
export function Stepper(props: { value: number; onChange(v: number): void; step?: number; min?: number; max?: number; unit?: string; label: string; format?(v: number): string }) {
  const { value, step = 1, min = -Infinity, max = Infinity } = props;
  const set = (v: number) => props.onChange(Math.round(Math.max(min, Math.min(max, v)) * 1000) / 1000);
  return (
    <div className="stepper" role="group" aria-label={props.label}>
      <button aria-label={`Decrease ${props.label}`} onClick={() => set(value - step)} disabled={value <= min}>
        −
      </button>
      <span className="stepper__val">
        {props.format ? props.format(value) : value}
        {props.unit ? ` ${props.unit}` : ""}
      </span>
      <button aria-label={`Increase ${props.label}`} onClick={() => set(value + step)} disabled={value >= max}>
        +
      </button>
    </div>
  );
}

/** Glass side panel on the right, with header, scrollable body and fixed footer. */
export function SidePanel(props: { title: ReactNode; sub?: ReactNode; children: ReactNode; foot?: ReactNode; headExtra?: ReactNode }) {
  return (
    <aside className="sidepanel">
      <div className="sidepanel__head">
        <h2 className="sidepanel__title">{props.title}</h2>
        {props.headExtra ?? (props.sub ? <span className="sidepanel__sub">{props.sub}</span> : null)}
      </div>
      <div className="sidepanel__body">{props.children}</div>
      {props.foot ? <div className="sidepanel__foot">{props.foot}</div> : null}
    </aside>
  );
}

function youtubeId(url: string) {
  return /(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/.exec(url)?.[1] ?? null;
}
function toSec(s: string) {
  return s ? s.split(":").map(Number).reduce((a, c) => a * 60 + (c || 0), 0) : 0;
}

/** Video for a step, when there is one: start time, end time and the YouTube id. */
export function videoFor(id: string | undefined) {
  const v = id ? VIDEOS[id] : undefined;
  const yt = v ? youtubeId(v.url) : null;
  if (!v || !yt) return null;
  let sec = toSec(v.start);
  if (!sec) sec = Number(/[?&]t=(\d+)/.exec(v.url)?.[1] ?? 0);
  const ts = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  const end = v.end ? toSec(v.end) : 0;
  const range = `${ts}${end > sec ? `–${v.end}` : ""}`;
  return { title: v.title, yt, range, src: `https://www.youtube-nocookie.com/embed/${yt}?start=${sec}${end > sec ? `&end=${end}` : ""}&autoplay=1&rel=0&modestbranding=1` };
}

/**
 * "Watch how" button that sits on the canvas, next to the assistant bar: opens the step's YouTube
 * video in theater mode. Steps without a video show nothing.
 */
export function VideoChip({ id }: { id: string }) {
  const v = videoFor(id);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  if (!v) return null;
  return (
    <>
      <button className="video-chip" onClick={() => setOpen(true)} aria-haspopup="dialog" title={`Watch how: ${v.title} (${v.range})`}>
        <span className="video-chip__thumb" style={{ backgroundImage: `url(https://img.youtube.com/vi/${v.yt}/mqdefault.jpg)` }}>
          <span className="video__play">
            <Play size={11} fill="currentColor" />
          </span>
        </span>
        <span className="video-chip__text">
          <span className="tiny muted">Watch how · {v.range}</span>
          <span className="video-chip__title">{v.title}</span>
        </span>
      </button>
      {open ? <VideoTheater title={v.title} range={v.range} src={v.src} onClose={close} /> : null}
    </>
  );
}

/**
 * One numbered section of a side panel (accordion). Only the open one shows its content, so the
 * panel fits without scrolling; the closed ones show a one-line summary.
 */
export function AccItem(props: { n: number; title: ReactNode; summary?: ReactNode; open: boolean; done?: boolean; onToggle?(): void; children?: ReactNode; aside?: ReactNode }) {
  const head = (
    <>
      <span className={`acc__num ${props.done && !props.open ? "acc__num--done" : ""}`} aria-hidden>
        {props.done && !props.open ? <Check size={13} strokeWidth={3} /> : props.n}
      </span>
      <span className="acc__text">
        <span className="acc__title">{props.title}</span>
        {props.summary ? <span className="acc__sum">{props.summary}</span> : null}
      </span>
      {props.aside}
      {props.onToggle ? <ChevronDown size={16} className="acc__chev" aria-hidden /> : null}
    </>
  );
  return (
    <section className={`acc ${props.open ? "is-open" : ""}`}>
      {props.onToggle ? (
        <button className="acc__head" aria-expanded={props.open} onClick={props.onToggle}>
          {head}
        </button>
      ) : (
        <div className="acc__head">{head}</div>
      )}
      {props.open && props.children ? <div className="acc__body">{props.children}</div> : null}
    </section>
  );
}

/** Error, warning or info card, with actions ("Apply suggestion"…). */
export function Issue(props: { kind: "error" | "warning" | "info"; eyebrow: string; title: ReactNode; body?: ReactNode; fix?: ReactNode; actions?: ReactNode; onFocus?(): void }) {
  const Icon = props.kind === "error" ? XCircle : props.kind === "warning" ? AlertTriangle : Info;
  const color = props.kind === "error" ? "var(--alarm-text)" : props.kind === "warning" ? "var(--paused)" : "var(--text-3)";
  return (
    <div className={`issue issue--${props.kind}`} onMouseEnter={props.onFocus} role={props.kind === "error" ? "alert" : undefined}>
      <Icon size={18} color={color} style={{ flex: "none", marginTop: 1 }} strokeWidth={1.5} />
      <div style={{ minWidth: 0 }}>
        <div className="issue__eyebrow">{props.eyebrow}</div>
        <p className="issue__title">{props.title}</p>
        {props.body ? <p className="issue__body">{props.body}</p> : null}
        {props.fix ? <div className="issue__fix">→ {props.fix}</div> : null}
        {props.actions ? <div className="issue__actions">{props.actions}</div> : null}
      </div>
    </div>
  );
}

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function Banner(props: { children: ReactNode }) {
  return (
    <div role="alert" style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 12, border: "1px solid rgba(242,107,94,.45)", background: "rgba(242,107,94,.1)", color: "var(--alarm-text)", font: "500 14px var(--font)" }}>
      <AlertCircle size={18} strokeWidth={1.5} />
      {props.children}
    </div>
  );
}
