import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFonts } from "./fonts.js";

const FONT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "fonts");

/** Loads the bundled fonts from disk (Node, tests and CLI). */
export function loadFontsFromDisk() {
  return loadFonts(async (file) => {
    const buf = await readFile(join(FONT_DIR, file));
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  });
}
