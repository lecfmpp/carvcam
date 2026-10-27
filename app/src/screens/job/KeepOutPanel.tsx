import type { GenerateResult, KeepOutZone } from "@carvcam/cam-engine";
import { PenLine, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Issue } from "../../components/ui";
import { useDesign } from "../../state/design";
import { newZone, NO_ZONES, setZoneField, zoneIssues } from "./zones";

/** Number field that commits on blur or Enter (so typing "1" on the way to "12" doesn't regenerate). */
export function NumField(props: { label: string; value: number | undefined; unit?: string; onCommit(raw: string): void; placeholder?: string; step?: number; width?: number }) {
  const [text, setText] = useState(props.value === undefined ? "" : String(props.value));
  useEffect(() => setText(props.value === undefined ? "" : String(props.value)), [props.value]);
  return (
    <label className="numfield">
      <span className="numfield__k">{props.label}</span>
      <span className="numfield__box">
        <input
          inputMode="decimal"
          value={text}
          placeholder={props.placeholder}
          aria-label={props.label}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => props.onCommit(text)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setText(props.value === undefined ? "" : String(props.value));
          }}
        />
        {props.unit ? <span className="numfield__unit">{props.unit}</span> : null}
      </span>
    </label>
  );
}

/**
 * "Clamps & keep-out zones" (Position step): list, numeric fields for the selected zone, and the
 * engine's keep-out errors. Free: safety is never paid.
 */
export function KeepOutPanel(props: {
  stock: { width: number; height: number };
  result: GenerateResult | null;
  selected: number | null;
  onSelect(i: number | null): void;
  drawing: boolean;
  onDrawing(on: boolean): void;
}) {
  const nav = useNavigate();
  const zones = useDesign((s) => s.design.keepOut) ?? NO_ZONES;
  const setKeepOut = useDesign((s) => s.setKeepOut);
  const issues = zoneIssues(props.result, zones);
  const sel = props.selected != null && zones[props.selected] ? props.selected : null;
  const z = sel != null ? zones[sel] : null;
  const editRef = useRef<HTMLDivElement>(null);
  // Selecting a zone on the preview brings its fields into view.
  useEffect(() => {
    if (sel != null) editRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [sel]);

  const add = () => {
    const nz = newZone(zones, props.stock);
    setKeepOut([...zones, nz]);
    props.onSelect(zones.length);
  };
  const update = (i: number, next: KeepOutZone) => setKeepOut(zones.map((q, k) => (k === i ? next : q)));
  const remove = (i: number) => {
    setKeepOut(zones.filter((_, k) => k !== i));
    props.onSelect(null);
  };

  return (
    <section className="job-sec ko-sec" aria-label="Clamps and keep-out zones">
      <div className="ko-sec__head">
        <span className="job-label">Clamps &amp; keep-out zones</span>
        <span className="tiny muted">{zones.length ? `${zones.length} marked` : "Optional"}</span>
      </div>
      <div className="job-note">Mark where your clamps or screws sit. CarvCAM keeps the bit out of them and travels over them at a safe height.</div>

      {issues.map((it, i) => (
        <Issue
          key={i}
          kind="error"
          eyebrow="Error · blocks carving"
          title={it.title}
          body={it.body}
          actions={
            <>
              {it.zoneIndex != null ? (
                <button className="btn btn--light btn--sm" onClick={() => props.onSelect(it.zoneIndex!)}>
                  Select zone
                </button>
              ) : null}
              <button className="btn btn--outline btn--sm" onClick={() => nav("/create")}>
                Move design
              </button>
            </>
          }
        />
      ))}

      {zones.length ? (
        <div className="ko-list">
          {zones.map((q, i) => (
            <button key={q.id ?? i} className="ko-item" aria-pressed={sel === i} onClick={() => props.onSelect(sel === i ? null : i)}>
              <span className={`ko-swatch${issues.some((it) => it.zoneIndex === i) ? " ko-swatch--bad" : ""}`} aria-hidden />
              <span className="ko-item__name">{q.label ?? `Zone ${i + 1}`}</span>
              <span className="ko-item__dims mono">
                {q.width} × {q.height} · {q.clearance ?? 20} mm tall
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {z && sel != null ? (
        <div className="ko-edit" ref={editRef}>
          <div className="ko-edit__row">
            <input className="ko-name" value={z.label ?? ""} aria-label="Zone name" placeholder={`Clamp ${sel + 1}`} onChange={(e) => update(sel, { ...z, label: e.target.value })} />
            <button className="btn btn--quiet btn--sm" aria-label={`Delete ${z.label ?? "zone"}`} onClick={() => remove(sel)}>
              <Trash2 size={15} strokeWidth={1.75} />
              Delete
            </button>
          </div>
          <div className="ko-grid">
            <NumField label="X" unit="mm" value={z.x} onCommit={(v) => update(sel, setZoneField(z, "x", v))} />
            <NumField label="Y" unit="mm" value={z.y} onCommit={(v) => update(sel, setZoneField(z, "y", v))} />
            <NumField label="Width" unit="mm" value={z.width} onCommit={(v) => update(sel, setZoneField(z, "width", v))} />
            <NumField label="Depth" unit="mm" value={z.height} onCommit={(v) => update(sel, setZoneField(z, "height", v))} />
            <NumField label="Clamp height" unit="mm" value={z.clearance ?? 20} onCommit={(v) => update(sel, setZoneField(z, "clearance", v))} />
          </div>
          <div className="job-fine">X/Y = bottom-left corner of the zone, from work zero (bottom-left of the board). Height = how far it sticks up above the board.</div>
        </div>
      ) : null}

      <div className="ko-actions">
        <button className="btn btn--outline btn--sm" onClick={add}>
          <Plus size={15} strokeWidth={1.75} />
          Add clamp
        </button>
        <button className="btn btn--outline btn--sm" aria-pressed={props.drawing} onClick={() => props.onDrawing(!props.drawing)} style={props.drawing ? { borderColor: "var(--text)", background: "rgba(255,255,255,.1)" } : undefined}>
          <PenLine size={15} strokeWidth={1.75} />
          {props.drawing ? "Drag on the board…" : "Draw a zone"}
        </button>
      </div>
    </section>
  );
}
