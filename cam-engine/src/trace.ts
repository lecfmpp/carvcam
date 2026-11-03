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

export interface PolishOpts {
  /** How far to reach, in px: cracks and gaps up to about 2× this close, edges round by about this much. */
  radius: number;
  /** Fill holes smaller than this (px²) inside the shapes. Default: (4·radius)². */
  holeArea?: number;
  /** Give thin strokes one even thickness (lettering, line art). Large filled areas keep their shape. */
  even?: boolean;
}

/**
 * "Polish" for a rough trace: closes cracks and small gaps, fills pinholes, rounds off jagged edges
 * and, optionally, evens out the stroke thickness. Works on the mask, before tracing.
 */
export function polishMask(mask: Uint8Array, w: number, h: number, o: PolishOpts): Uint8Array {
  const r = Math.max(1, o.radius);
  let m: Uint8Array = mask.slice();
  // Close: grow then shrink by r. Bridges cracks and gaps narrower than ~2r without fattening strokes.
  m = threshold(distance(m, w, h, 0), (d) => d <= r); // dilate (distance to the nearest inside pixel)
  m = threshold(distance(m, w, h, 1), (d) => d > r); // erode (distance to the nearest outside pixel)
  m = fillHoles(m, w, h, o.holeArea ?? (4 * r) ** 2);
  m = blurThreshold(m, w, h, Math.max(1, Math.round(r)));
  if (o.even) m = evenStrokes(m, w, h);
  return m;
}

const threshold = (d: Float32Array, f: (v: number) => boolean) => {
  const out = new Uint8Array(d.length);
  for (let i = 0; i < d.length; i++) out[i] = f(d[i]) ? 1 : 0;
  return out;
};

/**
 * Chamfer (3-4) distance, in px, from each pixel to the nearest pixel whose value is not `inside`
 * (inside = 1: distance to the outside; inside = 0: distance to the shape). Outside the image counts
 * as background.
 */
function distance(m: Uint8Array, w: number, h: number, inside: 0 | 1): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < m.length; i++) d[i] = m[i] === inside ? INF : 0;
  const edge = inside === 1 ? 3 : INF; // the image border is background
  const get = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? (inside === 1 ? 0 : INF) : d[y * w + x]);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], get(x - 1, y) + 3, get(x, y - 1) + 3, get(x - 1, y - 1) + 4, get(x + 1, y - 1) + 4, x === 0 || y === 0 ? edge : INF);
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], get(x + 1, y) + 3, get(x, y + 1) + 3, get(x + 1, y + 1) + 4, get(x - 1, y + 1) + 4, x === w - 1 || y === h - 1 ? edge : INF);
    }
  for (let i = 0; i < d.length; i++) d[i] /= 3;
  return d;
}

/** Background areas not connected to the image border and smaller than maxArea become inside. */
function fillHoles(m: Uint8Array, w: number, h: number, maxArea: number): Uint8Array {
  const out = m.slice();
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (m[s] || seen[s]) continue;
    const comp: number[] = [];
    let border = false;
    stack.push(s);
    seen[s] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      comp.push(i);
      const x = i % w;
      const y = (i - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1])
        if (j >= 0 && !m[j] && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
    }
    if (!border && comp.length < maxArea) for (const i of comp) out[i] = 1;
  }
  return out;
}

/** Two box blurs (≈ Gaussian) and back to black/white at 50 %: rounds off bumps and jagged edges. */
function blurThreshold(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  let a = Float32Array.from(m);
  const pass = (src: Float32Array, horizontal: boolean) => {
    const dst = new Float32Array(src.length);
    const n = horizontal ? w : h;
    const lines = horizontal ? h : w;
    for (let l = 0; l < lines; l++) {
      const at = (k: number) => src[horizontal ? l * w + Math.max(0, Math.min(n - 1, k)) : Math.max(0, Math.min(n - 1, k)) * w + l];
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += at(k);
      for (let k = 0; k < n; k++) {
        dst[horizontal ? l * w + k : k * w + l] = sum / (2 * r + 1);
        sum += at(k + r + 1) - at(k - r);
      }
    }
    return dst;
  };
  for (let i = 0; i < 2; i++) a = pass(pass(a, true), false);
  return threshold(a, (v) => v >= 0.5);
}

/**
 * Even stroke thickness: finds the centre line of each stroke (ridge of the distance map) and the
 * typical stroke width (median along the ridges), then redraws thin strokes at that width. Areas much
 * thicker than a stroke (filled shapes) are redrawn at their own width, so they keep their shape.
 */
function evenStrokes(m: Uint8Array, w: number, h: number): Uint8Array {
  const d = distance(m, w, h, 1);
  const ridge: number[] = [];
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = d[i];
      if (v < 1) continue;
      if (v >= d[i - 1] && v >= d[i + 1] && v >= d[i - w] && v >= d[i + w] && v >= d[i - w - 1] && v >= d[i - w + 1] && v >= d[i + w - 1] && v >= d[i + w + 1]) ridge.push(i);
    }
  if (!ridge.length) return m;
  const vals = ridge.map((i) => d[i]).sort((p, q) => p - q);
  const R = vals[Math.floor(vals.length / 2)];
  const out = new Uint8Array(w * h);
  for (const i of ridge) {
    const v = d[i];
    // Thin stroke: redraw at the typical width. Thick area: keep its own width.
    const rad = v <= R * 1.8 ? R : v;
    const cx = i % w;
    const cy = (i - cx) / w;
    const rr = Math.ceil(rad);
    for (let y = Math.max(0, cy - rr); y <= Math.min(h - 1, cy + rr); y++)
      for (let x = Math.max(0, cx - rr); x <= Math.min(w - 1, cx + rr); x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad) out[y * w + x] = 1;
  }
  return out;
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
