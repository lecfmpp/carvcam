import { DEFAULT_KEEP_OUT_CLEARANCE, type GenerateResult, type KeepOutZone } from "@gsender-next/cam-engine";

/**
 * Clamps & keep-out zones: editing math for the Position step (pure, tested).
 * Everything is in stock coordinates, mm: X0 Y0 = bottom-left corner of the board; a zone's
 * x/y is its bottom-left corner.
 */

export const MIN_ZONE = 4;
/** Stable empty list (a new [] in a store selector would re-render forever). */
export const NO_ZONES: KeepOutZone[] = [];
/** How far outside the board a zone may sit (clamps grip the edge from outside). */
export const ZONE_REACH = 80;
const DEFAULT_W = 40;
const DEFAULT_H = 30;
/** How far a new clamp reaches onto the board (most signs leave a margin at least this wide). */
const GRIP = 5;

export interface Bounds {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

export type Handle = "nw" | "ne" | "sw" | "se";

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Area a zone may occupy for a board of this size. */
export function zoneBounds(stock: { width: number; height: number }, reach = ZONE_REACH): Bounds {
  return { xMin: -reach, yMin: -reach, xMax: stock.width + reach, yMax: stock.height + reach };
}

/** "Clamp N", one more than the highest number already used. */
export function nextZoneLabel(zones: KeepOutZone[]) {
  const n = zones.reduce((m, z) => Math.max(m, Number(/^Clamp (\d+)$/.exec(z.label ?? "")?.[1] ?? 0)), 0);
  return `Clamp ${Math.max(n, zones.length) + 1}`;
}

let seq = 0;
export const zoneId = () => `z${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Zone with positive width/height, rounded to 0.1 mm and at least MIN_ZONE on each side. */
export function normalizeZone<T extends KeepOutZone>(z: T): T {
  const x = Math.min(z.x, z.x + z.width);
  const y = Math.min(z.y, z.y + z.height);
  return { ...z, x: r1(x), y: r1(y), width: r1(Math.max(MIN_ZONE, Math.abs(z.width))), height: r1(Math.max(MIN_ZONE, Math.abs(z.height))) };
}

/** Rectangle between two points (a drag), clamped to the bounds. */
export function rectFromDrag(a: { x: number; y: number }, b: { x: number; y: number }, bounds: Bounds) {
  const cx = (v: number) => Math.max(bounds.xMin, Math.min(bounds.xMax, v));
  const cy = (v: number) => Math.max(bounds.yMin, Math.min(bounds.yMax, v));
  const x0 = cx(Math.min(a.x, b.x));
  const x1 = cx(Math.max(a.x, b.x));
  const y0 = cy(Math.min(a.y, b.y));
  const y1 = cy(Math.max(a.y, b.y));
  return { x: r1(x0), y: r1(y0), width: r1(x1 - x0), height: r1(y1 - y0) };
}

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: KeepOutZone) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * A new clamp in a sensible spot: gripping the middle of the left, right, bottom or top edge
 * (5 mm onto the board, in that order), the first one that does not overlap an existing zone.
 */
export function newZone(zones: KeepOutZone[], stock: { width: number; height: number }): KeepOutZone {
  const W = stock.width;
  const H = stock.height;
  const g = GRIP;
  const spots = [
    { x: g - DEFAULT_W, y: H / 2 - DEFAULT_H / 2, width: DEFAULT_W, height: DEFAULT_H },
    { x: W - g, y: H / 2 - DEFAULT_H / 2, width: DEFAULT_W, height: DEFAULT_H },
    { x: W / 2 - DEFAULT_H / 2, y: g - DEFAULT_W, width: DEFAULT_H, height: DEFAULT_W },
    { x: W / 2 - DEFAULT_H / 2, y: H - g, width: DEFAULT_H, height: DEFAULT_W },
    { x: g - DEFAULT_W, y: g - DEFAULT_H, width: DEFAULT_W, height: DEFAULT_H },
    { x: W - g, y: H - g, width: DEFAULT_W, height: DEFAULT_H },
  ];
  const spot = spots.find((s) => !zones.some((z) => overlaps(s, z))) ?? spots[zones.length % spots.length];
  return normalizeZone({ id: zoneId(), label: nextZoneLabel(zones), ...spot, clearance: DEFAULT_KEEP_OUT_CLEARANCE });
}

/** Moves a zone by (dx, dy), keeping it inside the bounds. */
export function moveZone<T extends KeepOutZone>(z: T, dx: number, dy: number, bounds: Bounds): T {
  const x = Math.max(bounds.xMin, Math.min(bounds.xMax - z.width, z.x + dx));
  const y = Math.max(bounds.yMin, Math.min(bounds.yMax - z.height, z.y + dy));
  return { ...z, x: r1(x), y: r1(y) };
}

/**
 * Drags one corner to (px, py); the opposite corner stays put. Crossing over the opposite corner
 * is stopped at MIN_ZONE, and the corner stays inside the bounds.
 */
export function resizeZone<T extends KeepOutZone>(z: T, handle: Handle, px: number, py: number, bounds: Bounds): T {
  const x = Math.max(bounds.xMin, Math.min(bounds.xMax, px));
  const y = Math.max(bounds.yMin, Math.min(bounds.yMax, py));
  let x0 = z.x;
  let x1 = z.x + z.width;
  let y0 = z.y;
  let y1 = z.y + z.height;
  if (handle === "nw" || handle === "sw") x0 = Math.min(x, x1 - MIN_ZONE);
  else x1 = Math.max(x, x0 + MIN_ZONE);
  if (handle === "sw" || handle === "se") y0 = Math.min(y, y1 - MIN_ZONE);
  else y1 = Math.max(y, y0 + MIN_ZONE);
  return { ...z, x: r1(x0), y: r1(y0), width: r1(x1 - x0), height: r1(y1 - y0) };
}

/** Sets one numeric field from a text input (ignores anything that isn't a number). */
export function setZoneField<T extends KeepOutZone>(z: T, field: "x" | "y" | "width" | "height" | "clearance", raw: string): T {
  const v = Number(raw.replace(",", "."));
  if (raw.trim() === "" || !Number.isFinite(v)) return z;
  if (field === "width" || field === "height") return { ...z, [field]: r1(Math.max(MIN_ZONE, v)) };
  if (field === "clearance") return { ...z, clearance: r1(Math.max(0, Math.min(200, v))) };
  return { ...z, [field]: r1(v) };
}

export interface ZoneIssue {
  code: "KEEP_OUT_OVERLAP" | "KEEP_OUT_TOO_TALL" | "KEEP_OUT_PATH";
  title: string;
  body: string;
  /** Index into the zones, when the issue points at one. */
  zoneIndex?: number;
}

/**
 * The keep-out problems in a result: overlap and too-tall errors from the engine, plus verifier
 * problems about moves through a zone (grouped, so a hundred bad lines make one card).
 */
export function zoneIssues(result: GenerateResult | null, zones: KeepOutZone[]): ZoneIssue[] {
  if (!result || !zones.length) return [];
  const out: ZoneIssue[] = [];
  const seen = new Set<string>();
  for (const w of result.warnings) {
    if (w.code !== "KEEP_OUT_OVERLAP" && w.code !== "KEEP_OUT_TOO_TALL") continue;
    if (seen.has(w.message)) continue;
    seen.add(w.message);
    const zi = w.data?.zoneIndex;
    const zn = w.data?.zone;
    const zoneIndex = typeof zi === "number" ? zi : typeof zn === "string" ? zones.findIndex((z) => z.id === zn || z.label === zn) : -1;
    out.push({
      code: w.code,
      title: w.message,
      body: w.suggestion ?? (w.code === "KEEP_OUT_TOO_TALL" ? "Use a lower clamp, or set a lower clamp height." : "Move the clamp or the design so they don't overlap."),
      zoneIndex: zoneIndex >= 0 ? zoneIndex : undefined,
    });
  }
  const path = (result.verification?.problems ?? []).filter((p) => p.severity === "error" && /keep-out zone/i.test(p.message));
  if (path.length && !out.some((o) => o.code === "KEEP_OUT_OVERLAP")) {
    const name = /keep-out zone "([^"]+)"/.exec(path[0].message)?.[1];
    const zi = name ? zones.findIndex((z, i) => (z.label || z.id || `zone ${i + 1}`) === name) : -1;
    out.push({
      code: "KEEP_OUT_PATH",
      title: `The bit would pass through ${name ? `"${name}"` : "a keep-out zone"} (${path.length} move${path.length > 1 ? "s" : ""}).`,
      body: "Move the clamp away from the toolpath, or raise its height so the bit travels over it.",
      zoneIndex: zi >= 0 ? zi : undefined,
    });
  }
  return out;
}

/** True when the zone shares area with the board itself (so it's on the part of the bed you carve). */
export const zoneTouchesBoard = (z: KeepOutZone, stock: { width: number; height: number }) => overlaps({ x: 0, y: 0, width: stock.width, height: stock.height }, z);

/** How far the zones reach past each side of the board, mm (0 when inside), to fit the view. */
export function zoneOverhang(zones: KeepOutZone[], stock: { width: number; height: number }) {
  let x = 0;
  let y = 0;
  for (const z of zones) {
    x = Math.max(x, -z.x, z.x + z.width - stock.width);
    y = Math.max(y, -z.y, z.y + z.height - stock.height);
  }
  return { x, y };
}
