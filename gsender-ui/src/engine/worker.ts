/// <reference lib="webworker" />
import { generatePlate, loadFonts, simulate, ToolSchema, type FontMap, type GenerateResult } from "@gsender-next/cam-engine";
import archivo from "@gsender-next/cam-engine/fonts/archivoblack/ArchivoBlack-Regular.ttf?url";
import bebas from "@gsender-next/cam-engine/fonts/bebasneue/BebasNeue-Regular.ttf?url";
import pacifico from "@gsender-next/cam-engine/fonts/pacifico/Pacifico-Regular.ttf?url";
import type { EngineRequest, EngineResponse } from "./protocol";

/**
 * Runs the CAM engine off the UI thread: generating a sign takes from 50 ms to a few
 * seconds, and simulating the cut about as long again.
 */
const URLS: Record<string, string> = {
  "archivoblack/ArchivoBlack-Regular.ttf": archivo,
  "bebasneue/BebasNeue-Regular.ttf": bebas,
  "pacifico/Pacifico-Regular.ttf": pacifico,
};

let fonts: Promise<FontMap> | null = null;
const getFonts = () => (fonts ??= loadFonts((file) => fetch(URLS[file]).then((r) => r.arrayBuffer())));

self.onmessage = async (ev: MessageEvent<EngineRequest>) => {
  const req = ev.data;
  try {
    if (req.warmup) {
      // Fonts + a minimal part: warms up the engine's hot paths before first use.
      const loaded = await getFonts();
      generatePlate({ width: 60, height: 30, thickness: 6, texts: [{ content: "Hi", size: 12, mode: "engrave", depth: 1 }] }, { fonts: loaded });
      (self as unknown as Worker).postMessage({ id: req.id, ok: true, result: null, sim: null } satisfies EngineResponse);
      return;
    }
    const result: GenerateResult = generatePlate(req.spec, { fonts: await getFonts(), ...req.options });
    let sim: EngineResponse["sim"] = null;
    if (req.simulate && result.gcode) {
      const b = result.layout.stock;
      const tools = result.tools.map((t) => ToolSchema.parse(t));
      const pad = 2;
      const res = req.simRes ?? simResFor(b.width, b.height, req.lowPower);
      const hm = simulate(result.gcode, tools, { x0: -pad, y0: -pad, width: b.width + 2 * pad, height: b.height + 2 * pad }, res);
      sim = { x0: hm.x0, y0: hm.y0, cols: hm.cols, rows: hm.rows, res: hm.res, h: hm.h };
    }
    const msg: EngineResponse = { id: req.id, ok: true, result, sim };
    (self as unknown as Worker).postMessage(msg, sim ? [sim.h.buffer] : []);
  } catch (e) {
    const msg: EngineResponse = { id: req.id, ok: false, error: e instanceof Error ? e.message : String(e), result: null, sim: null };
    (self as unknown as Worker).postMessage(msg);
  }
};

/** Simulation resolution: ~900 cells on the longer side (600 in Panel mode), between 0.15 and 2 mm. */
function simResFor(w: number, h: number, lowPower = false) {
  return Math.min(2, Math.max(0.15, Math.max(w, h) / (lowPower ? 600 : 900)));
}
