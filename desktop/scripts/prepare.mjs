// Builds the app and copies it into the desktop package:
//   ../app/dist        -> app/
//   ../app/bridge/*.mjs -> bridge/
// Run it before electron-builder (the "start" and "dist:win" scripts already call it).
import { execSync } from "node:child_process";
import { cpSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = join(dirname(fileURLToPath(import.meta.url)), "..");
const appDir = join(here, "../app");
if (!process.argv.includes("--skip-build")) {
  if (!existsSync(join(appDir, "node_modules"))) execSync("npm ci", { cwd: appDir, stdio: "inherit" });
  if (!existsSync(join(here, "../cam-engine/node_modules"))) execSync("npm ci", { cwd: join(here, "../cam-engine"), stdio: "inherit" });
  execSync("npx vite build", { cwd: appDir, stdio: "inherit" });
}
for (const d of ["app", "bridge"]) rmSync(join(here, d), { recursive: true, force: true });
cpSync(join(appDir, "dist"), join(here, "app"), { recursive: true });
mkdirSync(join(here, "bridge"), { recursive: true });
cpSync(join(appDir, "bridge/server.mjs"), join(here, "bridge/server.mjs"));
execSync("node scripts/notices.mjs", { cwd: here, stdio: "inherit" });
console.log("prepared app/ and bridge/");
