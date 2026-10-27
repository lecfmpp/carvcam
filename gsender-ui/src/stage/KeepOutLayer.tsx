import type { KeepOutZone } from "@gsender-next/cam-engine";
import { useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { moveZone, rectFromDrag, resizeZone, MIN_ZONE, type Bounds, type Handle } from "../screens/job/zones";

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

  const drag = (e: RPointerEvent, onMove: (p: { x: number; y: number }) => void, onUp?: (p: { x: number; y: number }) => void) => {
    e.preventDefault();
    e.stopPropagation();
    const move = (ev: PointerEvent) => onMove(toMm(ev));
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onUp?.(toMm(ev));
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
    drag(e, (p) => update(base.map((z, k) => (k === i ? moveZone(z0, p.x - start.x, p.y - start.y, bounds) : z))), commit);
  };

  const startResize = (e: RPointerEvent, i: number, h: Handle) => {
    const z0 = props.zones[i];
    const base = props.zones;
    drag(e, (p) => update(base.map((z, k) => (k === i ? resizeZone(z0, h, p.x, p.y, bounds) : z))), commit);
  };

  const startDraw = (e: RPointerEvent) => {
    if (!props.drawing || e.button !== 0) return;
    const a = toMm(e);
    drag(
      e,
      (p) => setDraft(rectFromDrag(a, p, bounds)),
      (p) => {
        setDraft(null);
        const r = rectFromDrag(a, p, bounds);
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
    </div>
  );
}
