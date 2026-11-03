import { area, intersection, type Region } from "./geometry/clip.js";

/**
 * A rectangle the bit must never enter: a clamp, a screw, a hold-down.
 * Stock/work coordinates (X0 Y0 at the bottom-left corner of the stock, Z0 on the top surface);
 * `x`/`y` are the bottom-left corner of the rectangle.
 */
export interface KeepOutZone {
  id?: string;
  label?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Height of the obstacle above the stock top, mm. Default 20. */
  clearance?: number;
}

export const DEFAULT_KEEP_OUT_CLEARANCE = 20;
/** Gap kept between the obstacle top and the travel height, mm. */
export const KEEP_OUT_MARGIN = 2;

export const zoneName = (z: KeepOutZone, i: number) => z.label || z.id || `zone ${i + 1}`;
export const zoneClearance = (z: KeepOutZone) => z.clearance ?? DEFAULT_KEEP_OUT_CLEARANCE;

/** The zone as an axis-aligned box, normalized (negative width/height allowed), optionally grown by `r`. */
export function zoneBox(z: KeepOutZone, r = 0) {
  const x0 = Math.min(z.x, z.x + z.width);
  const x1 = Math.max(z.x, z.x + z.width);
  const y0 = Math.min(z.y, z.y + z.height);
  const y1 = Math.max(z.y, z.y + z.height);
  return { xMin: x0 - r, xMax: x1 + r, yMin: y0 - r, yMax: y1 + r };
}

/** The zone as a region (counterclockwise rectangle). */
export function zoneRegion(z: KeepOutZone): Region {
  const b = zoneBox(z);
  return [
    [
      { x: b.xMin, y: b.yMin },
      { x: b.xMax, y: b.yMin },
      { x: b.xMax, y: b.yMax },
      { x: b.xMin, y: b.yMax },
    ],
  ];
}

/** Area (mm²) shared by a region and the zone. */
export const zoneOverlap = (r: Region, z: KeepOutZone) => area(intersection(r, zoneRegion(z)));

type P3 = { x: number; y: number; z: number };

/**
 * Where the straight 3D segment a→b is lowest while its XY projection is strictly inside the box
 * (Liang–Barsky clipping in XY; Z is linear along the segment, so its minimum is at one end of
 * the clipped piece). Returns that point, or null when the segment never enters the box.
 */
export function lowestPointInBox(a: P3, b: P3, box: { xMin: number; xMax: number; yMin: number; yMax: number }, eps = 1e-6): P3 | null {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const clip = (p: number, q: number) => {
    // p·t ≤ q
    if (Math.abs(p) < 1e-12) return q > 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  // Strict inside: shrink the box by eps so touching the edge is not a hit.
  if (!clip(-dx, a.x - (box.xMin + eps)) || !clip(dx, box.xMax - eps - a.x) || !clip(-dy, a.y - (box.yMin + eps)) || !clip(dy, box.yMax - eps - a.y)) return null;
  if (t0 > t1) return null;
  const at = (t: number): P3 => ({ x: a.x + dx * t, y: a.y + dy * t, z: a.z + (b.z - a.z) * t });
  const p0 = at(t0);
  const p1 = at(t1);
  return p0.z <= p1.z ? p0 : p1;
}
