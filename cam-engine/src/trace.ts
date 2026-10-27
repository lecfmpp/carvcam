import { areaD, FillRule, simplifyPathsD, unionD, type PathD } from "clipper2-ts";
import type { Pt, Region } from "./geometry/clip.js";

/**
 * Image tracing (bitmap → outlines). "Inside" pixels (dark, by default) become
 * area; follows the edges between inside and outside pixels, joins them into closed outlines, drops
 * small specks, simplifies and smooths the pixel staircase.
 *
 * Output coordinates are in pixels, Y down (as in the image); the caller converts to mm.
 */

export interface TraceOpts {
  /** 0–255: luminance below this counts as "inside". */
  threshold?: number;
  /** Invert: light becomes inside. */
  invert?: boolean;
  /** Ignore outlines with an area smaller than this (px²). */
  minBlob?: number;
  /** Simplification tolerance, in px. */
  detail?: number;
  /** Smoothing passes (0–4). */
  smooth?: number;
}

/** Binary mask from RGBA (transparent counts as light). */
export function maskFromRgba(data: Uint8ClampedArray | Uint8Array, w: number, h: number, threshold = 128, invert = false): Uint8Array {
  const m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = data[i * 4 + 3] / 255;
    const lum = (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) * a + 255 * (1 - a);
    const dark = lum < threshold;
    m[i] = dark !== invert ? 1 : 0;
  }
  return m;
}

export function traceMask(mask: Uint8Array, w: number, h: number, o: TraceOpts = {}): Region {
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? mask[y * w + x] : 0);
  // Directed edges between pixels, with "inside" on the left (with Y down, clockwise
  // on screen). Vertices on the (w+1)×(h+1) grid.
  const W = w + 1;
  const out = new Map<number, number[]>();
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const k = y0 * W + x0;
    const v = y1 * W + x1;
    const l = out.get(k);
    if (l) l.push(v);
    else out.set(k, [v]);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!at(x, y)) continue;
      if (!at(x, y - 1)) add(x, y, x + 1, y); // top: →
      if (!at(x + 1, y)) add(x + 1, y, x + 1, y + 1); // right: ↓
      if (!at(x, y + 1)) add(x + 1, y + 1, x, y + 1); // bottom: ←
      if (!at(x - 1, y)) add(x, y + 1, x, y); // left: ↑
    }
  }

  const loops: PathD[] = [];
  const pop = (k: number, prevDir?: [number, number]): number | undefined => {
    const l = out.get(k);
    if (!l || !l.length) return undefined;
    let idx = 0;
    if (l.length > 1 && prevDir) {
      // Saddle vertex (two pixels touching only diagonally): always turn the same way, so
      // outlines never cross.
      const kx = k % W;
      const ky = Math.floor(k / W);
      let best = -Infinity;
      l.forEach((v, i) => {
        const dx = (v % W) - kx;
        const dy = Math.floor(v / W) - ky;
        const cross = prevDir[0] * dy - prevDir[1] * dx;
        if (cross > best) {
          best = cross;
          idx = i;
        }
      });
    }
    const v = l.splice(idx, 1)[0];
    if (!l.length) out.delete(k);
    return v;
  };
  for (const start of [...out.keys()]) {
    while (out.has(start)) {
      const pts: Pt[] = [];
      let k = start;
      let dir: [number, number] | undefined;
      for (let guard = 0; guard < 4 * (w + 2) * (h + 2); guard++) {
        const kx = k % W;
        const ky = Math.floor(k / W);
        const v = pop(k, dir);
        if (v === undefined) break;
        const vx = v % W;
        const vy = Math.floor(v / W);
        const nd: [number, number] = [vx - kx, vy - ky];
        // Only keep the corners (where the direction changes).
        if (!dir || dir[0] !== nd[0] || dir[1] !== nd[1]) pts.push({ x: kx, y: ky });
        dir = nd;
        k = v;
        if (k === start) break;
      }
      if (pts.length >= 3) loops.push(pts);
    }
  }

  const minBlob = o.minBlob ?? 4;
  let r: PathD[] = loops.filter((p) => Math.abs(areaD(p)) >= minBlob);
  const passes = Math.max(0, Math.min(4, Math.round(o.smooth ?? 2)));
  for (let i = 0; i < passes; i++) r = r.map(chaikin);
  r = simplifyPathsD(r, o.detail ?? 0.6, true).filter((p) => p.length >= 3);
  // Even-odd resolves holes and islands regardless of each outline's orientation.
  return r.length ? unionD(r, FillRule.EvenOdd) : [];
}

/** One Chaikin pass (cuts corners at 1/4 and 3/4): removes the pixel staircase. */
function chaikin(p: PathD): PathD {
  const out: PathD = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    out.push({ x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y }, { x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y });
  }
  return out;
}

/** Region → SVG (even-odd path), in pixels, to become a regular imported drawing. */
export function regionToSvg(r: Region, w: number, h: number): string {
  const d = r.map((p) => "M" + p.map((q) => `${q.x.toFixed(2)} ${q.y.toFixed(2)}`).join("L") + "Z").join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}px" height="${h}px"><path fill="#000" fill-rule="evenodd" d="${d}"/></svg>`;
}
