import type { Machine, MaterialId, Tool } from "./schema.js";

/**
 * Presets conservadores para routers hobby. Valores de partida, não verdades absolutas:
 * a UI deve deixar o usuário ajustar e lembrar o ajuste por material.
 */
export interface MaterialPreset {
  name: string;
  /** Avanço por dente (mm) para uma fresa de ~3 mm. */
  feedPerTooth: number;
  /** Profundidade por passada, como fração do diâmetro. */
  stepdownFraction: number;
  /** Sobreposição lateral no pocket, como fração do diâmetro. */
  stepoverFraction: number;
  rpm: number;
}

export const MATERIAL_PRESETS: Record<MaterialId, MaterialPreset> = {
  mdf: { name: "MDF", feedPerTooth: 0.05, stepdownFraction: 0.5, stepoverFraction: 0.4, rpm: 18000 },
  plywood: { name: "Compensado", feedPerTooth: 0.045, stepdownFraction: 0.4, stepoverFraction: 0.4, rpm: 18000 },
  softwood: { name: "Madeira macia (pinus)", feedPerTooth: 0.05, stepdownFraction: 0.5, stepoverFraction: 0.4, rpm: 18000 },
  hardwood: { name: "Madeira dura", feedPerTooth: 0.035, stepdownFraction: 0.3, stepoverFraction: 0.35, rpm: 18000 },
  acrylic: { name: "Acrílico", feedPerTooth: 0.05, stepdownFraction: 0.25, stepoverFraction: 0.35, rpm: 16000 },
};

export interface CutParams {
  rpm: number;
  feed: number;
  plunge: number;
  stepdown: number;
  stepover: number;
}

export function cutParams(material: MaterialId, tool: Tool, machine: Machine, overrides: Partial<CutParams> = {}): CutParams {
  const m = MATERIAL_PRESETS[material];
  const rpm = clamp(overrides.rpm ?? m.rpm, machine.rpmMin, machine.rpmMax);
  // Fresas finas aguentam menos avanço por dente: escala com o diâmetro em relação a 1/8".
  const fz = m.feedPerTooth * clamp(tool.diameter / 3.175, 0.4, 2);
  // Avanço = avanço por dente × canais × RPM (mesma fórmula da calculadora do rudra496/cnc).
  const feed = Math.min(overrides.feed ?? fz * tool.flutes * rpm, machine.maxFeedXY);
  const plunge = Math.min(overrides.plunge ?? feed * 0.3, machine.maxFeedZ);
  const stepdown = overrides.stepdown ?? round2(tool.diameter * m.stepdownFraction);
  const stepover = overrides.stepover ?? round2(tool.diameter * m.stepoverFraction);
  return { rpm: Math.round(rpm), feed: Math.round(feed), plunge: Math.round(plunge), stepdown, stepover };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function round2(v: number) {
  return Math.round(v * 100) / 100;
}
