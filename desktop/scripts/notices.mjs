// Writes THIRD_PARTY_NOTICES.txt: the license text of every open-source package shipped inside
// CarvCAM (the app bundle, the CAM engine and the desktop runtime). Run by prepare.mjs.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const projects = ["gsender-ui", "cam-engine", "desktop"];
const seen = new Map();

for (const p of projects) {
  const lockPath = join(root, p, "package-lock.json");
  if (!existsSync(lockPath)) continue;
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  for (const [path, info] of Object.entries(lock.packages ?? {})) {
    // Only runtime packages that ship to users; our own packages (linked, no node_modules path) are skipped.
    if (!path.includes("node_modules/") || info.dev || info.link) continue;
    if (p === "desktop" && /node_modules\/(electron|electron-builder|app-builder|@electron)\b/.test(path)) continue;
    const dir = join(root, p, path);
    const name = path.slice(path.lastIndexOf("node_modules/") + 13);
    const key = `${name}@${info.version}`;
    if (seen.has(key) || !existsSync(dir)) continue;
    const file = readdirSync(dir).find((f) => /^(licen[sc]e|copying|notice)(\.|$)/i.test(f));
    seen.set(key, { name, version: info.version, license: info.license ?? "see package", text: file ? readFileSync(join(dir, file), "utf8").trim() : "" });
  }
}

const list = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
const out = [
  "CarvCAM — third-party notices",
  "CarvCAM includes the open-source components below. Each is used under its own license, reproduced here.",
  "The Electron runtime's notices are in LICENSES.chromium.html next to the program.",
  "",
  ...list.flatMap((p) => ["=".repeat(78), `${p.name} ${p.version} — ${p.license}`, "=".repeat(78), p.text || `Licensed under ${p.license}.`, ""]),
].join("\n");
writeFileSync(join(root, "desktop", "THIRD_PARTY_NOTICES.txt"), out);
console.log(`THIRD_PARTY_NOTICES.txt: ${list.length} packages`);
