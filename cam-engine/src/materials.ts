import type { Machine, MaterialId, Tool } from "./schema.js";

/**
 * Presets conservadores para routers hobby. Valores de partida, não verdades absolutas:
 * a UI deve deixar o usuário ajustar e lembrar o ajuste por material.
 */
export interface MaterialPreset {
  nome: string;
  /** Avanço por dente (mm) para uma fresa de ~3 mm. */
  avancoPorDente: number;
  /** Profundidade por passada, como fração do diâmetro. */
  passadaFracao: number;
  /** Sobreposição lateral no pocket, como fração do diâmetro. */
  sobreposicaoFracao: number;
  rpm: number;
}

export const MATERIAIS: Record<MaterialId, MaterialPreset> = {
  mdf: { nome: "MDF", avancoPorDente: 0.05, passadaFracao: 0.5, sobreposicaoFracao: 0.4, rpm: 18000 },
  compensado: { nome: "Compensado", avancoPorDente: 0.045, passadaFracao: 0.4, sobreposicaoFracao: 0.4, rpm: 18000 },
  madeira_macia: { nome: "Madeira macia (pinus)", avancoPorDente: 0.05, passadaFracao: 0.5, sobreposicaoFracao: 0.4, rpm: 18000 },
  madeira_dura: { nome: "Madeira dura", avancoPorDente: 0.035, passadaFracao: 0.3, sobreposicaoFracao: 0.35, rpm: 18000 },
  acrilico: { nome: "Acrílico", avancoPorDente: 0.05, passadaFracao: 0.25, sobreposicaoFracao: 0.35, rpm: 16000 },
};

export interface CutParams {
  rpm: number;
  avanco: number;
  mergulho: number;
  passada: number;
  sobreposicao: number;
}

export function cutParams(material: MaterialId, tool: Tool, machine: Machine, overrides: Partial<CutParams> = {}): CutParams {
  const m = MATERIAIS[material];
  const rpm = clamp(overrides.rpm ?? m.rpm, machine.rpmMin, machine.rpmMax);
  // Fresas finas aguentam menos avanço por dente: escala com o diâmetro em relação a 1/8".
  const fz = m.avancoPorDente * clamp(tool.diametro / 3.175, 0.4, 2);
  // Avanço = avanço por dente × canais × RPM (mesma fórmula da calculadora do rudra496/cnc).
  const avanco = Math.min(overrides.avanco ?? fz * tool.canais * rpm, machine.avancoMaxXY);
  const mergulho = Math.min(overrides.mergulho ?? avanco * 0.3, machine.avancoMaxZ);
  const passada = overrides.passada ?? round2(tool.diametro * m.passadaFracao);
  const sobreposicao = overrides.sobreposicao ?? round2(tool.diametro * m.sobreposicaoFracao);
  return { rpm: Math.round(rpm), avanco: Math.round(avanco), mergulho: Math.round(mergulho), passada, sobreposicao };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function round2(v: number) {
  return Math.round(v * 100) / 100;
}
