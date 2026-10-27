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
 * Startup with real progress: UI fonts, the CAM engine (worker + lettering fonts + a
 * minimal part) and the main screens. Everything comes from the local computer; if something
 * fails, the UI opens anyway (the error shows up where it's used).
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
      /* keep going: the splash screen must never block the app */
    }
    boot?.step(pct);
  }
  boot?.done();
}
void start();

// Installed build: caches the files so it opens offline next time.
if (import.meta.env.PROD && "serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => undefined));
}
