// Top-down picture of the carved board for the MCP server: simulates the G-code into a heightmap
// (the engine's simulator) and paints it as wood, with light from the top left so depth reads.
import { deflateSync } from "node:zlib";
import { simulate } from "../../cam-engine/src/index.ts";

type Rgb = [number, number, number];
const hex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;

/** Face (top of the wood) and recess (carved) colors, as in the app. */
export const WOOD: Record<string, { face: string; recess: string }> = {
  MDF: { face: "#C9A47B", recess: "#94704D" },
  Pine: { face: "#E2C08D", recess: "#B08955" },
  Oak: { face: "#C79A62", recess: "#94683A" },
  Walnut: { face: "#8A5E3C", recess: "#5E3E26" },
  "Birch plywood": { face: "#E3CBA2", recess: "#B39468" },
  Acrylic: { face: "#DCE5E9", recess: "#A3B4BB" },
};

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
function png(w: number, h: number, raw: Buffer) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

/**
 * PNG (base64) of the simulated cut, at most `maxPx` wide or tall.
 * `stock` is the board in stock coordinates (origin bottom-left).
 */
export function previewPng(gcode: string, tools: Parameters<typeof simulate>[1], stock: { width: number; height: number; thickness: number }, material: string, maxPx = 760) {
  const res = Math.max(0.25, Math.max(stock.width, stock.height) / maxPx);
  const hm = simulate(gcode, tools, { x0: 0, y0: 0, width: stock.width, height: stock.height }, res);
  const w = hm.cols;
  const h = hm.rows;
  const wood = WOOD[material] ?? WOOD.MDF;
  const face = hex(wood.face);
  const recess = hex(wood.recess);
  const bg: Rgb = [38, 40, 44];
  const t = stock.thickness;
  const at = (i: number, j: number) => hm.h[Math.min(h - 1, Math.max(0, j)) * w + Math.min(w - 1, Math.max(0, i))];
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let row = 0; row < h; row++) {
    const j = h - 1 - row; // image rows go down, y goes up
    for (let i = 0; i < w; i++) {
      const v = at(i, j);
      let rgb: Rgb;
      if (v <= -t + 0.01) rgb = bg;
      else {
        const k = Math.min(1, -v / Math.max(1, Math.min(t, 8)));
        // Top of the wood a little lighter than the swatch, carved areas darker the deeper they go.
        const base = v > -0.01 ? (face.map((c) => Math.min(255, c * 1.1 + 8)) as Rgb) : (recess.map((c) => c * (0.95 - 0.3 * k)) as Rgb);
        // Light from the top left: slopes facing it get brighter, the others darker.
        const dx = at(i + 1, j) - at(i - 1, j);
        const dy = at(i, j + 1) - at(i, j - 1);
        const shade = Math.max(0.55, Math.min(1.35, 1 + (-dx + dy) * (0.6 / res) * 0.25));
        rgb = base.map((c) => Math.max(0, Math.min(255, Math.round(c * shade)))) as Rgb;
      }
      raw.set(rgb, row * (w * 3 + 1) + 1 + i * 3);
    }
  }
  return { base64: png(w, h, raw).toString("base64"), width: w, height: h };
}
