import { nearestTabFraction, pointAtFraction } from "@carvcam/cam-engine";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { addPosition, movePosition, outlineLength, removePosition, TAB_COLOR, TAB_EDGE, tabSpan, type TabMark } from "./tabs";

type Pt = { x: number; y: number };

/**
 * Holding tabs over the board, in the tab colour with a dark outline, so they read at any zoom.
 * Hovering one shows a badge ("Tab 2 of 4 · 6 × 3 mm").
 *
 * Editable (Manual placement, or Auto when `onChange` is given: the first drag switches to Manual):
 * drag a tab along the outline, click the outline to add one, double-click a tab (or Delete) to
 * remove it, arrow keys nudge the focused tab.
 */
export function TabsLayer(props: {
  marks: TabMark[];
  /** Stock size (mm) and scale (px per mm), same as the Board. */
  width: number;
  height: number;
  scale: number;
  tabHeight: number;
  /** Canonical outer outlines of the cut (stock mm), for dragging and adding. */
  outlines: Pt[][];
  /** Current Manual positions (undefined in Auto). */
  positions?: number[];
  /** Called with new positions (switching to Manual if needed). Omit for a read-only layer. */
  onChange?(positions: number[]): void;
  /** Positions to start from when editing Auto tabs (the engine's current ones). */
  autoPositions?(): number[];
}) {
  const { marks, scale: s, height: H } = props;
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHoverRaw] = useState<number | null>(null);
  /** The board is zoomed with a CSS transform: the badge is scaled back so its text stays the same size. */
  const [zoom, setZoom] = useState(1);
  const setHover = (i: number | null) => {
    const r = ref.current?.getBoundingClientRect();
    if (i !== null && r && props.width * s > 0) setZoom(r.width / (props.width * s) || 1);
    setHoverRaw(i);
  };
  const [drag, setDrag] = useState<{ index: number; positions: number[]; moved: boolean } | null>(null);
  const editable = !!props.onChange && props.outlines.length > 0;
  const per = props.outlines[0] ? outlineLength(props.outlines[0]) : 0;
  const kerf = marks[0]?.kerf ?? 3.175;
  const tabW = marks[0]?.width ?? 6;
  const minGap = tabSpan(tabW, kerf, per);

  const base = () => props.positions ?? props.autoPositions?.() ?? [];
  const toMm = (e: { clientX: number; clientY: number }): Pt => {
    const r = ref.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * props.width, y: H - ((e.clientY - r.top) / r.height) * H };
  };
  const fractionAt = (e: { clientX: number; clientY: number }) => nearestTabFraction(props.outlines, toMm(e))?.t ?? 0;

  // While dragging (Manual), the tabs follow the pointer without waiting for the engine.
  const shown = drag ? previewMarks(marks, drag.positions, props.outlines) : marks;

  const onDown = (index: number) => (e: PointerEvent) => {
    if (!editable || e.button !== 0) return;
    e.stopPropagation();
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointer */
    }
    setDrag({ index, positions: base(), moved: false });
  };
  const onMove = (e: PointerEvent) => {
    if (!drag) return;
    setDrag({ ...drag, positions: movePosition(drag.positions, drag.index, fractionAt(e)), moved: true });
  };
  const onUp = () => {
    if (!drag) return;
    if (drag.moved) props.onChange!(drag.positions);
    setDrag(null);
  };
  const remove = (index: number) => props.onChange?.(removePosition(base(), index));
  const onKey = (index: number) => (e: KeyboardEvent) => {
    if (!editable) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      remove(index);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const cur = base();
      const step = (e.shiftKey ? 10 : 1) / Math.max(1, per); // 1 mm (10 with Shift)
      const dir = e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 1;
      props.onChange!(movePosition(cur, index, (cur[index] ?? 0) + dir * step));
    }
  };

  const px = (p: Pt) => ({ x: p.x * s, y: (H - p.y) * s });
  const outlineD = props.outlines.map((o) => "M" + o.map((q) => `${(q.x * s).toFixed(1)} ${((H - q.y) * s).toFixed(1)}`).join("L") + "Z").join("");
  const count = new Set(marks.map((m) => m.index)).size;

  return (
    <svg
      ref={ref}
      className="tabs-layer"
      width={props.width * s}
      height={H * s}
      style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none", zIndex: 2 }}
      onPointerMove={onMove}
      onPointerUp={onUp}
      aria-label="Holding tabs"
    >
      {editable ? (
        <path
          className="tabs-layer__outline"
          d={outlineD}
          fill="none"
          stroke={TAB_COLOR}
          strokeOpacity={0.55}
          strokeDasharray="4 5"
          strokeWidth={1.2}
          style={{ pointerEvents: "none" }}
        />
      ) : null}
      {editable ? (
        <path
          d={outlineD}
          fill="none"
          stroke="transparent"
          strokeWidth={Math.max(16, kerf * s * 2)}
          style={{ pointerEvents: "stroke", cursor: "copy" }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            const cur = base();
            const next = addPosition(cur, fractionAt(e), minGap);
            if (next !== cur) props.onChange!(next);
          }}
        >
          <title>Click to add a tab here</title>
        </path>
      ) : null}
      {shown.map((m, k) => {
        const c = px(m);
        const w = Math.max(10, m.width * s);
        const t = Math.max(7, m.kerf * s);
        const isHover = hover === m.index || drag?.index === m.index;
        return (
          <g
            key={k}
            transform={`translate(${c.x.toFixed(1)} ${c.y.toFixed(1)}) rotate(${(-m.angle).toFixed(1)})`}
            style={{ pointerEvents: "all", cursor: editable ? (drag ? "grabbing" : "grab") : "default", outline: "none" }}
            tabIndex={m.outline === 0 ? 0 : -1}
            role={editable ? "button" : "img"}
            aria-label={`Tab ${m.index + 1} of ${count}, ${fmt(m.width)} by ${fmt(props.tabHeight)} mm${editable ? ". Drag or use the arrow keys to move it, Delete to remove it." : ""}`}
            data-tab={m.index}
            onPointerEnter={() => setHover(m.index)}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover(m.index)}
            onBlur={() => setHover(null)}
            onPointerDown={onDown(m.index)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (editable) remove(m.index);
            }}
            onKeyDown={onKey(m.index)}
          >
            <rect x={-w / 2} y={-t / 2} width={w} height={t} rx={2} fill={TAB_COLOR} stroke={TAB_EDGE} strokeWidth={isHover ? 2.2 : 1.5} />
            {isHover ? <rect x={-w / 2 - 4} y={-t / 2 - 4} width={w + 8} height={t + 8} rx={4} fill="none" stroke={TAB_COLOR} strokeOpacity={0.6} strokeWidth={1.5} /> : null}
          </g>
        );
      })}
      {hover !== null && !drag ? <Badge marks={shown} index={hover} px={px} boardW={props.width * s} zoom={zoom} text={`Tab ${hover + 1} of ${count} · ${fmt(tabW)} × ${fmt(props.tabHeight)} mm${editable ? " · drag to move, double-click to remove" : ""}`} /> : null}
    </svg>
  );
}

function Badge({ marks, index, px, text, boardW, zoom }: { marks: TabMark[]; index: number; px(p: Pt): Pt; text: string; boardW: number; zoom: number }) {
  const m = marks.find((x) => x.index === index && x.outline === 0) ?? marks.find((x) => x.index === index);
  if (!m) return null;
  const c = px(m);
  const k = 1 / Math.max(0.2, zoom);
  const w = text.length * 6.2 + 34;
  // Kept over the board, so it never slides under the tool rail or the panel.
  const x = Math.max((w / 2 + 4) * k, Math.min(boardW - (w / 2 + 4) * k, c.x));
  return (
    <g transform={`translate(${x.toFixed(1)} ${(c.y - 22 * k).toFixed(1)}) scale(${k.toFixed(3)})`} style={{ pointerEvents: "none" }}>
      <rect x={-w / 2} y={-13} width={w} height={22} rx={6} fill="rgba(17,18,20,.92)" stroke={TAB_COLOR} strokeOpacity={0.7} />
      <circle cx={-w / 2 + 12} cy={-2} r={7} fill={TAB_COLOR} stroke={TAB_EDGE} />
      <text x={-w / 2 + 12} y={1.5} textAnchor="middle" fontSize={9} fontWeight={700} fill={TAB_EDGE} fontFamily="var(--font)">
        T
      </text>
      <text x={-w / 2 + 24} y={2} fontSize={11} fill="#F3F1EC" fontFamily="var(--font)">
        {text}
      </text>
    </g>
  );
}

/** Manual tabs at drag-time positions (same shape as the engine's, from the outline). */
function previewMarks(marks: TabMark[], positions: number[], outlines: Pt[][]): TabMark[] {
  const kerf = marks[0]?.kerf ?? 3.175;
  const width = marks[0]?.width ?? 6;
  return outlines.flatMap((o, outline) =>
    positions.map((t, index) => {
      const p = pointAtFraction(o, t);
      return { x: p.x + (p.nx * kerf) / 2, y: p.y + (p.ny * kerf) / 2, angle: p.angle, width, kerf, index, outline };
    }),
  );
}

const fmt = (n: number) => String(Math.round(n * 10) / 10);
