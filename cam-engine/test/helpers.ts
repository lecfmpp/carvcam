import { readFileSync } from "node:fs";
import { bounds, pointInRegion, type Pt, type Region } from "../src/geometry/clip.js";
import type { FontMap } from "../src/layout.js";
import { loadFontsFromDisk } from "../src/node.js";

let cache: Promise<FontMap> | null = null;
export const fonts = () => (cache ??= loadFontsFromDisk());

export const example = (name: string) => JSON.parse(readFileSync(new URL(`../examples/${name}.json`, import.meta.url), "utf8"));

/** Pontos de uma grade regular que caem dentro da região. */
export function samplePoints(r: Region, step = 1): Pt[] {
  if (r.length === 0) return [];
  const b = bounds(r);
  const out: Pt[] = [];
  for (let y = b.minY + step / 2; y < b.maxY; y += step) {
    for (let x = b.minX + step / 2; x < b.maxX; x += step) {
      if (pointInRegion(r, { x, y })) out.push({ x, y });
    }
  }
  return out;
}
