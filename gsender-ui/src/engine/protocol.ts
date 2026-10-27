import type { GenerateOptions, GenerateResult, PlateSpecInput } from "@gsender-next/cam-engine";
import type { BatchRow } from "../lib/batch";

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

/** Batch from CSV: one file per row, generated in the worker (progress after each row). */
export interface BatchRequest {
  id: number;
  kind: "batch";
  spec: PlateSpecInput;
  rows: Record<string, string>[];
  /** CSV headers, for the summary.csv columns. */
  headers: string[];
  options: Omit<GenerateOptions, "fonts">;
  fileNameField?: string;
  /** Also builds the ZIP (the .nc files of the rows that are ok + summary.csv). */
  zip: boolean;
}

export interface BatchProgress {
  id: number;
  kind: "batch-progress";
  done: number;
  total: number;
}

export interface BatchDone {
  id: number;
  kind: "batch-done";
  ok: boolean;
  error?: string;
  rows: BatchRow[];
  okCount: number;
  failed: number;
  totalTimeSec: number;
  zip: Uint8Array | null;
}

export type WorkerRequest = EngineRequest | BatchRequest;
export type WorkerMessage = EngineResponse | BatchProgress | BatchDone;
