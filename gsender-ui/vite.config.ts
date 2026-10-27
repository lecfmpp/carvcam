import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * List of every file in the build (precache.json), so the service worker caches everything on
 * install and the app opens offline from the second visit on, including screens not visited yet.
 */
function precacheList(): Plugin {
  return {
    name: "carvcam-precache",
    apply: "build",
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith(".map"));
      this.emitFile({ type: "asset", fileName: "precache.json", source: JSON.stringify(["./", "./index.html", "./carvcam-icon.svg", ...files.map((f) => "./" + f)]) });
    },
  };
}

export default defineConfig({
  plugins: [react(), precacheList()],
  // Relative paths: the build opens from any folder or local server (including offline).
  base: "./",
  // Don't inherit the PostCSS/Tailwind config of the app at the root of this repository.
  css: { postcss: { plugins: [] } },
  worker: { format: "es" },
  server: { port: 5173, fs: { allow: [".."] } },
  preview: { port: 4173 },
  // The CAM engine comes from ../cam-engine as TypeScript source.
  optimizeDeps: { exclude: ["@gsender-next/cam-engine"] },
});
