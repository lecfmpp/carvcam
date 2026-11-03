import * as ot from "opentype.js";
import type { FontMap } from "./layout.js";
import type { FontId } from "./schema.js";

/** Bundled fonts (all SIL Open Font License; licenses in fonts/). */
export const FONT_FILES: Record<FontId, { file: string; name: string; style: string }> = {
  "archivo-black": { file: "archivoblack/ArchivoBlack-Regular.ttf", name: "Archivo Black", style: "Sans serif, very bold: the easiest to carve" },
  pacifico: { file: "pacifico/Pacifico-Regular.ttf", name: "Pacifico", style: "Script with joined letters: good for one-piece cut-out lettering" },
  "bebas-neue": { file: "bebasneue/BebasNeue-Regular.ttf", name: "Bebas Neue", style: "Condensed, capitals only" },
};

/** Loads the fonts from raw bytes (works in the browser with fetch and in Node with fs). */
export async function loadFonts(read: (file: string) => Promise<ArrayBuffer>, ids: FontId[] = Object.keys(FONT_FILES) as FontId[]): Promise<FontMap> {
  const out: FontMap = {};
  for (const id of ids) out[id] = parseFont(await read(FONT_FILES[id].file));
  return out;
}

/**
 * opentype.js ships both UMD (Node) and ESM (bundlers): in one case `parse` lives on `default`,
 * in the other it is a named export.
 */
function parseFont(buf: ArrayBuffer) {
  const mod = ot as unknown as { parse?: typeof ot.parse; default?: { parse: typeof ot.parse } };
  return (mod.parse ?? mod.default!.parse)(buf);
}
