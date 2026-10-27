import { Magnet, Ruler } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCanvasPrefs } from "../state/ui";
import { useWorkshop } from "../state/workshop";
import { GRID_STEPS, rulerSteps, type Guide } from "./snap";

/** Rulers are on in Pro mode and off in Simple mode until the user toggles them (then remembered). */
export function useRulersOn() {
  const pref = useCanvasPrefs((s) => s.rulers);
  const pro = useWorkshop((s) => s.mode === "pro");
  return pref ?? pro;
}

/** Snapping grid step (mm). */
export const useSnapGrid = () => useCanvasPrefs((s) => s.snapGrid);

/** Toolbar buttons: "Rulers" toggle and the snapping grid popover (0.5 / 1 / 5 / 10 mm). */
export function CanvasTools() {
  const on = useRulersOn();
  const setRulers = useCanvasPrefs((s) => s.setRulers);
  const grid = useSnapGrid();
  const setGrid = useCanvasPrefs((s) => s.setSnapGrid);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <div className="canvas-tools" ref={ref}>
      <button className="tool-btn" aria-pressed={on} onClick={() => setRulers(!on)} title="Show rulers in mm (0 at the bottom-left corner, the work zero)">
        <Ruler size={15} strokeWidth={1.75} />
        Rulers
      </button>
      <button className="tool-btn canvas-tools__grid" aria-expanded={open} aria-label={`Snapping grid: ${grid} mm`} title="Snapping grid" onClick={() => setOpen(!open)}>
        <Magnet size={15} strokeWidth={1.75} />
        <span className="mono">{grid} mm</span>
      </button>
      {open ? (
        <div className="canvas-tools__pop" role="dialog" aria-label="Snapping">
          <div className="canvas-tools__title">Snap to grid</div>
          <div role="group" aria-label="Grid step" className="seg">
            {GRID_STEPS.map((g) => (
              <button key={g} className="seg__opt mono" aria-pressed={grid === g} onClick={() => setGrid(g)}>
                {g} mm
              </button>
            ))}
          </div>
          <div className="canvas-tools__hint">Things you drag also stick to the board edges, its center and other elements. Hold {mac ? "Option" : "Alt"} to move freely.</div>
        </div>
      ) : null}
    </div>
  );
}

/** Rulers when they are switched on (see useRulersOn). */
export function StageRulers(props: Parameters<typeof Rulers>[0]) {
  return useRulersOn() ? <Rulers {...props} /> : null;
}

const RULER = 18; // ruler band thickness (screen px)

/**
 * Top and left rulers in mm around a board drawn at `scale` px/mm (inside a parent scaled by
 * `zoom`). 0 is the bottom-left corner (work zero), like the engine's stock coordinates. The range
 * can extend past the board (`min`/`max`, e.g. for clamps outside it). Shows the pointer position
 * as a marker on both rulers.
 */
export function Rulers(props: { width: number; height: number; scale: number; zoom: number; min?: { x: number; y: number }; max?: { x: number; y: number } }) {
  const { width: W, height: H, scale: s, zoom } = props;
  const min = props.min ?? { x: 0, y: 0 };
  const max = props.max ?? { x: W, y: H };
  const ref = useRef<HTMLDivElement>(null);
  const [cur, setCur] = useState<{ x: number; y: number } | null>(null);

  // Pointer position in board mm, read from the screen box of the board (follows zoom).
  useEffect(() => {
    let raf = 0;
    let last: PointerEvent | null = null;
    const apply = () => {
      raf = 0;
      const el = ref.current;
      if (!el || !last) return;
      const r = el.getBoundingClientRect();
      const x = ((last.clientX - r.left) / r.width) * W;
      const y = (1 - (last.clientY - r.top) / r.height) * H;
      const inside = x >= min.x - 20 && x <= max.x + 20 && y >= min.y - 20 && y <= max.y + 20;
      setCur(inside ? { x, y } : null);
    };
    const onMove = (e: PointerEvent) => {
      last = e;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onLeave = () => setCur(null);
    window.addEventListener("pointermove", onMove);
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [W, H, min.x, min.y, max.x, max.y]);

  const k = 1 / zoom; // screen px → board px (the parent is scaled by zoom)
  const st = rulerSteps(s * zoom);
  const band = RULER * k;
  const ticks = (from: number, to: number) => {
    const out: number[] = [];
    for (let v = Math.ceil(from / st.minor) * st.minor; v <= to + 1e-6; v += st.minor) out.push(Math.round(v * 1000) / 1000);
    return out;
  };
  const len = (v: number) => (v % st.major === 0 ? 1 : v % st.label === 0 ? 0.55 : 0.28) * band;
  const font = 10 * k;
  const xs = ticks(min.x, max.x);
  const ys = ticks(min.y, max.y);
  const x0 = min.x * s;
  const x1 = max.x * s;
  const yTop = (H - max.y) * s;
  const yBot = (H - min.y) * s;

  return (
    <div ref={ref} className="rulers" aria-hidden="true">
      <svg className="rulers__svg" style={{ left: 0, top: 0 }} width={W * s} height={H * s} overflow="visible">
        {/* top ruler */}
        <rect x={x0} y={yTop - band - 6 * k} width={x1 - x0} height={band} className="rulers__band" />
        {xs.map((v) => {
          const x = v * s;
          const yb = yTop - 6 * k;
          return (
            <g key={`x${v}`}>
              <line x1={x} x2={x} y1={yb} y2={yb - len(v)} strokeWidth={k} className={v === 0 ? "rulers__zero" : "rulers__tick"} />
              {v % st.label === 0 ? (
                <text x={x + 2.5 * k} y={yb - band + font} fontSize={font} className={v === 0 ? "rulers__zero-t" : "rulers__t"}>
                  {v}
                </text>
              ) : null}
            </g>
          );
        })}
        {/* left ruler */}
        <rect x={x0 - band - 6 * k} y={yTop} width={band} height={yBot - yTop} className="rulers__band" />
        {ys.map((v) => {
          const y = (H - v) * s;
          const xb = x0 - 6 * k;
          return (
            <g key={`y${v}`}>
              <line x1={xb} x2={xb - len(v)} y1={y} y2={y} strokeWidth={k} className={v === 0 ? "rulers__zero" : "rulers__tick"} />
              {v % st.label === 0 ? (
                <text x={xb - band + 2 * k} y={y - 2.5 * k} fontSize={font} className={v === 0 ? "rulers__zero-t" : "rulers__t"} transform={`rotate(-90 ${xb - band + 2 * k} ${y - 2.5 * k})`} textAnchor="end">
                  {v}
                </text>
              ) : null}
            </g>
          );
        })}
        {cur ? (
          <>
            <line x1={cur.x * s} x2={cur.x * s} y1={yTop - 6 * k} y2={yTop - band - 6 * k} strokeWidth={1.5 * k} className="rulers__cur" />
            <line x1={x0 - 6 * k} x2={x0 - band - 6 * k} y1={(H - cur.y) * s} y2={(H - cur.y) * s} strokeWidth={1.5 * k} className="rulers__cur" />
            <text x={cur.x * s + 3 * k} y={yTop - band - 9 * k} fontSize={font} className="rulers__cur-t">
              {cur.x.toFixed(1)}
            </text>
            <text x={x0 - band - 9 * k} y={(H - cur.y) * s - 3 * k} fontSize={font} className="rulers__cur-t" textAnchor="end" transform={`rotate(-90 ${x0 - band - 9 * k} ${(H - cur.y) * s - 3 * k})`}>
              {cur.y.toFixed(1)}
            </text>
          </>
        ) : null}
      </svg>
    </div>
  );
}

/**
 * Thin guide lines while a drag is snapped (like Figma). Guides are in board mm (0 = bottom-left);
 * `scale` px/mm and `zoom` as for Rulers, `origin` = where the board's X0 Y0 sits in this layer (mm).
 */
export function SnapGuides(props: { guides: Guide[]; width: number; height: number; scale: number; zoom: number; origin?: { x: number; y: number } }) {
  if (!props.guides.length) return null;
  const { scale: s, origin = { x: 0, y: 0 } } = props;
  const k = 1 / props.zoom;
  const ext = 40 * k; // a little past the layer's edges
  return (
    <svg className="snap-guides" width={props.width * s} height={props.height * s} overflow="visible" aria-hidden="true">
      {props.guides.map((g, i) =>
        g.axis === "x" ? (
          <line key={i} x1={(origin.x + g.at) * s} x2={(origin.x + g.at) * s} y1={-ext} y2={props.height * s + ext} strokeWidth={k} />
        ) : (
          <line key={i} y1={(props.height - origin.y - g.at) * s} y2={(props.height - origin.y - g.at) * s} x1={-ext} x2={props.width * s + ext} strokeWidth={k} />
        ),
      )}
    </svg>
  );
}
