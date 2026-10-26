#!/usr/bin/env node
// Baixa a foto oficial de cada máquina, router/spindle e fresa da Sienci Labs (a imagem principal da página do
// produto, og:image) e salva em WebP leve em public/, nos caminhos de src/lib/sienciProducts.json.
//
//   npm run images:fetch            # só o que ainda não existe
//   npm run images:fetch -- --force # baixa tudo de novo
//   npm run images:fetch -- --from ~/Downloads/sienci
//       # sem baixar: converte fotos que você salvou do site, uma por produto, com o id no nome
//       # (ex.: autospin-t1.jpg, altmill-4x4.png). Os ids estão em src/lib/sienciProducts.json.
//
// O sienci.com fica atrás do Cloudflare, que às vezes pede uma verificação de navegador em vez
// da página; nesse caso o script avisa, e o caminho é salvar as fotos pelo navegador e usar --from.
//
// Precisa de internet com acesso ao sienci.com. As fotos são da Sienci Labs: use-as conforme o
// acordo com eles (programa de afiliados / material de marca).
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const products = JSON.parse(await readFile(join(root, "src/lib/sienciProducts.json"), "utf8"));
const force = process.argv.includes("--force");
// Para testes: troca https://sienci.com por outro endereço (ex.: um servidor local).
const origin = process.env.SIENCI_ORIGIN?.replace(/\/$/, "");
const fix = (u) => (origin ? u.replace(/^https:\/\/sienci\.com/, origin) : u);
const fromIdx = process.argv.indexOf("--from");
const fromDir = fromIdx > 0 ? process.argv[fromIdx + 1]?.replace(/^~(?=\/)/, process.env.HOME ?? "~") : undefined;
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
  if (fromDir) {
    const local = await findLocal([item.id, basename(item.image, ".webp")]);
    if (!local) return { id: item.id, status: "no file in --from folder" };
    return save(out, await readFile(local), width, item.id);
  }
  if (!/\/product\//.test(item.url)) return { id: item.id, status: "skipped (no product page)" };
  const page = await fetch(fix(item.url), { headers: { "User-Agent": UA } });
  const html = await page.text();
  if (/<title>Just a moment/i.test(html) || page.headers.get("cf-mitigated")) return { id: item.id, status: "blocked by Cloudflare check (save the photo in a browser and use --from)" };
  if (!page.ok) return { id: item.id, status: `page ${page.status}` };
  const src = productImage(html);
  if (!src) return { id: item.id, status: "no image on page" };
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
