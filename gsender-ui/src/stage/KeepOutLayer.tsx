import type { KeepOutZone } from "@gsender-next/cam-engine";
import { useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { moveZone, rectFromDrag, resizeZone, MIN_ZONE, type Bounds, type Handle } from "../screens/job/zones";
import { SnapGuides, useSnapGrid } from "./Rulers";
import { rectTargets, snapPoint, snapRect, SNAP_PX, type Guide, type Rect } from "./snap";

/**
 * Clamps and keep-out zones drawn as hatched red rectangles over a top view.
 * The layer covers a frame of `frame` mm (its bottom-left corner is the frame origin); the board's
 * bottom-left corner (X0 Y0) sits at `origin` inside it. With `onChange` the zones can be moved,
 * resized by their corners and, with `drawing`, new ones drawn by dragging.
 */
export function KeepOutLayer(props: {
  zones: KeepOutZone[];
  scale: number;
  frame: { width: number; height: number };
  origin?: { x: number; y: number };
  selected?: number | null;
  invalid?: number[];
  bounds?: Bounds;
  drawing?: boolean;
  onSelect?(i: number | null): void;
  onChange?(zones: KeepOutZone[]): void;
  onDrawn?(rect: { x: number; y: number; width: number; height: number }): void;
  /** Board size (mm): its edges and center lines become snap targets while editing. */
  board?: { width: number; height: number };
  /** Stage zoom, so guide lines stay 1 px thin. */
  zoom?: number;
}) {
  const { scale: s, origin = { x: 0, y: 0 } } = props;
  const ref = useRef<HTMLDivElement>(null);
  // While dragging, the zones live here; they are saved once, on release.
  const [live, setLive] = useState<KeepOutZone[] | null>(null);
  const liveRef = useRef<KeepOutZone[] | null>(null);
  const zones = live ?? props.zones;
  const update = (z: KeepOutZone[]) => {
    liveRef.current = z;
    setLive(z);
  };
  const commit = () => {
    if (liveRef.current) props.onChange?.(liveRef.current);
    liveRef.current = null;
    setLive(null);
    setGuides([]);
  };
  // Snapping while editing: invisible grid, board edges/centers and the other zones (Alt = free).
  const grid = useSnapGrid();
  const [guides, setGuides] = useState<Guide[]>([]);
  const snapOpts = (skip: number | null) => {
    const r = ref.current!.getBoundingClientRect();
    const rects: Rect[] = props.zones.filter((_, k) => k !== skip);
    if (props.board) rects.unshift({ x: 0, y: 0, ...props.board });
    return { grid, targets: rectTargets(rects), tol: (SNAP_PX * props.frame.width) / r.width };
  };
  const [draft, setDraft] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const editable = !!props.onChange;
  const bounds = props.bounds ?? { xMin: -Infinity, yMin: -Infinity, xMax: Infinity, yMax: Infinity };

  /** Pointer position in board mm (X0 Y0 = bottom-left of the board). */
  const toMm = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    const k = r.width / props.frame.width;
    return { x: (e.clientX - r.left) / k - origin.x, y: (r.bottom - e.clientY) / k - origin.y };
  };

  type Pt = { x: number; y: number };
  const drag = (e: RPointerEvent, onMove: (p: Pt, free: boolean) => void, onUp?: (p: Pt, free: boolean) => void) => {
    e.preventDefault();
    e.stopPropagation();
    const move = (ev: PointerEvent) => onMove(toMm(ev), ev.altKey);
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onUp?.(toMm(ev), ev.altKey);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const startMove = (e: RPointerEvent, i: number) => {
    props.onSelect?.(i);
    if (!editable) return;
    const start = toMm(e);
    const z0 = zones[i];
    const base = props.zones;
    const opts = snapOpts(i);
    drag(
      e,
      (p, free) => {
        let dx = p.x - start.x;
        let dy = p.y - start.y;
        if (!free) {
          const r = snapRect({ x: z0.x + dx, y: z0.y + dy, width: z0.width, height: z0.height }, opts);
          dx = r.rect.x - z0.x;
          dy = r.rect.y - z0.y;
          setGuides(r.guides);
        } else setGuides([]);
        update(base.map((z, k) => (k === i ? moveZone(z0, dx, dy, bounds) : z)));
      },
      commit,
    );
  };
  /** Pointer snapped for corners (resizing, drawing). */
  const snapAt = (p: Pt, free: boolean, opts: ReturnType<typeof snapOpts>) => {
    if (free) {
      setGuides([]);
      return p;
    }
    const r = snapPoint(p, opts);
    setGuides(r.guides);
    return r;
  };

  const startResize = (e: RPointerEvent, i: number, h: Handle) => {
    const z0 = props.zones[i];
    const base = props.zones;
    const opts = snapOpts(i);
    drag(
      e,
      (p, free) => {
        const q = snapAt(p, free, opts);
        update(base.map((z, k) => (k === i ? resizeZone(z0, h, q.x, q.y, bounds) : z)));
      },
      commit,
    );
  };

  const startDraw = (e: RPointerEvent) => {
    if (!props.drawing || e.button !== 0) return;
    const opts = snapOpts(null);
    const a = snapAt(toMm(e), e.altKey, opts);
    drag(
      e,
      (p, free) => setDraft(rectFromDrag(a, snapAt(p, free, opts), bounds)),
      (p, free) => {
        const q = snapAt(p, free, opts);
        setDraft(null);
        setGuides([]);
        const r = rectFromDrag(a, q, bounds);
        if (r.width >= MIN_ZONE && r.height >= MIN_ZONE) props.onDrawn?.(r);
      },
    );
  };

  const box = (z: { x: number; y: number; width: number; height: number }) => ({
    left: (origin.x + z.x) * s,
    bottom: (origin.y + z.y) * s,
    width: Math.max(2, z.width * s),
    height: Math.max(2, z.height * s),
  });

  return (
    <div
      ref={ref}
      className="ko-layer"
      style={{ pointerEvents: props.drawing ? "auto" : "none", cursor: props.drawing ? "crosshair" : undefined }}
      onPointerDown={startDraw}
      onClick={(e) => props.drawing && e.stopPropagation()}
    >
      {zones.map((z, i) => {
        const sel = props.selected === i;
        const bad = props.invalid?.includes(i);
        return (
          <div
            key={z.id ?? i}
            className={`ko-zone${sel ? " ko-zone--sel" : ""}${bad ? " ko-zone--bad" : ""}`}
            style={{ ...box(z), pointerEvents: props.onSelect || editable ? "auto" : "none", cursor: editable ? "move" : props.onSelect ? "pointer" : undefined }}
            onPointerDown={(e) => startMove(e, i)}
            onClick={(e) => e.stopPropagation()}
            title={`${z.label ?? `Zone ${i + 1}`} · ${z.width} × ${z.height} mm · ${z.clearance ?? 20} mm tall`}
          >
            <span className="ko-zone__tag mono">{z.label ?? `Zone ${i + 1}`}</span>
            {sel && editable
              ? (["nw", "ne", "sw", "se"] as Handle[]).map((h) => <span key={h} className={`ko-handle ko-handle--${h}`} onPointerDown={(e) => startResize(e, i, h)} aria-hidden />)
              : null}
          </div>
        );
      })}
      {draft ? <div className="ko-zone ko-zone--draft" style={box(draft)} /> : null}
      <SnapGuides guides={guides} width={props.frame.width} height={props.frame.height} scale={s} zoom={props.zoom ?? 1} origin={origin} />
    </div>
  );
}
