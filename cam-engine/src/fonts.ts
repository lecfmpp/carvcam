import * as ot from "opentype.js";
import type { FontMap } from "./layout.js";
import type { FontId } from "./schema.js";

/** Fontes incluídas (todas SIL Open Font License; licenças em fonts/). */
export const FONT_FILES: Record<FontId, { arquivo: string; nome: string; estilo: string }> = {
  "archivo-black": { arquivo: "archivoblack/ArchivoBlack-Regular.ttf", nome: "Archivo Black", estilo: "Sem serifa, bem grossa: a mais fácil de usinar" },
  pacifico: { arquivo: "pacifico/Pacifico-Regular.ttf", nome: "Pacifico", estilo: "Cursiva, letras ligadas: boa para letreiro contínuo" },
  "bebas-neue": { arquivo: "bebasneue/BebasNeue-Regular.ttf", nome: "Bebas Neue", estilo: "Condensada, só maiúsculas" },
};

/** Carrega as fontes a partir de bytes (funciona no navegador com fetch e no Node com fs). */
export async function loadFonts(read: (arquivo: string) => Promise<ArrayBuffer>, ids: FontId[] = Object.keys(FONT_FILES) as FontId[]): Promise<FontMap> {
  const out: FontMap = {};
  for (const id of ids) out[id] = parseFont(await read(FONT_FILES[id].arquivo));
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
