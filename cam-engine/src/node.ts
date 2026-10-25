import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFonts } from "./fonts.js";

const FONT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "fonts");

/** Carrega as fontes incluídas a partir do disco (Node, testes e CLI). */
export function loadFontsFromDisk() {
  return loadFonts(async (arquivo) => {
    const buf = await readFile(join(FONT_DIR, arquivo));
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  });
}
