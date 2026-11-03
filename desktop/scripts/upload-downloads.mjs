// Uploads the fixed-name installers (CarvCAM-Windows-64Bit.exe, CarvCAM-Mac-arm64.dmg,
// CarvCAM-Linux-x86_64.AppImage…) to the public Supabase Storage bucket "downloads", which the website
// links to through carvcam.com/download/<platform> (redirects in the root netlify.toml):
//   downloads/latest/<file>   overwritten on every release (short cache)
//   downloads/<tag>/<file>    kept per version (long cache)
//
//   node desktop/scripts/upload-downloads.mjs <dir>          (RELEASE_TAG=v1.2.3)
//
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (repository secrets). Without them it only warns,
// so a release never fails because of the website mirror.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const dir = process.argv[2] || ".";
const tag = process.env.RELEASE_TAG;
const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "downloads";

if (!url || !key) {
  console.log("::warning::SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set: installers not mirrored to carvcam.com/download.");
  process.exit(0);
}
if (!tag) {
  console.log("No RELEASE_TAG: nothing to upload.");
  process.exit(0);
}

// Fixed names only (no version number after "CarvCAM-"), and never the update metadata.
const files = (await readdir(dir)).filter((f) => /^CarvCAM-(Windows|Mac|Linux)-[^0-9]/.test(f) && !f.endsWith(".blockmap"));
if (!files.length) {
  console.log(`::warning::No fixed-name installers found in ${dir}.`);
  process.exit(0);
}

async function put(path, body, cache) {
  const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      "Content-Type": "application/octet-stream",
      "Cache-Control": `max-age=${cache}`,
      "x-upsert": "true",
    },
    body,
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
}

for (const f of files) {
  const body = await readFile(join(dir, f));
  const mb = (body.length / 1048576).toFixed(1);
  await put(`${tag}/${f}`, body, 31536000);
  await put(`latest/${f}`, body, 300);
  console.log(`uploaded ${f} (${mb} MB) → ${BUCKET}/latest and ${BUCKET}/${tag}`);
}
