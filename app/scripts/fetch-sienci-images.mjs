#!/usr/bin/env node
// Downloads the official photo of each Sienci Labs machine, router/spindle and bit (the main image on
// the product page, og:image) and saves it as a lightweight WebP in public/, at the paths in
// src/lib/sienciProducts.json.
//
//   npm run images:fetch            # only what doesn't exist yet
//   npm run images:fetch -- --force # download everything again
//   npm run images:fetch -- --only autospin-t1,altmill-4x4   # only these products
//   npm run images:fetch -- --from ~/Downloads/sienci
//       # no download: converts photos you saved from the site, one per product, with the id in the
//       # file name (e.g. autospin-t1.jpg, altmill-4x4.png). The ids are in src/lib/sienciProducts.json.
//
// sienci.com sits behind Cloudflare, which sometimes serves a browser check instead of the page;
// the script reports it, and the workaround is to save the photos from a browser and use --from.
//
// Needs internet access to sienci.com. The photos belong to Sienci Labs: use them according to
// your agreement with them (affiliate program / brand materials).
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const products = JSON.parse(await readFile(join(root, "src/lib/sienciProducts.json"), "utf8"));
const force = process.argv.includes("--force");
// For tests: replaces https://sienci.com with another address (e.g. a local server).
const origin = process.env.SIENCI_ORIGIN?.replace(/\/$/, "");
const fix = (u) => (origin ? u.replace(/^https:\/\/sienci\.com/, origin) : u);
const fromIdx = process.argv.indexOf("--from");
const fromDir = fromIdx > 0 ? process.argv[fromIdx + 1]?.replace(/^~(?=\/)/, process.env.HOME ?? "~") : undefined;
const onlyIdx = process.argv.indexOf("--only");
const only = onlyIdx > 0 ? new Set((process.argv[onlyIdx + 1] ?? "").split(",").map((x) => x.trim()).filter(Boolean)) : null;
const UA = "Mozilla/5.0 (CarvCAM image fetch; +https://sienci.com)";

/** URL of the product's main image on the page (og:image, twitter:image, gallery or JSON-LD). */
export function productImage(html) {
  const pats = [
    /<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/i,
    /data-large_image=["']([^"']+)["']/i,
    /woocommerce-product-gallery__image[^>]*>\s*<a[^>]+href=["']([^"']+\.(?:jpe?g|png|webp))["']/i,
    /<img[^>]+class=["'][^"']*wp-post-image[^"']*["'][^>]+src=["']([^"']+)["']/i,
    /<img[^>]+src=["']([^"']+)["'][^>]+class=["'][^"']*wp-post-image/i,
    /"image"\s*:\s*(?:\[\s*)?(?:\{[^}]*?"url"\s*:\s*)?"(https?:[^"]+\.(?:jpe?g|png|webp)[^"]*)"/i,
    /(https?:\/\/[^"' ]*\/wp-content\/uploads\/[^"' ]+\.(?:jpe?g|png|webp))/i,
  ];
  for (const re of pats) {
    const m = re.exec(html);
    if (m) return m[1].replace(/&amp;/g, "&").replace(/\\\//g, "/");
  }
  return null;
}

const exists = (p) => stat(p).then(() => true, () => false);

async function one(item, width) {
  const out = join(root, "public", item.image);
  if (!force && (await exists(out))) return { id: item.id, status: "exists" };
  if (fromDir) {
    const local = await findLocal([item.id, basename(item.image, ".webp")]);
    if (!local) return { id: item.id, status: "no file in --from folder" };
    return save(out, await readFile(local), width, item.id);
  }
  if (!/\/product\//.test(item.url)) return { id: item.id, status: "skipped (no product page)" };
  const page = await fetch(fix(item.url), { headers: { "User-Agent": UA } });
  const html = await page.text();
  if (/<title>(Just a moment|Attention Required)/i.test(html) || /challenge-platform|cf-chl-/.test(html) || page.headers.get("cf-mitigated")) return { id: item.id, status: "blocked by Cloudflare check (save the photo in a browser and use --from)" };
  if (!page.ok) return { id: item.id, status: `page ${page.status}` };
  const src = productImage(html);
  if (!src) {
    // Save the page to see what came back instead of the product.
    const dbg = join(root, "public", ".debug", `${item.id}.html`);
    await mkdir(dirname(dbg), { recursive: true });
    await writeFile(dbg, html);
    const title = /<title>([^<]*)/i.exec(html)?.[1]?.trim() ?? "?";
    return { id: item.id, status: `no image on page (HTTP ${page.status}, "${title.slice(0, 60)}", saved public/.debug/${item.id}.html)` };
  }
  const img = await fetch(fix(new URL(src, item.url).toString()), { headers: { "User-Agent": UA } });
  if (!img.ok) return { id: item.id, status: `image ${img.status}` };
  return save(out, Buffer.from(await img.arrayBuffer()), width, item.id);
}

async function findLocal(names) {
  for (const id of names)
    for (const ext of ["webp", "jpg", "jpeg", "png", "avif"]) {
      const p = join(fromDir, `${id}.${ext}`);
      if (await exists(p)) return p;
    }
  return null;
}

async function save(out, buf, width, id) {
  const webp = await sharp(buf).resize({ width, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, webp);
  return { id, status: `saved ${(webp.length / 1024).toFixed(0)} KB` };
}

const jobs = [...products.machines.map((m) => [m, 960]), ...products.heads.map((h) => [h, 800]), ...products.bits.map((b) => [b, 600])];
const seen = new Set();
let ok = 0;
for (const [item, width] of jobs) {
  if (only && !only.has(item.id)) continue;
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
