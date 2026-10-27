// Converte as capturas de tela do app (PNG) em WebP leves para o site, em dois tamanhos.
//   node scripts/images.mjs <pasta-com-pngs>
import { readdir, mkdir } from "node:fs/promises";
import { join, basename } from "node:path";
import sharp from "sharp";

const src = process.argv[2];
if (!src) throw new Error("Usage: node scripts/images.mjs <folder with PNG screenshots>");
const out = new URL("../assets/screens/", import.meta.url).pathname;
await mkdir(out, { recursive: true });
for (const f of (await readdir(src)).filter((f) => f.endsWith(".png"))) {
  const name = basename(f, ".png").replace(/^\d+-/, "");
  for (const w of [1440, 800]) {
    const file = join(out, `${name}${w === 800 ? "-800" : ""}.webp`);
    const info = await sharp(join(src, f)).resize({ width: w, withoutEnlargement: true }).webp({ quality: 80 }).toFile(file);
    console.log(`${basename(file).padEnd(36)} ${(info.size / 1024).toFixed(0)} KB`);
  }
}
