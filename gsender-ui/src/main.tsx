import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { warmEngine } from "./engine/useEngine";
import "./styles/app.css";

declare global {
  interface Window {
    __boot?: { step(pct: number, text?: string): void; done(): void };
  }
}

const boot = window.__boot;
boot?.step(35, "Starting the interface…");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/**
 * Inicialização com progresso real: fontes da interface, motor de CAM (worker + fontes das
 * letras + uma peça mínima) e as telas principais. Tudo vem do próprio computador; se algo
 * falhar, a interface abre assim mesmo (o erro aparece onde for usado).
 */
async function start() {
  const steps: [number, string, () => Promise<unknown>][] = [
    [55, "Loading fonts…", () => Promise.all(["400 16px 'Geist Sans'", "600 16px 'Geist Sans'", "500 16px 'Geist Mono'"].map((f) => document.fonts.load(f)))],
    [82, "Preparing the CAM engine…", () => warmEngine()],
    [
      96,
      "Opening your workshop…",
      () =>
        Promise.all([
          import("./screens/workshop/Workshop"),
          import("./screens/workshop/Onboarding"),
          import("./screens/create/Create"),
          import("./screens/job/Job"),
          import("./screens/surfacing/Surfacing"),
        ]),
    ],
  ];
  for (const [pct, text, run] of steps) {
    boot?.step(pct - 12, text);
    try {
      await run();
    } catch {
      /* segue: a tela de entrada não pode prender o app */
    }
    boot?.step(pct);
  }
  boot?.done();
}
void start();

// Versão instalada (build): guarda os arquivos para abrir sem internet nas próximas vezes.
if (import.meta.env.PROD && "serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => undefined));
}
