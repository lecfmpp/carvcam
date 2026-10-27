import { parseLines, toSegments, type Segment } from "@gsender-next/cam-engine";
import { useMemo, type ReactNode } from "react";

/**
 * The stock area on the stage, to scale: children are placed in mm with the origin at the
 * bottom-left corner (work zero), same as the machine.
 */
export function Board(props: { width: number; height: number; scale: number; zoom?: number; label?: ReactNode; children?: ReactNode; showOrigin?: boolean }) {
  const s = props.scale;
  return (
    <div style={{ position: "relative", width: props.width * s, height: props.height * s, transform: `scale(${props.zoom ?? 1})`, transition: "transform 180ms var(--ease)" }}>
      {props.label ? (
        <div className="mono" style={{ position: "absolute", left: 0, right: 0, top: -34, textAlign: "center", font: "500 12px var(--mono)", color: "var(--text-3)" }}>
          {props.label}
        </div>
      ) : null}
      <div style={{ position: "absolute", inset: 0, boxShadow: "0 30px 60px rgba(0,0,0,.45)" }} />
      {props.children}
      {props.showOrigin !== false ? (
        <div
          title="Work zero: bottom-left corner, top face"
          style={{ position: "absolute", left: -7, bottom: -7, width: 14, height: 14, borderRadius: "50%", background: "var(--accent)", boxShadow: "0 0 0 4px rgba(255,91,31,.25)" }}
        />
      ) : null}
    </div>
  );
}

/** Parses the moves of a G-code program (memoized). */
export function useSegments(gcode: string | undefined) {
  return useMemo(() => (gcode ? toSegments(parseLines(gcode), { x: 0, y: 0, z: 10 }) : []), [gcode]);
}

/**
 * Bit path over the stock: orange where it cuts. `played` (0–1) shows only the part
 * already traveled, for "Play toolpath".
 */
export function ToolpathOverlay(props: { segments: Segment[]; width: number; height: number; scale: number; played?: number; opacity?: number }) {
  const { segments, scale: s, height } = props;
  const d = useMemo(() => {
    const cut = segments.filter((g) => !g.rapid && (g.to.z < 0 || g.from.z < 0));
    const n = Math.floor(cut.length * (props.played ?? 1));
    let path = "";
    let last: { x: number; y: number } | null = null;
    // Join continuous segments into one polyline; skip points closer than 0.4 px.
    for (let i = 0; i < n; i++) {
      const g = cut[i];
      const a = { x: g.from.x * s, y: (height - g.from.y) * s };
      const b = { x: g.to.x * s, y: (height - g.to.y) * s };
      if (!last || Math.hypot(a.x - last.x, a.y - last.y) > 0.5) path += `M${a.x.toFixed(1)} ${a.y.toFixed(1)}`;
      if (!last || Math.hypot(b.x - last.x, b.y - last.y) > 0.4) {
        path += `L${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
        last = b;
      }
    }
    return path;
  }, [segments, s, height, props.played]);
  return (
    <svg width={props.width * s} height={height * s} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }} aria-hidden="true">
      <path d={d} fill="none" stroke="#FF5B1F" strokeWidth={1} strokeOpacity={props.opacity ?? 0.85} strokeLinejoin="round" />
    </svg>
  );
}
