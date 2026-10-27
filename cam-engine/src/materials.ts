import type { Machine, MaterialId, Tool } from "./schema.js";

/**
 * Conservative presets for hobby routers. Starting points, not absolute truths:
 * the UI should let the user adjust them and remember the adjustment per material.
 */
export interface MaterialPreset {
  name: string;
  /** Feed per tooth / chip load (mm) for a ~3 mm bit. */
  feedPerTooth: number;
  /** Stepdown (depth per pass), as a fraction of the diameter. */
  stepdownFraction: number;
  /** Pocket stepover, as a fraction of the diameter. */
  stepoverFraction: number;
  rpm: number;
}

export const MATERIAL_PRESETS: Record<MaterialId, MaterialPreset> = {
  mdf: { name: "MDF", feedPerTooth: 0.05, stepdownFraction: 0.5, stepoverFraction: 0.4, rpm: 18000 },
  plywood: { name: "Plywood", feedPerTooth: 0.045, stepdownFraction: 0.4, stepoverFraction: 0.4, rpm: 18000 },
  softwood: { name: "Softwood (pine)", feedPerTooth: 0.05, stepdownFraction: 0.5, stepoverFraction: 0.4, rpm: 18000 },
  hardwood: { name: "Hardwood", feedPerTooth: 0.035, stepdownFraction: 0.3, stepoverFraction: 0.35, rpm: 18000 },
  acrylic: { name: "Acrylic", feedPerTooth: 0.05, stepdownFraction: 0.25, stepoverFraction: 0.35, rpm: 16000 },
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
  // Small bits take a lighter chip load: scale with the diameter relative to 1/8".
  const fz = m.feedPerTooth * clamp(tool.diameter / 3.175, 0.4, 2);
  // Feed rate = chip load × flutes × RPM (same formula as the rudra496/cnc calculator).
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
