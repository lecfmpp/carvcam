/**
 * Holding-tab placement shared by the engine and the UI.
 *
 * Manual tab positions are stored as **fractions (0–1) of an outline's perimeter**, measured on
 * the part's outer outline (the finished edge, not the bit path) counter-clockwise (Y up), starting
 * at the outline's lowest vertex (leftmost of the lowest when several tie). The start and the
 * direction depend only on the shape, so a position keeps pointing at the same spot when the bit,
 * the cut direction or the stock margin change, and stays valid when the sign is resized.
 * The same fractions apply to every outer outline of the part (one per letter in lettering).
 */

export type Pt = { x: number; y: number };

/** Signed area (positive = counter-clockwise with Y up). */
function signedArea(p: Pt[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** The outer outlines of a region (positive area), in the region's order. */
export function outerOutlines(region: Pt[][]): Pt[][] {
  return region.filter((p) => p.length >= 3 && signedArea(p) > 0);
}

/** The outline counter-clockwise, starting at its lowest (then leftmost) vertex. */
export function canonicalOutline(path: Pt[]): Pt[] {
  const p = signedArea(path) < 0 ? [...path].reverse() : path;
  let best = 0;
  for (let i = 1; i < p.length; i++) {
    const q = p[i];
    const b = p[best];
    if (q.y < b.y - 1e-6 || (Math.abs(q.y - b.y) <= 1e-6 && q.x < b.x)) best = i;
  }
  return [...p.slice(best), ...p.slice(0, best)];
}

/** Cumulative arc length at each vertex of a closed path (last entry = perimeter). */
function arcLengths(p: Pt[]): number[] {
  const s = [0];
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s.push(s[i] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  return s;
}

export interface OutlinePoint extends Pt {
  /** Direction of travel (counter-clockwise) in degrees, 0 = +X. */
  angle: number;
  /** Unit normal pointing out of the part. */
  nx: number;
  ny: number;
}

/** The point at fraction `t` (wrapped to 0–1) of a canonical outline. */
export function pointAtFraction(canonical: Pt[], t: number): OutlinePoint {
  const s = arcLengths(canonical);
  const per = s[s.length - 1];
  const u = (((t % 1) + 1) % 1) * per;
  let i = 0;
  while (i < canonical.length - 1 && s[i + 1] < u) i++;
  const a = canonical[i];
  const b = canonical[(i + 1) % canonical.length];
  const seg = s[i + 1] - s[i];
  const k = seg > 0 ? (u - s[i]) / seg : 0;
  const dx = seg > 0 ? (b.x - a.x) / seg : 1;
  const dy = seg > 0 ? (b.y - a.y) / seg : 0;
  // Counter-clockwise: the outside is to the right of the direction of travel.
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, angle: (Math.atan2(dy, dx) * 180) / Math.PI, nx: dy, ny: -dx };
}

/** Nearest point of a closed path to `pt`: its arc length from the path start and the distance. */
export function projectOnPath(path: Pt[], pt: Pt): { s: number; dist: number; per: number } {
  const s = arcLengths(path);
  let best = { s: 0, dist: Infinity };
  for (let i = 0; i < path.length; i++) {
    const a = path[i];
    const b = path[(i + 1) % path.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L2 = dx * dx + dy * dy;
    const k = L2 > 0 ? Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / L2)) : 0;
    const d = Math.hypot(a.x + dx * k - pt.x, a.y + dy * k - pt.y);
    if (d < best.dist) best = { s: s[i] + k * (s[i + 1] - s[i]), dist: d };
  }
  return { ...best, per: s[s.length - 1] };
}

/** Fraction (0–1) of the canonical outline nearest to `pt`, and how far `pt` is from it. */
export function fractionOnOutline(canonical: Pt[], pt: Pt): { t: number; dist: number } {
  const r = projectOnPath(canonical, pt);
  return { t: r.per > 0 ? (r.s / r.per) % 1 : 0, dist: r.dist };
}

/**
 * The outer outline of `region` nearest to `pt` (index into outerOutlines) and the fraction on it.
 * Used by the UI to turn a click or a drag into a tab position.
 */
export function nearestTabFraction(region: Pt[][], pt: Pt): { outline: number; t: number; dist: number } | null {
  let best: { outline: number; t: number; dist: number } | null = null;
  outerOutlines(region).forEach((o, i) => {
    const r = fractionOnOutline(canonicalOutline(o), pt);
    if (!best || r.dist < best.dist) best = { outline: i, ...r };
  });
  return best;
}

/** Where the bit leaves a tab, as reported in the result (for previews and the setup sheet). */
export interface TabPlacement {
  /** Center of the tab on the bit's path (stock coordinates, mm). */
  x: number;
  y: number;
  /** Direction of the outline there, degrees (0 = +X). */
  angle: number;
  /** Fraction along its outline (see the module notes), so the UI can switch Auto → Manual in place. */
  t: number;
  /** Index of the outer outline (outerOutlines(layout.profile.region)). */
  outline: number;
  /** Length of wood left along the edge (mm). */
  width: number;
  /** Height of the tab above the bottom of the board (mm). */
  height: number;
  /** Width of the cut the tab bridges (the cutout bit's diameter, mm). */
  kerf: number;
}
