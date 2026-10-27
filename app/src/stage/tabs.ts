import { canonicalOutline, MIN_TAB_WIDTH, outerOutlines, pointAtFraction, type GenerateResult } from "@carvcam/cam-engine";
import type { Tabs } from "../state/design";

/**
 * Holding tabs on the canvas: where to draw them, how to edit Manual positions and the limits
 * shown in Prepare. Positions are fractions (0–1) of the part's outer outline, counter-clockwise
 * from its lowest-left point, exactly as the engine reads them (cam/tabs.ts).
 */

/** Tabs are drawn in a strong amber with a dark outline, everywhere (2D, 3D, simulation, legend). */
export const TAB_COLOR = "#FFB020";
export const TAB_EDGE = "#6B3500";

type Pt = { x: number; y: number };

/** One tab to draw, in stock mm. */
export interface TabMark {
  /** Center on the bit path. */
  x: number;
  y: number;
  /** Direction of the outline (degrees, 0 = +X, counter-clockwise). */
  angle: number;
  /** Wood left along the edge (mm). */
  width: number;
  /** Width of the cut (bit diameter, mm). */
  kerf: number;
  /** Index into the Manual positions (or the engine's order in Auto). */
  index: number;
  outline: number;
}

/** The cutout bit's diameter, from the result (the profile operation's tool). */
export function profileKerf(result: GenerateResult | null, fallback = 3.175): number {
  const op = result?.operations.find((o) => o.type === "profile");
  return result?.tools.find((t) => t.id === op?.tool)?.diameter ?? result?.tabs?.[0]?.kerf ?? fallback;
}

/** The outer outlines of the cut, canonical (as positions are measured). */
export function profileOutlines(result: GenerateResult | null): Pt[][] {
  const region = result?.layout.profile?.region;
  return region ? outerOutlines(region).map(canonicalOutline) : [];
}

/**
 * Tabs to draw. Manual: straight from the positions (so a drag shows at once, without waiting for
 * the engine). Auto: the tabs the engine actually left.
 */
export function tabMarks(tabs: Tabs, result: GenerateResult | null, positions?: number[]): TabMark[] {
  if (!result?.layout.profile) return [];
  const kerf = profileKerf(result);
  if (tabs.mode === "manual") {
    const pos = positions ?? tabs.positions ?? [];
    return profileOutlines(result).flatMap((o, outline) =>
      pos.map((t, index) => {
        const p = pointAtFraction(o, t);
        return { x: p.x + (p.nx * kerf) / 2, y: p.y + (p.ny * kerf) / 2, angle: p.angle, width: tabs.width, kerf, index, outline };
      }),
    );
  }
  return (result.tabs ?? []).map((t, index) => ({ x: t.x, y: t.y, angle: t.angle, width: t.width, kerf: t.kerf, index, outline: t.outline }));
}

/** `n` positions spread evenly (the same spacing the engine uses in Auto). */
export const evenPositions = (n: number) => Array.from({ length: n }, (_, i) => Math.round(((i + 0.5) / n) * 1e4) / 1e4);

/** Auto → Manual without anything jumping: the positions the engine used on the first outline. */
export function positionsFromResult(result: GenerateResult | null, count: number): number[] {
  const first = (result?.tabs ?? []).filter((t) => t.outline === 0).map((t) => t.t);
  return first.length ? [...first].sort((a, b) => a - b) : evenPositions(Math.max(1, count));
}

const wrap = (t: number) => Math.round((((t % 1) + 1) % 1) * 1e4) / 1e4;

/** Distance between two positions around the loop (0–0.5). */
export const loopDist = (a: number, b: number) => {
  const d = Math.abs(wrap(a) - wrap(b));
  return Math.min(d, 1 - d);
};

/** Fraction of the outline a tab (plus the bit on both sides) takes, with a little room. */
export function tabSpan(width: number, kerf: number, perimeter: number) {
  return perimeter > 0 ? (width + 2 * kerf) / perimeter : 0;
}

/** Adds a tab at `t` unless it lands on an existing one (`minGap` as a fraction). Sorted. */
export function addPosition(positions: number[], t: number, minGap = 0): number[] {
  const v = wrap(t);
  if (positions.some((p) => loopDist(p, v) < minGap)) return positions;
  return [...positions, v].sort((a, b) => a - b);
}

export const movePosition = (positions: number[], i: number, t: number) => positions.map((p, k) => (k === i ? wrap(t) : p));
export const removePosition = (positions: number[], i: number) => positions.filter((_, k) => k !== i);

/** Perimeter of a closed outline (mm). */
export function outlineLength(o: Pt[]): number {
  let s = 0;
  for (let i = 0; i < o.length; i++) s += Math.hypot(o[(i + 1) % o.length].x - o[i].x, o[(i + 1) % o.length].y - o[i].y);
  return s;
}

/** Converts a position to mm along the outline, and back (for "at 120 mm" labels). */
export const positionToMm = (t: number, perimeter: number) => wrap(t) * perimeter;
export const mmToPosition = (mm: number, perimeter: number) => (perimeter > 0 ? wrap(mm / perimeter) : 0);

/**
 * What the steppers allow, with the reason shown when a limit is hit. Height stays at least 1 mm
 * under the top (otherwise nothing gets cut there); width at least MIN_TAB_WIDTH (thinner tabs snap).
 */
export function tabLimits(thickness: number) {
  const maxHeight = Math.max(0.5, Math.min(Math.floor((thickness - 1) * 2) / 2, 10));
  return {
    minHeight: 0.5,
    maxHeight,
    minWidth: MIN_TAB_WIDTH,
    maxWidth: 30,
    heightNote: `Up to ${maxHeight} mm on a ${thickness} mm board: the bit still has to cut the top of the tab away.`,
    widthNote: `At least ${MIN_TAB_WIDTH} mm, or the tab can snap before the cut is done.`,
  };
}

/**
 * Cells of a height map that belong to a tab (rotated rectangle `width` × `kerf` around each tab,
 * grown by `pad` mm). Marks only the tab footprints, so it costs the tabs' area, not the grid's.
 */
export function tabMask(grid: { x0: number; y0: number; cols: number; rows: number; res: number }, marks: TabMark[], pad = 0.4): Uint8Array {
  const { x0, y0, cols, rows, res } = grid;
  const mask = new Uint8Array(cols * rows);
  for (const m of marks) {
    const a = (m.angle * Math.PI) / 180;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const hl = m.width / 2 + pad;
    const hk = m.kerf / 2 + pad;
    const R = Math.hypot(hl, hk);
    const i0 = Math.max(0, Math.floor((m.x - R - x0) / res));
    const i1 = Math.min(cols - 1, Math.ceil((m.x + R - x0) / res));
    const j0 = Math.max(0, Math.floor((m.y - R - y0) / res));
    const j1 = Math.min(rows - 1, Math.ceil((m.y + R - y0) / res));
    for (let j = j0; j <= j1; j++) {
      const dy = y0 + j * res - m.y;
      for (let i = i0; i <= i1; i++) {
        const dx = x0 + i * res - m.x;
        if (Math.abs(dx * ux + dy * uy) <= hl && Math.abs(-dx * uy + dy * ux) <= hk) mask[j * cols + i] = 1;
      }
    }
  }
  return mask;
}
