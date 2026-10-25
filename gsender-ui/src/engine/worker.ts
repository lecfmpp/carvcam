/// <reference lib="webworker" />
import { generatePlate, loadFonts, simulate, ToolSchema, type FontMap, type GenerateResult } from "@gsender-next/cam-engine";
import archivo from "@gsender-next/cam-engine/fonts/archivoblack/ArchivoBlack-Regular.ttf?url";
import bebas from "@gsender-next/cam-engine/fonts/bebasneue/BebasNeue-Regular.ttf?url";
import pacifico from "@gsender-next/cam-engine/fonts/pacifico/Pacifico-Regular.ttf?url";
import type { EngineRequest, EngineResponse } from "./protocol";

/**
 * Roda o motor de CAM fora da thread da interface: gerar uma placa leva de 50 ms a alguns
 * segundos, e a simulação do corte outro tanto.
 */
const URLS: Record<string, string> = {
  "archivoblack/ArchivoBlack-Regular.ttf": archivo,
  "bebasneue/BebasNeue-Regular.ttf": bebas,
  "pacifico/Pacifico-Regular.ttf": pacifico,
};

let fonts: Promise<FontMap> | null = null;
const getFonts = () => (fonts ??= loadFonts((arquivo) => fetch(URLS[arquivo]).then((r) => r.arrayBuffer())));

self.onmessage = async (ev: MessageEvent<EngineRequest>) => {
  const req = ev.data;
  try {
    const result: GenerateResult = generatePlate(req.spec, { fontes: await getFonts(), ...req.options });
    let sim: EngineResponse["sim"] = null;
    if (req.simulate && result.gcode) {
      const b = result.layout.bloco;
      const tools = result.ferramentas.map((t) => ToolSchema.parse(t));
      const pad = 2;
      const res = req.simRes ?? simResFor(b.largura, b.altura);
      const hm = simulate(result.gcode, tools, { x0: -pad, y0: -pad, width: b.largura + 2 * pad, height: b.altura + 2 * pad }, res);
      sim = { x0: hm.x0, y0: hm.y0, cols: hm.cols, rows: hm.rows, res: hm.res, h: hm.h };
    }
    const msg: EngineResponse = { id: req.id, ok: true, result, sim };
    (self as unknown as Worker).postMessage(msg, sim ? [sim.h.buffer] : []);
  } catch (e) {
    const msg: EngineResponse = { id: req.id, ok: false, error: e instanceof Error ? e.message : String(e), result: null, sim: null };
    (self as unknown as Worker).postMessage(msg);
  }
};

/** Resolução da simulação: ~900 células no lado maior, entre 0,15 e 2 mm. */
function simResFor(w: number, h: number) {
  return Math.min(2, Math.max(0.15, Math.max(w, h) / 900));
}
