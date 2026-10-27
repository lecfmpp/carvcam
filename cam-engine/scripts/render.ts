import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { migrateLegacySpec } from "../src/migrate.js";
import { ToolSchema, type ToolInput } from "../src/schema.js";
import { simulate } from "../src/sim/heightmap.js";

/**
 * Simulates a G-code file and saves a top-down image (PNG), colored by depth.
 * Usage: npm run render -- <file.nc> <output.png> <width> <height> <thickness> [example.json]
 * The example.json (optional) provides the bits; without it, the 1/8" straight bit is used.
 */
const [gfile, out, W, H, T, exampleFile] = process.argv.slice(2);
if (!gfile || !out || !W || !H || !T) {
  console.error("Usage: npm run render -- <file.nc> <output.png> <width> <height> <thickness> [example.json]");
  process.exit(2);
}
const ex = exampleFile ? migrateLegacySpec<any>(JSON.parse(readFileSync(exampleFile, "utf8"))) : {};
const tools = [ex.tool, ex.cutoutTool].filter(Boolean).map((t: ToolInput) => ToolSchema.parse(t));
const hm = simulate(readFileSync(gfile, "utf8"), tools.length ? tools : ToolSchema.parse({}), { x0: -5, y0: -5, width: Number(W) + 10, height: Number(H) + 10 }, 0.2);
const thick = Number(T);

const w = hm.cols;
const h = hm.rows;
const raw = Buffer.alloc((w * 3 + 1) * h);
for (let j = 0; j < h; j++) {
  for (let i = 0; i < w; i++) {
    const v = hm.h[(h - 1 - j) * w + i];
    let rgb: [number, number, number];
    if (v <= -thick + 0.01) rgb = [30, 30, 40]; // cut through
    else if (v > -0.01) rgb = [230, 190, 140]; // untouched surface
    else {
      const t = -v / thick;
      rgb = [200 - 150 * t, 150 - 100 * t, 100 - 60 * t].map(Math.round) as [number, number, number];
    }
    raw.set(rgb, j * (w * 3 + 1) + 1 + i * 3);
  }
}

const table = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf: Buffer) => {
  let x = 0xffffffff;
  for (const b of buf) x = table[(x ^ b) & 0xff] ^ (x >>> 8);
  return (x ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(w, 0);
ihdr.writeUInt32BE(h, 4);
ihdr[8] = 8;
ihdr[9] = 2;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
console.error(`Image saved to ${out}`);
