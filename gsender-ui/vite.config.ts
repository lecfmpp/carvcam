import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Não herdar o PostCSS/Tailwind do app que mora na raiz deste repositório.
  css: { postcss: { plugins: [] } },
  worker: { format: "es" },
  server: { port: 5173, fs: { allow: [".."] } },
  // O motor de CAM vem de ../cam-engine como código-fonte TypeScript.
  optimizeDeps: { exclude: ["@gsender-next/cam-engine"] },
});
