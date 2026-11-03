/**
 * Snapping for dragging things on the canvas (pure, tested): an invisible grid plus "smart" targets
 * (board edges and center lines, other elements' edges and centers). Everything is in mm, in one
 * coordinate system chosen by the caller (the stage uses stock coordinates: X0 Y0 = bottom-left).
 * Nothing here draws: the caller shows the returned guides while a snap is active.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Positions a moving edge/center may stick to, per axis (x = vertical lines, y = horizontal lines). */
export interface SnapTargets {
  x: number[];
  y: number[];
}

/** A guide line to draw while snapped: axis "x" is a vertical line at x = at. */
export interface Guide {
  axis: "x" | "y";
  at: number;
}

export interface SnapOptions {
  /** Grid step in mm (0 or less = no grid). */
  grid: number;
  targets: SnapTargets;
  /** How close (mm) an edge/center must be to a target to stick to it. */
  tol: number;
}

export const GRID_STEPS = [0.5, 1, 5, 10] as const;
/** Smart-snap distance in screen pixels (≈1.5 mm at the usual board scale). */
export const SNAP_PX = 6;

const EPS = 1e-6;
/** Rounds away float noise (0.30000000000000004 → 0.3). */
const clean = (v: number) => Math.round(v * 1e6) / 1e6;

/** Nearest multiple of the grid step. */
export function snapValue(v: number, grid: number): number {
  if (!(grid > 0)) return v;
  return clean(Math.round(v / grid) * grid);
}

/** Best target for any of the candidate positions: the offset to apply and where the guide goes. */
function bestOffset(cands: number[], targets: number[], tol: number): { d: number; at: number } | null {
  let best: { d: number; at: number } | null = null;
  for (const c of cands)
    for (const t of targets) {
      const d = t - c;
      if (Math.abs(d) <= tol + EPS && (!best || Math.abs(d) < Math.abs(best.d) - EPS)) best = { d, at: t };
    }
  return best;
}

/** Every guide a snapped position lines up with (several edges can coincide). */
function guidesAt(axis: "x" | "y", cands: number[], targets: number[]): Guide[] {
  const out: Guide[] = [];
  for (const t of targets) if (cands.some((c) => Math.abs(c - t) < 1e-4) && !out.some((g) => Math.abs(g.at - t) < 1e-4)) out.push({ axis, at: clean(t) });
  return out;
}

function snapAxis(min: number, size: number, axis: "x" | "y", o: SnapOptions): { min: number; guides: Guide[] } {
  const targets = o.targets[axis];
  const cands = [min, min + size / 2, min + size];
  const hit = bestOffset(cands, targets, o.tol);
  if (hit) {
    const m = clean(min + hit.d);
    return { min: m, guides: guidesAt(axis, [m, m + size / 2, m + size], targets) };
  }
  return { min: snapValue(min, o.grid), guides: [] };
}

/**
 * Snaps a rectangle being moved: on each axis its edges or center stick to the closest target
 * within `tol`; otherwise its bottom-left corner snaps to the grid. The size never changes.
 */
export function snapRect(r: Rect, o: SnapOptions): { rect: Rect; guides: Guide[] } {
  const x = snapAxis(r.x, r.width, "x", o);
  const y = snapAxis(r.y, r.height, "y", o);
  return { rect: { ...r, x: x.min, y: y.min }, guides: [...x.guides, ...y.guides] };
}

/** Snaps a single point (a corner being resized, the end of a drag): targets first, then the grid. */
export function snapPoint(p: { x: number; y: number }, o: SnapOptions): { x: number; y: number; guides: Guide[] } {
  const guides: Guide[] = [];
  const one = (v: number, axis: "x" | "y") => {
    const hit = bestOffset([v], o.targets[axis], o.tol);
    if (hit) {
      guides.push({ axis, at: clean(hit.at) });
      return clean(hit.at);
    }
    return snapValue(v, o.grid);
  };
  return { x: one(p.x, "x"), y: one(p.y, "y"), guides };
}

/** Edges and center lines of a set of rectangles (the board, other elements). */
export function rectTargets(rects: Rect[]): SnapTargets {
  const x: number[] = [];
  const y: number[] = [];
  for (const r of rects) {
    x.push(r.x, r.x + r.width / 2, r.x + r.width);
    y.push(r.y, r.y + r.height / 2, r.y + r.height);
  }
  return { x, y };
}

/** Ruler ticks for a length in mm at a given scale (px per mm): labelled every `label` mm. */
export function rulerSteps(pxPerMm: number): { minor: number; major: number; label: number } {
  // Labels at least ~36 px apart (every 10 mm when zoomed in), minor ticks at least ~6 px apart.
  const label = [10, 20, 50, 100, 200, 500, 1000].find((l) => l * pxPerMm >= 36) ?? 1000;
  const minor = [1, 2, 5, 10, 20, 50, 100].find((m) => m * pxPerMm >= 6 && label % m === 0) ?? label;
  const major = label <= 10 ? 50 : label <= 50 ? 100 : label;
  return { minor, major, label };
}
