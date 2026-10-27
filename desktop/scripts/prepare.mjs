// Builds the app (gsender-ui) and copies it into the desktop package:
//   ../gsender-ui/dist        -> app/
//   ../gsender-ui/bridge/*.mjs -> bridge/
// Run it before electron-builder (the "start" and "dist:win" scripts already call it).
import { execSync } from "node:child_process";
import { cpSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = join(dirname(fileURLToPath(import.meta.url)), "..");
const ui = join(here, "../gsender-ui");
if (!process.argv.includes("--skip-build")) {
  if (!existsSync(join(ui, "node_modules"))) execSync("npm ci", { cwd: ui, stdio: "inherit" });
  if (!existsSync(join(here, "../cam-engine/node_modules"))) execSync("npm ci", { cwd: join(here, "../cam-engine"), stdio: "inherit" });
  execSync("npx vite build", { cwd: ui, stdio: "inherit" });
}
for (const d of ["app", "bridge"]) rmSync(join(here, d), { recursive: true, force: true });
cpSync(join(ui, "dist"), join(here, "app"), { recursive: true });
mkdirSync(join(here, "bridge"), { recursive: true });
cpSync(join(ui, "bridge/server.mjs"), join(here, "bridge/server.mjs"));
console.log("prepared app/ and bridge/");
