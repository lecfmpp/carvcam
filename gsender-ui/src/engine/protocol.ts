import type { GenerateOptions, GenerateResult, PlateSpecInput } from "@gsender-next/cam-engine";

export interface EngineRequest {
  id: number;
  spec: PlateSpecInput;
  options: Omit<GenerateOptions, "fonts">;
  /** Também simula o corte e devolve o mapa de alturas. */
  simulate: boolean;
  simRes?: number;
  /** Modo Painel (gControl, processador modesto): simulação em resolução menor. */
  lowPower?: boolean;
  /** Só aquece o motor (carrega fontes e roda uma peça mínima), na tela de entrada. */
  warmup?: boolean;
}

/** Mapa de alturas do material depois do corte: 0 = face intacta, negativo = usinado. */
export interface SimGrid {
  x0: number;
  y0: number;
  cols: number;
  rows: number;
  res: number;
  h: Float32Array;
}

export interface EngineResponse {
  id: number;
  ok: boolean;
  error?: string;
  result: GenerateResult | null;
  sim: SimGrid | null;
}
