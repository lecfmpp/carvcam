import type { GenerateOptions, GenerateResult, PlateSpecInput } from "@gsender-next/cam-engine";
import { useEffect, useRef, useState } from "react";
import { PRESET_TO_SPEED, type Preset } from "../lib/catalog";
import { isPanelMode } from "../lib/panel";
import { useDesign, type Design } from "../state/design";
import { useActiveMachine } from "../state/workshop";
import type { BatchDone, BatchRequest, EngineRequest, EngineResponse, SimGrid, WorkerMessage } from "./protocol";

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (r: EngineResponse) => void>();
const batches = new Map<number, { done(r: BatchDone): void; progress?(done: number, total: number): void }>();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (ev: MessageEvent<WorkerMessage>) => {
      const m = ev.data;
      if ("kind" in m) {
        const b = batches.get(m.id);
        if (m.kind === "batch-progress") b?.progress?.(m.done, m.total);
        else {
          b?.done(m);
          batches.delete(m.id);
        }
        return;
      }
      pending.get(m.id)?.(m);
      pending.delete(m.id);
    };
  }
  return worker;
}

/** Generates one file per CSV row in the worker (the UI stays responsive), with progress. */
export function runBatch(req: Omit<BatchRequest, "id" | "kind">, onProgress?: (done: number, total: number) => void): Promise<BatchDone> {
  const id = nextId++;
  return new Promise((resolve) => {
    batches.set(id, { done: resolve, progress: onProgress });
    getWorker().postMessage({ ...req, id, kind: "batch" } satisfies BatchRequest);
  });
}

/** Asks the worker for a generation. */
export function runEngine(spec: PlateSpecInput, options: Omit<GenerateOptions, "fonts">, simulate = true, simRes?: number): Promise<EngineResponse> {
  const id = nextId++;
  const req: EngineRequest = { id, spec, options, simulate, simRes, lowPower: isPanelMode() };
  return new Promise((resolve) => {
    pending.set(id, resolve);
    getWorker().postMessage(req);
  });
}

/** Warms up the engine in the worker (splash screen). */
export function warmEngine(): Promise<EngineResponse> {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    getWorker().postMessage({ id, warmup: true, spec: { width: 1, height: 1, thickness: 1 }, options: {}, simulate: false } satisfies EngineRequest);
  });
}

/** Engine options for the current project on the active machine. */
export function engineOptions(design: Design, machineId: string, headId: string, preset: Preset): Omit<GenerateOptions, "fonts"> {
  return {
    sienci: {
      machine: machineId as never,
      head: headId as never,
      bit: design.bit,
      cutoutBit: design.useBit2 && design.bit2 ? design.bit2 : undefined,
      speed: PRESET_TO_SPEED[preset],
    },
    tabs: engineTabs(design.tabs),
    title: design.name,
    ...(design.keepOut?.length ? { keepOut: design.keepOut } : {}),
  };
}

/** The engine's tab option. Width 6 and Auto give exactly the G-code of before tabs were editable. */
export function engineTabs(t: Design["tabs"]): NonNullable<GenerateOptions["tabs"]> {
  return {
    count: t.count,
    height: t.height,
    width: t.width ?? 6,
    ...(t.mode === "manual" ? { positions: t.positions ?? [] } : {}),
  };
}

/** Tabs the job will have (before the engine drops any that do not fit). */
export const tabCount = (t: Design["tabs"]) => (t.mode === "manual" ? (t.positions?.length ?? 0) : t.count);

/** Everything that changes the generated job (used to know when to regenerate). */
export function engineKey(design: Design, machineId: string, headId: string, preset?: Preset) {
  return JSON.stringify([design.spec, design.bit, design.bit2, design.useBit2, design.tabs, design.keepOut ?? [], machineId, headId, preset ?? null]);
}

export interface EngineState {
  busy: boolean;
  result: GenerateResult | null;
  sim: SimGrid | null;
  error: string | null;
  /** Last result that arrived, kept for the preview when the engine throws (never used to carve). */
  prev: GenerateResult | null;
}

/**
 * Regenerates the project whenever it changes (with a short delay so it doesn't regenerate on every keystroke).
 * Only the latest response is applied.
 */
export function useEngine(design: Design, opts: { simulate?: boolean; delay?: number; preset?: Preset } = {}): EngineState {
  const { machine, headId } = useActiveMachine();
  const preset = opts.preset ?? design.preset ?? machine.preset;
  const [state, setState] = useState<EngineState>({ busy: true, result: null, sim: null, error: null, prev: null });
  const latest = useRef(0);
  const key = engineKey(design, machine.id, headId, preset);

  useEffect(() => {
    const ticket = ++latest.current;
    setState((s) => ({ ...s, busy: true }));
    const t = setTimeout(() => {
      runEngine(design.spec, engineOptions(design, machine.id, headId, preset), opts.simulate ?? true).then((r) => {
        if (ticket !== latest.current) return;
        if (r.ok && r.result?.ok) useDesign.getState().markGood(design);
        setState((s) =>
          r.ok
            ? { busy: false, result: r.result, sim: r.sim, error: null, prev: r.result }
            : // The engine threw: no result for this design (nothing to carve), but the last preview stays.
              { busy: false, result: null, sim: s.sim, error: r.error ?? "Engine error", prev: s.result ?? s.prev },
        );
      });
    }, opts.delay ?? 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
