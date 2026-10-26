#!/usr/bin/env node
// Baixa a foto oficial de cada máquina e fresa da Sienci Labs (a imagem principal da página do
// produto, og:image) e salva em WebP leve em public/, nos caminhos de src/lib/sienciProducts.json.
//
//   npm run images:fetch            # só o que ainda não existe
//   npm run images:fetch -- --force # baixa tudo de novo
//
// Precisa de internet com acesso ao sienci.com. As fotos são da Sienci Labs: use-as conforme o
// acordo com eles (programa de afiliados / material de marca).
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const products = JSON.parse(await (await import("node:fs/promises")).readFile(join(root, "src/lib/sienciProducts.json"), "utf8"));
const force = process.argv.includes("--force");
// Para testes: troca https://sienci.com por outro endereço (ex.: um servidor local).
const origin = process.env.SIENCI_ORIGIN?.replace(/\/$/, "");
const fix = (u) => (origin ? u.replace(/^https:\/\/sienci\.com/, origin) : u);
const UA = "Mozilla/5.0 (CarvCAM image fetch; +https://sienci.com)";

/** URL da imagem principal do produto na página (og:image; senão a primeira foto da galeria). */
export function productImage(html) {
  const og = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(html) ?? /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(html);
  if (og) return og[1];
  const gal = /woocommerce-product-gallery__image[^>]*>\s*<a[^>]+href=["']([^"']+\.(?:jpe?g|png|webp))["']/i.exec(html);
  return gal?.[1] ?? null;
}

const exists = (p) => stat(p).then(() => true, () => false);

async function one(item, width) {
  const out = join(root, "public", item.image);
  if (!force && (await exists(out))) return { id: item.id, status: "exists" };
  if (!/\/product\//.test(item.url)) return { id: item.id, status: "skipped (no product page)" };
  const page = await fetch(fix(item.url), { headers: { "User-Agent": UA } });
  if (!page.ok) return { id: item.id, status: `page ${page.status}` };
  const src = productImage(await page.text());
  if (!src) return { id: item.id, status: "no image on page" };
  const img = await fetch(fix(new URL(src, item.url).toString()), { headers: { "User-Agent": UA } });
  if (!img.ok) return { id: item.id, status: `image ${img.status}` };
  const buf = Buffer.from(await img.arrayBuffer());
  const webp = await sharp(buf).resize({ width, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, webp);
  return { id: item.id, status: `saved ${(webp.length / 1024).toFixed(0)} KB` };
}

const jobs = [...products.machines.map((m) => [m, 960]), ...products.bits.map((b) => [b, 600])];
const seen = new Set();
let ok = 0;
for (const [item, width] of jobs) {
  if (seen.has(item.image)) continue;
  seen.add(item.image);
  try {
    const r = await one(item, width);
    if (r.status.startsWith("saved") || r.status === "exists") ok++;
    console.log(`${r.id.padEnd(26)} ${r.status}`);
  } catch (e) {
    console.log(`${item.id.padEnd(26)} error: ${e.message}`);
  }
}
console.log(`\n${ok}/${seen.size} images ready in public/. Rebuild or reload the app to see them.`);
