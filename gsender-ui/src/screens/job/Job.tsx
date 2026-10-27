import type { GenerateResult } from "@gsender-next/cam-engine";
import { useEffect, useMemo, useRef } from "react";
import { TopBar, type JobStep } from "../../components/TopBar";
import type { SimGrid } from "../../engine/protocol";
import { engineKey, useEngine } from "../../engine/useEngine";
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
  /** The engine threw on this design (nothing to carve until it's fixed or undone). */
  error: string | null;
  machine: Machine;
  head: Head;
  headId: HeadId;
  preset: Preset;
  groups: OpGroup[];
  /** Tabs actually used (0 when the piece has no outer cut). */
  hasProfile: boolean;
  lettering: boolean;
}

// The last result survives a step change (each route mounts Job again).
let cache: { key: string; result: GenerateResult | null; sim: SimGrid | null } | null = null;

/** Job steps 2–4: Prepare, Position and Carve. */
export default function Job({ step }: { step: JobStep }) {
  const design = useDesign((s) => s.design);
  const { machine, head, headId } = useActiveMachine();
  const preset = design.preset ?? machine.preset;
  const eng = useEngine(design, { preset, delay: 50 });
  const key = engineKey(design, machine.id, headId, preset);
  if (!eng.busy && eng.result) cache = { key, result: eng.result, sim: eng.sim };
  const fromCache = cache && cache.key === key ? cache : null;
  const result = eng.result ?? fromCache?.result ?? null;
  const sim = eng.sim ?? fromCache?.sim ?? null;

  // The simulated bed matches the active machine's size.
  useEffect(() => {
    useMachine.getState().setBed({ x: machine.area[0], y: machine.area[1], z: machine.z });
  }, [machine]);

  // Project changed: zero is kept, but the bit and router must be checked again.
  const rev = useDesign((s) => s.rev);
  const lastRev = useRef(rev);
  useEffect(() => {
    if (lastRev.current !== rev) useFlow.getState().set({ bitIn: false, routerOn: false });
    lastRev.current = rev;
  }, [rev]);

  const lettering = design.spec.type === "lettering";
  const hasProfile = !!result?.operations.some((o) => o.type === "profile");
  const groups = useMemo(() => (result?.gcode ? groupOps(result, design.tabs.count, lettering) : []), [result, design.tabs.count, lettering]);
  const ctx: JobCtx = { design, result, sim, busy: eng.busy && !result, error: eng.busy ? null : eng.error, machine, head, headId, preset, groups, hasProfile, lettering };

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
