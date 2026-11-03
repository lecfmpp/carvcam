/**
 * Copies grid maths for the UI: how many copies fit, how much room the grid takes and where to put
 * the group to fill the board. Everything in part mm (origin at the bottom-left corner); rows go
 * down from the original, columns go to the right.
 */
export interface GroupBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type UsableArea = GroupBox;

/** Usable area of a board: the board minus a border (1 mm, or the frame). */
export function usableArea(width: number, height: number, border = 1): UsableArea {
  return { x0: border, y0: border, x1: width - border, y1: height - border };
}

/** Pitch between centers for a gap between copies. */
export function pitch(g: GroupBox, gapX: number, gapY: number) {
  return { dx: round2(g.x1 - g.x0 + gapX), dy: round2(g.y1 - g.y0 + gapY) };
}

/** Size the grid takes (from the original's corner to the last copy's corner). */
export function gridSize(g: GroupBox, rows: number, cols: number, dx: number, dy: number) {
  return { width: g.x1 - g.x0 + (cols - 1) * dx, height: g.y1 - g.y0 + (rows - 1) * dy };
}

/** How many rows and columns fit from where the group is (to the right and down). */
export function maxFromGroup(g: GroupBox, a: UsableArea, dx: number, dy: number) {
  const cols = dx > 0 ? Math.floor((a.x1 - g.x1) / dx + 1e-6) + 1 : 1;
  const rows = dy > 0 ? Math.floor((g.y0 - a.y0) / dy + 1e-6) + 1 : 1;
  return { rows: clamp(rows), cols: clamp(cols) };
}

/**
 * Fills the area: the most rows and columns, and the move that centers the grid in it.
 * Null when not even one copy fits.
 */
export function fillArea(g: GroupBox, a: UsableArea, dx: number, dy: number) {
  const w = g.x1 - g.x0;
  const h = g.y1 - g.y0;
  const aw = a.x1 - a.x0;
  const ah = a.y1 - a.y0;
  if (w > aw + 1e-6 || h > ah + 1e-6) return null;
  const cols = clamp(dx > 0 ? Math.floor((aw - w) / dx + 1e-6) + 1 : 1);
  const rows = clamp(dy > 0 ? Math.floor((ah - h) / dy + 1e-6) + 1 : 1);
  const t = gridSize(g, rows, cols, dx, dy);
  const left = a.x0 + (aw - t.width) / 2;
  const top = a.y1 - (ah - t.height) / 2;
  return { rows, cols, move: { dx: round2(left - g.x0), dy: round2(top - g.y1) } };
}

/** Whether the grid fits in the area with the group where it is. */
export function gridFits(g: GroupBox, a: UsableArea, rows: number, cols: number, dx: number, dy: number) {
  const t = gridSize(g, rows, cols, dx, dy);
  return g.x0 >= a.x0 - 1e-6 && g.x0 + t.width <= a.x1 + 1e-6 && g.y1 <= a.y1 + 1e-6 && g.y1 - t.height >= a.y0 - 1e-6;
}

const clamp = (n: number) => Math.max(1, Math.min(40, n));
const round2 = (v: number) => Math.round(v * 100) / 100;
