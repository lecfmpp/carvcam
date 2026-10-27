import type { GenerateOptions, GenerateResult, PlateSpecInput } from "@gsender-next/cam-engine";

export interface EngineRequest {
  id: number;
  spec: PlateSpecInput;
  options: Omit<GenerateOptions, "fonts">;
  /** Also simulates the cut and returns the height map. */
  simulate: boolean;
  simRes?: number;
  /** Panel mode (gControl, modest CPU): lower-resolution simulation. */
  lowPower?: boolean;
  /** Only warms up the engine (loads fonts and runs a minimal part), on the splash screen. */
  warmup?: boolean;
}

/** Height map of the stock after cutting: 0 = untouched face, negative = machined. */
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
