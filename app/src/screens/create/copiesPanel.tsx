import { copiesGrid as grid, type PlateSpecInput } from "@carvcam/cam-engine";
import { Grid3x3, Maximize2, Unlink, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Stepper } from "../../components/ui";
import { bitById, machineName } from "../../lib/catalog";
import { useDesign } from "../../state/design";
import { toast } from "../../state/ui";
import { useActiveMachine } from "../../state/workshop";
import { copiesOf, copyCount, detachCopies, elementOf, groupBox, margin, moveElement, setCopies, type Box, type Copies, type ElementId } from "./elements";

/**
 * "Make copies" for the selection: a floating panel, not a modal. Every change goes straight into
 * the design, so the board shows the real copies (made by the engine) while the person adjusts.
 * Cancel goes back to the design as it was when the panel opened.
 */
export function CopiesPanel({ ids, boxes, onClose }: { ids: ElementId[]; boxes: Map<ElementId, Box>; onClose(): void }) {
  const design = useDesign((s) => s.design);
  const patchSpec = useDesign((s) => s.patchSpec);
  const { machine } = useActiveMachine();
  // Design and boxes from when the panel opened: everything is worked out from them.
  const start = useRef<{ spec: PlateSpecInput; boxes: Map<ElementId, Box> }>({ spec: design.spec, boxes: new Map(boxes) });
  const spec0 = start.current.spec;
  const g0 = useMemo(() => groupBox(ids, start.current.boxes), [ids]);
  const existing = ids.map((id) => copiesOf(spec0, id)).find((c) => c && copyCount(c) > 1);
  // Parts that are cut out need room between them for the cut (two bit widths).
  const cutsThrough = ids.some((id) => {
    const mode = (elementOf(spec0, id) as { mode?: string } | null)?.mode;
    return mode === "part" || mode === "cutout";
  });
  const cutBit = bitById(design.useBit2 && design.bit2 ? design.bit2 : design.bit);
  const minGap = cutsThrough ? Math.max(2, Math.ceil((cutBit?.d ?? 3.175) * 2)) : 0;

  const [rows, setRows] = useState(existing?.rows ?? 2);
  const [cols, setCols] = useState(existing?.cols ?? 3);
  const [gapX, setGapX] = useState(() => (existing && g0 ? round(existing.dx! - (g0.x1 - g0.x0)) : Math.max(minGap, 6)));
  const [gapY, setGapY] = useState(() => (existing && g0 ? round(existing.dy! - (g0.y1 - g0.y0)) : Math.max(minGap, 6)));
  const [alt, setAlt] = useState(existing?.alternate ?? false);
  const [move, setMove] = useState({ dx: 0, dy: 0 });
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const textIds = ids.filter((id) => id.startsWith("t:"));
  const textId = textIds.length === 1 ? textIds[0] : null;
  const text0 = textId ? spec0.texts?.[Number(textId.slice(2))] : undefined;
  const [names, setNames] = useState<string>(() => (text0 ? [text0.content, ...(text0.copies?.texts ?? [])].join("\n") : ""));

  const n = rows * cols;
  const g = g0 ? { x0: g0.x0 + move.dx, x1: g0.x1 + move.dx, y0: g0.y0 + move.dy, y1: g0.y1 + move.dy } : null;
  const W = size?.w ?? spec0.width;
  const H = size?.h ?? spec0.height;
  const board = spec0.type === "lettering" ? "board" : "sign";
  const hasRelief = [...(spec0.texts ?? []), ...(spec0.shapes ?? []), ...(spec0.icons ?? []), ...(spec0.svgs ?? [])].some((e) => (e.mode ?? "") === "relief");
  const border = hasRelief && (spec0.frame ?? 6) > 0 ? (spec0.frame ?? 6) : 1;
  const area = grid.usableArea(W, H, border);
  const step = g ? grid.pitch(g, gapX, gapY) : { dx: 0, dy: 0 };
  const fits = g ? grid.gridFits(g, area, rows, cols, step.dx, step.dy) : false;
  const here = g ? grid.maxFromGroup(g, area, step.dx, step.dy) : { rows: 1, cols: 1 };
  const total = g ? grid.gridSize(g, rows, cols, step.dx, step.dy) : { width: 0, height: 0 };
  // Biggest board the machine takes (with the outer cut's margin, if any).
  const m2 = 2 * margin(spec0);
  const maxW = machine.area[0] - m2;
  const maxH = machine.area[1] - m2;
  const pad = Math.max(border, 6);
  // Never shrinks the board: only the side that is too small grows.
  const needW = Math.max(spec0.width, round(total.width + 2 * pad));
  const needH = Math.max(spec0.height, round(total.height + 2 * pad));
  const canGrow = needW <= maxW && needH <= maxH;

  // Applies everything on top of the starting design on each change (the engine regenerates and the board shows it).
  useEffect(() => {
    if (!g0 || !g) return;
    let s: PlateSpecInput = structuredClone(spec0);
    if (size) s = { ...s, width: size.w, height: size.h };
    if (move.dx || move.dy)
      for (const id of ids) {
        const b = start.current.boxes.get(id);
        if (b) s = moveElement(s, id, b.cx + move.dx, b.cy + move.dy, b);
      }
    const lines = names.split("\n").map((x) => x.trim());
    const c: Copies = { rows, cols, dx: step.dx, dy: step.dy, alternate: alt, pivot: { x: round((g.x0 + g.x1) / 2), y: round((g.y0 + g.y1) / 2) } };
    s = setCopies(s, ids, c);
    if (textId && text0) {
      const i = Number(textId.slice(2));
      const own = lines.slice(1, n).map((x) => (x === text0.content ? "" : x));
      while (own.length && !own[own.length - 1]) own.pop();
      s = { ...s, texts: s.texts?.map((t, k) => (k === i ? { ...t, content: lines[0] || text0.content, copies: t.copies ? { ...t.copies, texts: own.length ? own : undefined } : undefined } : t)) };
    }
    patchSpec(() => s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, cols, gapX, gapY, alt, move.dx, move.dy, size?.w, size?.h, names]);

  const cancel = () => {
    patchSpec(() => start.current.spec);
    onClose();
  };
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      cancel();
    };
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  });

  const fill = () => {
    if (!g0) return;
    const r = grid.fillArea(g0, area, step.dx, step.dy);
    if (!r) return toast(`The selection is bigger than the ${board}.`);
    setRows(r.rows);
    setCols(r.cols);
    setMove(r.move);
    toast(`${r.rows * r.cols} copies fill the ${board}.`);
  };
  const grow = () => {
    if (!g0) return;
    const w = needW;
    const h = needH;
    setSize({ w, h });
    // The group goes to the top-left corner; the grid grows to the right and down.
    setMove({ dx: round(pad - g0.x0), dy: round(h - pad - g0.y1) });
  };
  const remove = () => {
    patchSpec(() => setCopies(start.current.spec, ids, null));
    toast("Copies removed.");
    onClose();
  };
  const detach = () => {
    const out = detachCopies(useDesign.getState().design.spec, ids, start.current.boxes);
    if ("error" in out) return toast(out.error);
    patchSpec(() => out);
    toast("Copies separated. Each one can now be edited on its own.");
    onClose();
  };

  if (!g0) return null;
  return createPortal(
    <div className="copies-pop" role="dialog" aria-label="Make copies" onPointerDown={(e) => e.stopPropagation()}>
      <div className="copies-pop__head">
        <Grid3x3 size={16} strokeWidth={1.75} />
        <h3>Make copies</h3>
        <span className="tiny muted">{ids.length > 1 ? `${ids.length} elements` : "1 element"}</span>
        <button className="create-modal__close" aria-label="Cancel" onClick={cancel}>
          <X size={16} />
        </button>
      </div>
      <div className="copies-pop__body">
        <div className="copies-pop__two">
          <Row label="Rows">
            <Stepper label="Rows" value={rows} min={1} max={40} onChange={setRows} />
          </Row>
          <Row label="Columns">
            <Stepper label="Columns" value={cols} min={1} max={40} onChange={setCols} />
          </Row>
        </div>
        <div className="copies-pop__two">
          <Row label="Gap across">
            <Stepper label="Gap across" value={gapX} min={minGap} max={200} step={1} unit="mm" onChange={setGapX} />
          </Row>
          <Row label="Gap down">
            <Stepper label="Gap down" value={gapY} min={minGap} max={200} step={1} unit="mm" onChange={setGapY} />
          </Row>
        </div>
        <label className="copies-pop__check">
          <input type="checkbox" checked={alt} onChange={(e) => setAlt(e.target.checked)} />
          Turn every other copy 180° <span className="tiny muted">(nests hearts, triangles, letters)</span>
        </label>
        {textId && n > 1 ? (
          <Row label="Text on each copy" aside={<span className="tiny muted">One per line · empty = same</span>}>
            <textarea className="create-input copies-pop__names" rows={Math.min(6, n)} value={names} onChange={(e) => setNames(e.target.value)} aria-label="Text on each copy" />
          </Row>
        ) : null}
        <div className={`copies-pop__status ${fits ? "is-ok" : "is-bad"}`} aria-live="polite">
          {n} {n === 1 ? "piece" : "pieces"} · {fmt(total.width)} × {fmt(total.height)} mm
          <br />
          {fits ? (
            <span>
              Fits on the {fmt(W)} × {fmt(H)} mm {board}.
            </span>
          ) : (
            <span>
              Runs past the edge. From here, up to {here.rows} × {here.cols} fit.
            </span>
          )}
        </div>
        <div className="copies-pop__actions">
          <button className="btn btn--outline btn--sm" onClick={fill} title={`As many as fit, centered on the ${board}`}>
            <Grid3x3 size={14} /> Fill the {board}
          </button>
          {!fits ? (
            <button className="btn btn--outline btn--sm" disabled={!canGrow} onClick={grow} title={canGrow ? `Make it ${fmt(needW)} × ${fmt(needH)} mm` : `Your ${machineName(machine)} takes up to ${fmt(maxW)} × ${fmt(maxH)} mm`}>
              <Maximize2 size={14} /> {canGrow ? `${board === "sign" ? "Sign" : "Board"} ${fmt(needW)} × ${fmt(needH)} mm` : `Too big for your ${machineName(machine)}`}
            </button>
          ) : null}
        </div>
        <div className="tiny muted">Copies stay linked: change the original and they all follow. Every copy is carved with one bit before the next bit, nearest first.</div>
        <div className="copies-pop__foot">
          {existing ? (
            <>
              <button className="btn btn--quiet btn--sm" onClick={remove}>
                Remove copies
              </button>
              <button className="btn btn--quiet btn--sm" onClick={detach} title="Turn each copy into its own element">
                <Unlink size={14} /> Separate
              </button>
            </>
          ) : null}
          <span style={{ flex: 1 }} />
          <button className="btn btn--outline btn--sm" onClick={cancel}>
            Cancel
          </button>
          <button className="btn btn--primary btn--sm" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Row({ label, children, aside }: { label: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="create-field">
      <div className="create-field__label">
        <span>{label}</span>
        {aside}
      </div>
      {children}
    </div>
  );
}

const round = (v: number) => Math.round(v * 10) / 10;
const fmt = (v: number) => (Math.round(v * 10) / 10).toString();
