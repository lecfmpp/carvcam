import type { GenerateOptions, GenerateResult, PlateSpecInput } from "@gsender-next/cam-engine";
import { useEffect, useRef, useState } from "react";
import { PRESET_TO_SPEED, type Preset } from "../lib/catalog";
import { isPanelMode } from "../lib/panel";
import type { Design } from "../state/design";
import { useActiveMachine } from "../state/workshop";
import type { EngineRequest, EngineResponse, SimGrid } from "./protocol";

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (r: EngineResponse) => void>();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (ev: MessageEvent<EngineResponse>) => {
      pending.get(ev.data.id)?.(ev.data);
      pending.delete(ev.data.id);
    };
  }
  return worker;
}

/** Pede uma geração ao worker. */
export function runEngine(spec: PlateSpecInput, options: Omit<GenerateOptions, "fonts">, simulate = true, simRes?: number): Promise<EngineResponse> {
  const id = nextId++;
  const req: EngineRequest = { id, spec, options, simulate, simRes, lowPower: isPanelMode() };
  return new Promise((resolve) => {
    pending.set(id, resolve);
    getWorker().postMessage(req);
  });
}

/** Aquece o motor no worker (tela de entrada). */
export function warmEngine(): Promise<EngineResponse> {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    getWorker().postMessage({ id, warmup: true, spec: { width: 1, height: 1, thickness: 1 }, options: {}, simulate: false } satisfies EngineRequest);
  });
}

/** Opções do motor para o projeto atual na máquina ativa. */
export function engineOptions(design: Design, machineId: string, headId: string, preset: Preset): Omit<GenerateOptions, "fonts"> {
  return {
    sienci: {
      machine: machineId as never,
      head: headId as never,
      bit: design.bit,
      cutoutBit: design.useBit2 && design.bit2 ? design.bit2 : undefined,
      speed: PRESET_TO_SPEED[preset],
    },
    tabs: { count: design.tabs.count, height: design.tabs.height },
    title: design.name,
  };
}

export interface EngineState {
  busy: boolean;
  result: GenerateResult | null;
  sim: SimGrid | null;
  error: string | null;
}

/**
 * Regera o projeto sempre que ele muda (com um pequeno atraso para não regerar a cada tecla).
 * Só a resposta mais recente é aplicada.
 */
export function useEngine(design: Design, opts: { simulate?: boolean; delay?: number; preset?: Preset } = {}): EngineState {
  const { machine, headId } = useActiveMachine();
  const preset = opts.preset ?? design.preset ?? machine.preset;
  const [state, setState] = useState<EngineState>({ busy: true, result: null, sim: null, error: null });
  const latest = useRef(0);
  const key = JSON.stringify([design.spec, design.bit, design.bit2, design.useBit2, design.tabs, machine.id, headId, preset]);

  useEffect(() => {
    const ticket = ++latest.current;
    setState((s) => ({ ...s, busy: true }));
    const t = setTimeout(() => {
      runEngine(design.spec, engineOptions(design, machine.id, headId, preset), opts.simulate ?? true).then((r) => {
        if (ticket !== latest.current) return;
        setState({ busy: false, result: r.result, sim: r.sim, error: r.ok ? null : (r.error ?? "Engine error") });
      });
    }, opts.delay ?? 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
