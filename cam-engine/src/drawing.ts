import { parseDxf } from "./dxf.js";
import { parseSvg, InvalidSvg, type SvgDrawing } from "./svg.js";

export type Format = "svg" | "dxf";

/** Detects the format from the content: SVG is XML; DXF starts with the "0 / SECTION" pair. */
export function detectFormat(text: string): Format | null {
  const t = text.trimStart();
  if (t.startsWith("<") || /<svg[\s>]/i.test(t.slice(0, 4000))) return "svg";
  if (/^0\s*\r?\n\s*SECTION/.test(t) || /\n\s*SECTION\s*\r?\n/.test(t.slice(0, 2000))) return "dxf";
  return null;
}

const cache = new Map<string, SvgDrawing & { openPaths?: number }>();

/** Reads an imported drawing (SVG or DXF). Throws InvalidSvg with a user-facing message. */
export function parseDrawing(text: string): SvgDrawing & { openPaths?: number } {
  const hit = cache.get(text);
  if (hit) return hit;
  const f = detectFormat(text);
  if (!f) throw new InvalidSvg("The file is neither SVG nor DXF.");
  const d = f === "svg" ? parseSvg(text) : parseDxf(text);
  if (cache.size > 16) cache.delete(cache.keys().next().value!);
  cache.set(text, d);
  return d;
}
