import { Minus, Plus, RotateCw } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Seg, VideoChip } from "../components/ui";
import { CanvasTools } from "./Rulers";

export type View = "top" | "3d";

export interface StageApi {
  view: View;
  zoom: number;
  /** Bumped when the user asks for the 360° turn. */
  spin: number;
  /** Usable stage size in px. */
  size: { w: number; h: number };
}

/**
 * Stage to the left of the panel: dot grid, Top/3D toggle, 360° button and zoom.
 * Content is drawn by `render`, which receives view, zoom and size.
 */
export function Stage(props: { caption?: ReactNode; tools?: ReactNode; overlay?: ReactNode; render(api: StageApi): ReactNode; defaultView?: View; noViewToggle?: boolean; bottomLeft?: ReactNode; /** Show the Rulers toggle and snapping grid popover (top view only). */ canvasTools?: boolean; /** When this changes to a value, the stage switches to the top view (e.g. to show a warning on the board). */ showTop?: string | null; /** The step's "Watch how" video (lib/videos.ts), shown beside the bottom-left content when it exists. */ video?: string }) {
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

  useEffect(() => {
    if (props.showTop) setView("top");
  }, [props.showTop]);

  const zoomBy = (f: number) => setZoom((z) => Math.max(0.4, Math.min(3, +(z * f).toFixed(3))));

  return (
    <section
      ref={ref}
      className="stage"
      aria-label="Preview"
      onWheel={(e) => {
        // In 3D the wheel always zooms; in the top view it needs Ctrl/Cmd (the wheel scrolls the panel otherwise).
        if (e.ctrlKey || e.metaKey || view === "3d") {
          if (e.cancelable) e.preventDefault();
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
        {props.canvasTools && view === "top" ? <CanvasTools /> : null}
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
      {props.bottomLeft || props.video ? (
        <div className="stage__bottomleft">
          {props.bottomLeft}
          {props.video ? <VideoChip id={props.video} /> : null}
        </div>
      ) : null}
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

/** Scale (px per mm) to fit a w × h mm object on the stage, with some margin. */
export function fitScale(size: { w: number; h: number }, w: number, h: number, pad = { x: 200, y: 240 }) {
  // Small stages (phones, a narrow window) keep at most a quarter of their size as margin.
  pad = { x: Math.min(pad.x, size.w * 0.25), y: Math.min(pad.y, size.h * 0.3) };
  return Math.max(0.05, Math.min((size.w - pad.x) / w, (size.h - pad.y) / h));
}
