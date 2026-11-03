// App icons from gsender-ui/public/carvcam-icon.svg (electron-builder turns the 1024 px PNGs into
// .icns for macOS and .ico for Windows):
//   build/icon.png      1024 px, full tile (Windows, Linux, window icon)
//   build/icon-mac.png  1024 px, tile at 824 px with transparent margin (Apple's icon grid)
//   build/icons/NxN.png Linux hicolor sizes
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const svg = readFileSync(join(here, "..", "..", "gsender-ui", "public", "carvcam-icon.svg"));
const out = join(here, "..", "build");
mkdirSync(join(out, "icons"), { recursive: true });

const render = (size) => sharp(svg, { density: Math.ceil((72 * size) / 100) }).resize(size, size).png();

await render(1024).toFile(join(out, "icon.png"));
const tile = await render(824).toBuffer();
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: tile, top: 100, left: 100 }])
  .png()
  .toFile(join(out, "icon-mac.png"));
for (const size of [16, 32, 48, 64, 128, 256, 512]) await render(size).toFile(join(out, "icons", `${size}x${size}.png`));
console.log(`icons: written to ${out}`);
