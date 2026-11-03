// Copies the built app (gsender-ui/dist) to desktop/renderer, which is what gets packaged.
// Build it first: cd cam-engine && npm install; cd ../gsender-ui && npm install && npx vite build
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(process.env.CARVCAM_UI_DIST || join(here, "..", "..", "gsender-ui", "dist"));
const dest = join(here, "..", "renderer");

if (!existsSync(join(src, "index.html"))) {
  console.error(`gsender-ui build not found at ${src}.\nBuild it first:\n  cd cam-engine && npm install\n  cd ../gsender-ui && npm install && npx vite build`);
  process.exit(1);
}
rmSync(dest, { recursive: true, force: true });
// Debug captures (public/.debug) never ship.
cpSync(src, dest, { recursive: true, filter: (p) => !p.split(/[\\/]/).includes(".debug") && !p.endsWith(".map") });
console.log(`renderer: copied ${src} -> ${dest}`);
