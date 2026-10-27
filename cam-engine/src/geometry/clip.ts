import {
  areaD,
  areaPathsD,
  differenceD,
  EndType,
  FillRule,
  getBoundsPathsD,
  inflatePathsD,
  intersectD,
  JoinType,
  pointInPolygonD,
  PointInPolygonResult,
  simplifyPathsD,
  unionD,
  type PathD,
  type PathsD,
} from "clipper2-ts";

/** 2D region in mm: outer contours positive (counterclockwise), holes negative. */
export type Region = PathsD;
export type Pt = { x: number; y: number };

const PRECISION = 4; // Clipper's internal decimal places (0.1 µm)
const ARC_TOL = 0.02; // mm

export function union(...regions: Region[]): Region {
  const all = regions.flat();
  if (all.length === 0) return [];
  return unionD(all, FillRule.NonZero);
}

export function difference(a: Region, b: Region): Region {
  if (a.length === 0) return [];
  if (b.length === 0) return union(a);
  return differenceD(a, b, FillRule.NonZero, PRECISION);
}

export function intersection(a: Region, b: Region): Region {
  if (a.length === 0 || b.length === 0) return [];
  return intersectD(a, b, FillRule.NonZero, PRECISION);
}

/** Offset with rounded corners (which is what a cylindrical bit does). */
export function offset(r: Region, delta: number): Region {
  if (r.length === 0) return [];
  return inflatePathsD(r, delta, JoinType.Round, EndType.Polygon, 2, PRECISION, ARC_TOL);
}

/**
 * Removes redundant vertices (maximum error `eps` mm). Offsets produce very dense arcs;
 * without this the G-code ends up with hundreds of thousands of micro-segments.
 */
export function simplify(r: Region, eps = 0.01): Region {
  if (r.length === 0) return r;
  return simplifyPathsD(r, eps, true).filter((p) => p.length >= 3);
}

export function area(r: Region): number {
  return Math.abs(areaPathsD(r)) < 1e-9 ? 0 : areaPathsD(r);
}

export function pathArea(p: PathD): number {
  return areaD(p);
}

export function bounds(r: Region) {
  const b = getBoundsPathsD(r);
  return { minX: b.left, minY: b.top, maxX: b.right, maxY: b.bottom };
}

export function translate(r: Region, dx: number, dy: number): Region {
  return r.map((p) => p.map((q) => ({ x: q.x + dx, y: q.y + dy })));
}

export function scale(r: Region, s: number): Region {
  return r.map((p) => p.map((q) => ({ x: q.x * s, y: q.y * s })));
}

/** Point inside the region (honors holes via the NonZero rule through orientation). */
export function pointInRegion(r: Region, pt: Pt): boolean {
  let winding = 0;
  for (const path of r) {
    const res = pointInPolygonD(pt, path);
    if (res === PointInPolygonResult.IsOn) return true;
    if (res === PointInPolygonResult.IsInside) winding += areaD(path) > 0 ? 1 : -1;
  }
  return winding > 0;
}

/** Checks, by sampling, whether the segment a→b lies entirely inside the region. */
export function segmentInside(r: Region, a: Pt, b: Pt, step = 0.2): boolean {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.ceil(len / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (!pointInRegion(r, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false;
  }
  return true;
}

export function perimeter(p: PathD): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return s;
}

/**
 * Area the bit of radius r cannot reach inside the region (inside corners and fine details).
 * It is the difference between the region and its "morphological opening" by the bit's disc.
 */
export function unreachable(r: Region, toolRadius: number): Region {
  const reach = offset(offset(r, -toolRadius), toolRadius);
  // Small allowance so the polygonal approximation of arcs is not flagged.
  return offset(offset(difference(r, reach), -0.02), 0.02);
}
