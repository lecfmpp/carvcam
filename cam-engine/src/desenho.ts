import { parseDxf } from "./dxf.js";
import { parseSvg, SvgInvalido, type SvgDesenho } from "./svg.js";

export type Formato = "svg" | "dxf";

/** Formato pelo conteúdo: SVG é XML; DXF começa com o par "0 / SECTION". */
export function formatoDe(texto: string): Formato | null {
  const t = texto.trimStart();
  if (t.startsWith("<") || /<svg[\s>]/i.test(t.slice(0, 4000))) return "svg";
  if (/^0\s*\r?\n\s*SECTION/.test(t) || /\n\s*SECTION\s*\r?\n/.test(t.slice(0, 2000))) return "dxf";
  return null;
}

const cache = new Map<string, SvgDesenho & { abertos?: number }>();

/** Lê um desenho importado (SVG ou DXF). Lança SvgInvalido com mensagem para o usuário. */
export function parseDesenho(texto: string): SvgDesenho & { abertos?: number } {
  const hit = cache.get(texto);
  if (hit) return hit;
  const f = formatoDe(texto);
  if (!f) throw new SvgInvalido("O arquivo não é SVG nem DXF.");
  const d = f === "svg" ? parseSvg(texto) : parseDxf(texto);
  if (cache.size > 16) cache.delete(cache.keys().next().value!);
  cache.set(texto, d);
  return d;
}
