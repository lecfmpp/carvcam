import { area, intersection, offset, pathArea, perimeter, pointInRegion, segmentInside, simplify, type Pt, type Region } from "../geometry/clip.js";
import { depthLevels, dist, PathBuilder, rotateToNearest } from "./builder.js";

export type Direction = "conventional" | "climb";

export interface PocketOpts {
  radius: number;
  stepover: number;
  depth: number;
  stepdown: number;
  direction: Direction;
}

/**
 * Pocket by concentric rings (offset). Machines each component completely before moving
 * to the next; at each level it starts with the innermost ring and works outward,
 * so only the first ring cuts with the full bit width engaged.
 * Returns false if the bit does not fit anywhere in the region.
 */
export function pocket(b: PathBuilder, region: Region, o: PocketOpts): boolean {
  const t0 = offset(region, -o.radius);
  if (area(t0) <= 0) return false;

  for (const comp of components(t0)) {
    // Each ring comes straight from the original region (erosion by r + k·stepover). Chaining offsets
    // on the previous ring multiplies the arc vertices and makes the computation painfully slow.
    const source = intersection(region, offset(comp, o.radius + 0.01));
    const rings: { k: number; path: Pt[] }[] = [];
    for (let k = 0; k < 5000; k++) {
      const cur = k === 0 ? comp : simplify(intersection(offset(source, -(o.radius + k * o.stepover)), comp));
      if (area(cur) <= 0) break;
      for (const p of simplify(cur)) rings.push({ k, path: orient(p, o.direction, "pocket") });
    }
    rings.sort((a, c) => c.k - a.k);

    for (const z of depthLevels(o.depth, o.stepdown)) {
      const pending = [...rings];
      let first = true;
      while (pending.length) {
        // Among the rings of the innermost level still pending, take the nearest one.
        const kMax = pending[0].k;
        let bi = 0;
        let bd = Infinity;
        pending.forEach((r, i) => {
          if (r.k !== kMax) return;
          const d = Math.min(...r.path.map((p) => dist(p, b)));
          if (d < bd) {
            bd = d;
            bi = i;
          }
        });
        const ring = pending.splice(bi, 1)[0];
        const path = rotateToNearest(ring.path, b);
        const start = path[0];
        const atLevel = !first && Math.abs(b.z - z) < 1e-6;
        if (atLevel && dist(b, start) <= o.stepover * 1.6 && segmentInside(comp, b, start)) {
          b.feed(start, z);
        } else {
          b.travel(start);
          b.plunge(z);
        }
        first = false;
        for (let i = 1; i < path.length; i++) b.feed(path[i], z);
        b.feed(start, z);
      }
      b.retract();
    }
  }
  return true;
}

export interface ProfileOpts {
  radius: number;
  depth: number;
  stepdown: number;
  direction: Direction;
  /** Side of the bit relative to the region: outside (the part stays) or inside (the region drops out). */
  side: "outside" | "inside";
  tabs?: { count: number; width: number; height: number; thickness: number };
}

export interface ProfileResult {
  outlinesWithoutTabs: number;
}

/**
 * Profile cut in passes. Outside: first the inner contours (holes in the part), then the outer
 * outline with tabs on the final passes, so the part does not come loose.
 */
export function profile(b: PathBuilder, region: Region, o: ProfileOpts): ProfileResult {
  const paths = simplify(offset(region, o.side === "outside" ? o.radius : -o.radius));
  let outlinesWithoutTabs = 0;
  const levels = depthLevels(o.depth, o.stepdown);

  const ordered = nearestOrder(paths, b, (p) => (pathArea(p) < 0 ? 0 : 1));
  for (const raw of ordered) {
    const isOuter = pathArea(raw) > 0;
    const path = rotateToNearest(orient(raw, o.direction, o.side === "outside" ? "profile" : "pocket"), b);
    const wantTabs = o.side === "outside" && isOuter && o.tabs && o.tabs.count > 0;
    const tabs = wantTabs ? tabWindows(path, o.tabs!.count, o.tabs!.width + 2 * o.radius) : [];
    if (wantTabs && tabs.length === 0) outlinesWithoutTabs++;
    const tabTop = o.tabs ? -(o.tabs.thickness - o.tabs.height) : 0;

    b.travel(path[0]);
    for (const z of levels) {
      b.plunge(z);
      if (tabs.length && z < tabTop) followWithTabs(b, path, z, tabTop, tabs);
      else {
        for (let i = 1; i < path.length; i++) b.feed(path[i], z);
        b.feed(path[0], z);
      }
    }
    b.retract();
  }
  return { outlinesWithoutTabs };
}

/** Hole exactly the size of the bit: peck drilling, rising to clear the chips. */
export function peck(b: PathBuilder, center: Pt, depth: number, stepdown: number) {
  b.travel(center);
  for (const z of depthLevels(depth, stepdown)) {
    b.plunge(z);
    b.retract();
  }
}

/** V-bit engraving following the outline, at a single depth. */
export function trace(b: PathBuilder, region: Region, depth: number, direction: Direction) {
  for (const raw of nearestOrder(simplify(region), b, () => 0)) {
    const path = rotateToNearest(orient(raw, direction, "pocket"), b);
    b.travel(path[0]);
    b.plunge(-depth);
    for (let i = 1; i < path.length; i++) b.feed(path[i], -depth);
    b.feed(path[0], -depth);
    b.retract();
  }
}

export interface VCarveOpts {
  /** Half the tip angle, in radians. */
  halfAngle: number;
  /** Maximum depth (limit from the user, the bit and the material). */
  maxDepth: number;
  stepdown: number;
  direction: Direction;
  /** Distance between rings, in mm. */
  step?: number;
}

export interface VCarveResult {
  /** Area (mm²) left with a flat bottom because of the depth limit. */
  flatArea: number;
}

/**
 * True V-carve: the depth follows the stroke width. Offset rings inward at a distance d
 * from the edge are cut at depth d / tan(half angle); that way the bit's cone touches the
 * edge exactly and the bottom rises to the center line of each stroke, as in hand
 * carving. Where the depth would exceed the limit, the bottom is left flat and cleared with
 * the V-bit itself, in closely spaced passes.
 */
export function vcarve(b: PathBuilder, region: Region, o: VCarveOpts): VCarveResult {
  const tan = Math.tan(o.halfAngle);
  const step = o.step ?? 0.2;
  const dCap = o.maxDepth * tan;
  // On the flat bottom, passes close enough that the ridge between them is ~0.08 mm.
  const flatStep = Math.max(0.1, 2 * 0.08 * tan);
  let flatArea = 0;

  type Ring = { d: number; z: number; path: Pt[] };
  for (const comp of components(simplify(region))) {
    const rings: Ring[] = [];
    let d = step / 2;
    for (let k = 0; k < 20000; k++) {
      const cur = simplify(offset(comp, -d));
      if (area(cur) <= 0) break;
      const z = -Math.min(d / tan, o.maxDepth);
      for (const p of cur) rings.push({ d, z, path: orient(p, o.direction, "pocket") });
      d += d < dCap ? step : flatStep;
    }
    flatArea += Math.max(0, area(offset(comp, -dCap)));
    if (!rings.length) continue;

    // Per depth level: each ring goes down at most to the current level, and only enters the
    // levels where it still has material to remove.
    const levels = depthLevels(o.maxDepth, o.stepdown);
    let prev = 0;
    for (const level of levels) {
      const todo = rings.filter((r) => r.z < prev - 1e-6);
      for (const r of nearestRings(todo, b)) {
        const z = Math.max(r.z, level);
        const path = rotateToNearest(r.path, b);
        b.travel(path[0]);
        b.plunge(z);
        for (let i = 1; i < path.length; i++) b.feed(path[i], z);
        b.feed(path[0], z);
      }
      b.retract();
      prev = level;
    }
  }
  return { flatArea };
}

function nearestRings<R extends { path: Pt[] }>(rings: R[], from: Pt): R[] {
  const pending = [...rings];
  const out: R[] = [];
  let cur = { x: from.x, y: from.y };
  while (pending.length) {
    let bi = 0;
    let bd = Infinity;
    pending.forEach((r, i) => {
      for (const q of r.path) {
        const dd = (q.x - cur.x) ** 2 + (q.y - cur.y) ** 2;
        if (dd < bd) {
          bd = dd;
          bi = i;
        }
      }
    });
    const next = pending.splice(bi, 1)[0];
    out.push(next);
    cur = rotateToNearest(next.path, cur)[0];
  }
  return out;
}

export interface HatchOpts {
  /** Effective bit radius at the depth (0 for the tip of a V-bit). */
  radius: number;
  depth: number;
  stepdown: number;
  spacing: number;
  /** Line angle, in degrees. */
  angle: number;
  direction: Direction;
}

/**
 * Hatch engraving: the element's outline plus parallel lines inside it, instead of
 * clearing the whole area. It looks like a texture and cuts much faster.
 */
export function hatch(b: PathBuilder, region: Region, o: HatchOpts): boolean {
  const inner = o.radius > 0 ? simplify(offset(region, -o.radius)) : simplify(region);
  if (area(inner) <= 0) return false;
  const a = (o.angle * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  // Rotate the region so the lines are horizontal, cut, and rotate back.
  const rot = inner.map((p) => p.map((q) => ({ x: q.x * c + q.y * s, y: -q.x * s + q.y * c })));
  const unrot = (q: Pt): Pt => ({ x: q.x * c - q.y * s, y: q.x * s + q.y * c });
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of rot) for (const q of p) {
    y0 = Math.min(y0, q.y);
    y1 = Math.max(y1, q.y);
  }
  const segs: [Pt, Pt][] = [];
  let flip = false;
  for (let y = y0 + o.spacing / 2; y < y1; y += o.spacing) {
    const xs: number[] = [];
    for (const p of rot) {
      for (let i = 0; i < p.length; i++) {
        const P = p[i];
        const Q = p[(i + 1) % p.length];
        if (P.y > y !== Q.y > y) xs.push(P.x + ((y - P.y) * (Q.x - P.x)) / (Q.y - P.y));
      }
    }
    xs.sort((m, n) => m - n);
    const row: [Pt, Pt][] = [];
    for (let i = 0; i + 1 < xs.length; i += 2) {
      if (xs[i + 1] - xs[i] < 0.05) continue;
      row.push([unrot({ x: xs[i], y }), unrot({ x: xs[i + 1], y })]);
    }
    if (flip) row.reverse().forEach((sg) => sg.reverse());
    segs.push(...row);
    flip = !flip;
  }
  for (const z of depthLevels(o.depth, o.stepdown)) {
    for (const raw of nearestOrder(inner, b, () => 0)) {
      const path = rotateToNearest(orient(raw, o.direction, "pocket"), b);
      b.travel(path[0]);
      b.plunge(z);
      for (let i = 1; i < path.length; i++) b.feed(path[i], z);
      b.feed(path[0], z);
    }
    for (const [p, q] of segs) {
      // Next segment starting near the end of the previous one, inside the region: continue without lifting.
      if (Math.abs(b.z - z) < 1e-6 && dist(b, p) <= o.spacing * 1.6 && segmentInside(inner, b, p)) b.feed(p, z);
      else {
        b.travel(p);
        b.plunge(z);
      }
      b.feed(q, z);
    }
    b.retract();
  }
  return true;
}

// ---------------------------------------------------------------------------

/**
 * Clipper's natural orientation: outer contours counterclockwise, holes clockwise.
 * With the spindle turning clockwise, this orientation gives conventional cutting
 * in a pocket and climb cutting on an outside profile.
 */
function orient(p: Pt[], direction: Direction, use: "pocket" | "profile"): Pt[] {
  const naturalIsConventional = use === "pocket";
  const keep = (direction === "conventional") === naturalIsConventional;
  return keep ? p : [...p].reverse();
}

/** Splits a region into connected components (each outer contour with its holes). */
function components(r: Region): Region[] {
  const outers = r.filter((p) => pathArea(p) > 0);
  const holes = r.filter((p) => pathArea(p) < 0);
  const comps: Region[] = outers.map((o) => [o]);
  for (const h of holes) {
    // A hole belongs to the smallest outer contour that contains it.
    let best = -1;
    let bestArea = Infinity;
    outers.forEach((o, i) => {
      if (pointInRegion([o], h[0]) && pathArea(o) < bestArea) {
        best = i;
        bestArea = pathArea(o);
      }
    });
    if (best >= 0) comps[best].push(h);
  }
  return comps;
}

function nearestOrder(paths: Pt[][], from: Pt, group: (p: Pt[]) => number): Pt[][] {
  const pending = [...paths];
  const out: Pt[][] = [];
  let cur = { x: from.x, y: from.y };
  while (pending.length) {
    const g = Math.min(...pending.map(group));
    let bi = -1;
    let bd = Infinity;
    pending.forEach((p, i) => {
      if (group(p) !== g) return;
      const d = Math.min(...p.map((q) => dist(q, cur)));
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    const next = pending.splice(bi, 1)[0];
    out.push(next);
    cur = rotateToNearest(next, cur)[0];
  }
  return out;
}

type Window = [number, number];

/** Windows (in arc length) where the bit lifts to leave the tabs. */
function tabWindows(path: Pt[], n: number, len: number): Window[] {
  const per = perimeter(path);
  const count = Math.min(n, Math.floor(per / (len * 2.5)));
  if (count < 1) return [];
  return Array.from({ length: count }, (_, i) => {
    const c = ((i + 0.5) * per) / count;
    return [c - len / 2, c + len / 2] as Window;
  });
}

function followWithTabs(b: PathBuilder, path: Pt[], z: number, tabTop: number, tabs: Window[]) {
  const closed = [...path, path[0]];
  let s = 0;
  for (let i = 1; i < closed.length; i++) {
    const a = closed[i - 1];
    const c = closed[i];
    const seg = dist(a, c);
    // Points where the segment crosses the window edges.
    const cuts = [0, seg];
    for (const [w0, w1] of tabs) {
      for (const w of [w0, w1]) if (w > s && w < s + seg) cuts.push(w - s);
    }
    cuts.sort((p, q) => p - q);
    for (let k = 1; k < cuts.length; k++) {
      const t0 = cuts[k - 1];
      const t1 = cuts[k];
      if (t1 - t0 < 1e-9) continue;
      const mid = s + (t0 + t1) / 2;
      const inTab = tabs.some(([w0, w1]) => mid > w0 && mid < w1);
      const targetZ = inTab ? tabTop : z;
      if (Math.abs(b.z - targetZ) > 1e-9) b.feedZ(targetZ);
      const t = t1 / seg;
      b.feed({ x: a.x + (c.x - a.x) * t, y: a.y + (c.y - a.y) * t }, targetZ);
    }
    s += seg;
  }
  if (Math.abs(b.z - z) > 1e-9) b.feedZ(z);
}
