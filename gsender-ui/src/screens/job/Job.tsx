import type { GenerateResult } from "@gsender-next/cam-engine";
import { useEffect, useMemo, useRef } from "react";
import { TopBar, type JobStep } from "../../components/TopBar";
import type { SimGrid } from "../../engine/protocol";
import { useEngine } from "../../engine/useEngine";
import type { Head, HeadId, Machine, Preset } from "../../lib/catalog";
import { useMachine } from "../../machine/store";
import { useDesign, type Design } from "../../state/design";
import { useActiveMachine } from "../../state/workshop";
import { CarveStep } from "./CarveStep";
import "./job.css";
import { groupOps, useFlow, type OpGroup } from "./jobUtil";
import { PositionStep } from "./PositionStep";
import { PrepareStep } from "./PrepareStep";

export interface JobCtx {
  design: Design;
  result: GenerateResult | null;
  sim: SimGrid | null;
  busy: boolean;
  machine: Machine;
  head: Head;
  headId: HeadId;
  preset: Preset;
  groups: OpGroup[];
  /** Tabs actually used (0 when the piece has no outer cut). */
  hasProfile: boolean;
  lettering: boolean;
}

// O último resultado sobrevive à troca de etapa (cada rota monta o Job de novo).
let cache: { key: string; result: GenerateResult | null; sim: SimGrid | null } | null = null;

/** Etapas 2–4 do trabalho: Prepare, Position e Carve. */
export default function Job({ step }: { step: JobStep }) {
  const design = useDesign((s) => s.design);
  const { machine, head, headId } = useActiveMachine();
  const preset = design.preset ?? machine.preset;
  const eng = useEngine(design, { preset, delay: 50 });
  const key = JSON.stringify([design.spec, design.bit, design.bit2, design.useBit2, design.tabs, machine.id, headId, preset]);
  if (!eng.busy && eng.result) cache = { key, result: eng.result, sim: eng.sim };
  const fromCache = cache && cache.key === key ? cache : null;
  const result = eng.result ?? fromCache?.result ?? null;
  const sim = eng.sim ?? fromCache?.sim ?? null;

  // A cama simulada tem o tamanho da máquina ativa.
  useEffect(() => {
    useMachine.getState().setBed({ x: machine.area[0], y: machine.area[1], z: machine.z });
  }, [machine]);

  // Projeto mudou: o zero continua, mas a fresa e o router precisam ser conferidos de novo.
  const rev = useDesign((s) => s.rev);
  const lastRev = useRef(rev);
  useEffect(() => {
    if (lastRev.current !== rev) useFlow.getState().set({ bitIn: false, routerOn: false });
    lastRev.current = rev;
  }, [rev]);

  const lettering = design.spec.type === "lettering";
  const hasProfile = !!result?.operations.some((o) => o.type === "profile");
  const groups = useMemo(() => (result?.gcode ? groupOps(result, design.tabs.count, lettering) : []), [result, design.tabs.count, lettering]);
  const ctx: JobCtx = { design, result, sim, busy: eng.busy && !result, machine, head, headId, preset, groups, hasProfile, lettering };

  const zeroSet = useFlow((s) => s.zeroSet);
  const reachable: JobStep[] = ["create", "prepare"];
  if (result?.ok) reachable.push("position");
  if (result?.ok && zeroSet) reachable.push("carve");

  return (
    <div className="app">
      <div className="dotgrid" />
      <TopBar variant="job" step={step} reachable={reachable} />
      {step === "prepare" ? <PrepareStep ctx={ctx} /> : step === "position" ? <PositionStep ctx={ctx} /> : <CarveStep ctx={ctx} />}
    </div>
  );
}
