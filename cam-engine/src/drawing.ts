import { parseDxf } from "./dxf.js";
import { parseSvg, InvalidSvg, type SvgDrawing } from "./svg.js";

export type Format = "svg" | "dxf";

/** Formato pelo conteúdo: SVG é XML; DXF começa com o par "0 / SECTION". */
export function detectFormat(text: string): Format | null {
  const t = text.trimStart();
  if (t.startsWith("<") || /<svg[\s>]/i.test(t.slice(0, 4000))) return "svg";
  if (/^0\s*\r?\n\s*SECTION/.test(t) || /\n\s*SECTION\s*\r?\n/.test(t.slice(0, 2000))) return "dxf";
  return null;
}

const cache = new Map<string, SvgDrawing & { openPaths?: number }>();

/** Lê um desenho importado (SVG ou DXF). Lança InvalidSvg com mensagem para o usuário. */
export function parseDrawing(text: string): SvgDrawing & { openPaths?: number } {
  const hit = cache.get(text);
  if (hit) return hit;
  const f = detectFormat(text);
  if (!f) throw new InvalidSvg("O arquivo não é SVG nem DXF.");
  const d = f === "svg" ? parseSvg(text) : parseDxf(text);
  if (cache.size > 16) cache.delete(cache.keys().next().value!);
  cache.set(text, d);
  return d;
}
