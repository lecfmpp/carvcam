import { Minus, Plus, RotateCw } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Seg } from "../components/ui";

export type View = "top" | "3d";

export interface StageApi {
  view: View;
  zoom: number;
  /** Incrementa quando a pessoa pede a volta de 360°. */
  spin: number;
  /** Tamanho útil do palco em px. */
  size: { w: number; h: number };
}

/**
 * Palco à esquerda do painel: grade de pontos, alternância Top/3D, botão 360° e zoom.
 * O conteúdo é desenhado por `render`, que recebe vista, zoom e tamanho.
 */
export function Stage(props: { caption?: ReactNode; tools?: ReactNode; overlay?: ReactNode; render(api: StageApi): ReactNode; defaultView?: View; noViewToggle?: boolean; bottomLeft?: ReactNode }) {
  const [view, setView] = useState<View>(props.defaultView ?? "top");
  const [zoom, setZoom] = useState(1);
  const [spin, setSpin] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 900, h: 700 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const zoomBy = (f: number) => setZoom((z) => Math.max(0.4, Math.min(3, +(z * f).toFixed(3))));

  return (
    <section
      ref={ref}
      className="stage"
      aria-label="Preview"
      onWheel={(e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          zoomBy(e.deltaY < 0 ? 1.1 : 0.9);
        }
      }}
    >
      <div className="stage__toolbar">
        {props.noViewToggle ? null : (
          <Seg<View>
            label="View"
            size="lg"
            value={view}
            onChange={setView}
            options={[
              ["top", "Top"],
              ["3d", "3D"],
            ]}
            style={{ background: "rgba(26,27,30,.72)", backdropFilter: "var(--blur)" }}
          />
        )}
        {props.tools}
        {props.noViewToggle ? null : (
          <button
            className="tool-btn"
            aria-label="Turn the piece 360 degrees"
            onClick={() => {
              setView("3d");
              setSpin((s) => s + 1);
            }}
          >
            <RotateCw size={15} strokeWidth={1.75} />
            360°
          </button>
        )}
        {props.caption ? <span className="stage__caption">{props.caption}</span> : null}
      </div>
      {props.overlay}
      <div className="stage__canvas">{props.render({ view, zoom, spin, size })}</div>
      {props.bottomLeft ? <div style={{ position: "absolute", left: 24, bottom: 24, zIndex: 3 }}>{props.bottomLeft}</div> : null}
      <div className="stage__zoom" role="group" aria-label="Zoom">
        <button aria-label="Zoom out" title="Zoom out" onClick={() => zoomBy(1 / 1.2)}>
          <Minus size={16} strokeWidth={1.75} />
        </button>
        <span className="stage__zoomval">{Math.round(zoom * 100)}%</span>
        <button aria-label="Zoom in" title="Zoom in" onClick={() => zoomBy(1.2)}>
          <Plus size={16} strokeWidth={1.75} />
        </button>
      </div>
    </section>
  );
}

/** Escala (px por mm) para caber um objeto de w × h mm no palco, com folga. */
export function fitScale(size: { w: number; h: number }, w: number, h: number, pad = { x: 200, y: 240 }) {
  return Math.max(0.05, Math.min((size.w - pad.x) / w, (size.h - pad.y) / h));
}
