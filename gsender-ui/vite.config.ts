import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * Lista de todos os arquivos do build (precache.json), para o service worker guardar tudo na
 * instalação e o app abrir sem internet já na segunda vez, inclusive telas ainda não visitadas.
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
  // Caminhos relativos: o build abre em qualquer pasta ou servidor local (inclusive offline).
  base: "./",
  // Não herdar o PostCSS/Tailwind do app que mora na raiz deste repositório.
  css: { postcss: { plugins: [] } },
  worker: { format: "es" },
  server: { port: 5173, fs: { allow: [".."] } },
  preview: { port: 4173 },
  // O motor de CAM vem de ../cam-engine como código-fonte TypeScript.
  optimizeDeps: { exclude: ["@gsender-next/cam-engine"] },
});
