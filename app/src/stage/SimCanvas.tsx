import { useEffect, useRef } from "react";
import type { SimGrid } from "../engine/protocol";
import { THROUGH_COLOR, type Material } from "../lib/catalog";
import { TAB_COLOR, tabMask, type TabMark } from "./tabs";

/**
 * Top view of the simulated cut: each height-map cell becomes a pixel, colored by
 * material (face, pocket floor, wall) and shaded by a light from the top-left corner.
 */
export function SimCanvas(props: {
  sim: SimGrid;
  thickness: number;
  material: Material;
  /** Pixels per mm on screen. */
  scale: number;
  /** Clips the drawing to the stock area (without the simulation's extra border). */
  board: { width: number; height: number };
  /** Holding tabs the engine left: drawn in the tab colour so they stand out. */
  tabs?: TabMark[];
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { sim, thickness, material, board } = props;
  const tabsKey = JSON.stringify(props.tabs ?? []);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const { cols, rows, h, res, x0, y0 } = sim;
    cv.width = cols;
    cv.height = rows;
    const ctx = cv.getContext("2d")!;
    const img = ctx.createImageData(cols, rows);
    const face = hex(material.face);
    const recess = hex(material.recess);
    const side = hex(material.side);
    const through = hex(THROUGH_COLOR);
    const tab = hex(TAB_COLOR);
    const mask = props.tabs?.length ? tabMask(sim, props.tabs) : null;
    const deep = thickness * 0.55;
    for (let j = 0; j < rows; j++) {
      // Canvas Y points down; the machine's points up.
      const jj = rows - 1 - j;
      for (let i = 0; i < cols; i++) {
        const k = jj * cols + i;
        const v = h[k];
        const x = x0 + i * res;
        const y = y0 + jj * res;
        const o = (j * cols + i) * 4;
        if (x < 0 || y < 0 || x > board.width || y > board.height) {
          img.data[o + 3] = 0;
          continue;
        }
        let c: number[];
        if (v <= -thickness + 0.02) c = through;
        else if (v > -0.02) c = face;
        else if (mask?.[k]) c = tab;
        else if (-v > deep) c = side;
        else c = mix(face, recess, Math.min(1, -v / Math.max(0.5, Math.min(deep, 4))));
        // Shading: compare with the upper-left neighbor.
        const n = h[Math.min(rows - 1, jj + 1) * cols + Math.max(0, i - 1)];
        const slope = Math.max(-1, Math.min(1, (v - n) / Math.max(0.3, res * 2)));
        const light = 1 + 0.22 * slope;
        img.data[o] = clamp(c[0] * light);
        img.data[o + 1] = clamp(c[1] * light);
        img.data[o + 2] = clamp(c[2] * light);
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim, thickness, material, board.width, board.height, tabsKey]);

  const w = sim.cols * sim.res * props.scale;
  const hpx = sim.rows * sim.res * props.scale;
  return (
    <canvas
      ref={ref}
      aria-label="Simulated cut, top view"
      style={{
        position: "absolute",
        left: sim.x0 * props.scale,
        bottom: sim.y0 * props.scale,
        width: w,
        height: hpx,
        imageRendering: "auto",
        ...props.style,
      }}
    />
  );
}

const hex = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
