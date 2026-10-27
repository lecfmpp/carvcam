import * as ot from "opentype.js";
import type { FontMap } from "./layout.js";
import type { FontId } from "./schema.js";

/** Fontes incluídas (todas SIL Open Font License; licenças em fonts/). */
export const FONT_FILES: Record<FontId, { file: string; name: string; style: string }> = {
  "archivo-black": { file: "archivoblack/ArchivoBlack-Regular.ttf", name: "Archivo Black", style: "Sem serifa, bem grossa: a mais fácil de usinar" },
  pacifico: { file: "pacifico/Pacifico-Regular.ttf", name: "Pacifico", style: "Cursiva, letras ligadas: boa para letreiro contínuo" },
  "bebas-neue": { file: "bebasneue/BebasNeue-Regular.ttf", name: "Bebas Neue", style: "Condensada, só maiúsculas" },
};

/** Carrega as fontes a partir de bytes (funciona no navegador com fetch e no Node com fs). */
export async function loadFonts(read: (file: string) => Promise<ArrayBuffer>, ids: FontId[] = Object.keys(FONT_FILES) as FontId[]): Promise<FontMap> {
  const out: FontMap = {};
  for (const id of ids) out[id] = parseFont(await read(FONT_FILES[id].file));
  return out;
}

/**
 * O opentype.js publica UMD (Node) e ESM (bundlers): num caso `parse` vem no `default`,
 * no outro vem como export nomeado.
 */
function parseFont(buf: ArrayBuffer) {
  const mod = ot as unknown as { parse?: typeof ot.parse; default?: { parse: typeof ot.parse } };
  return (mod.parse ?? mod.default!.parse)(buf);
}
