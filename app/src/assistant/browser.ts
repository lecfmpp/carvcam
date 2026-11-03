import { engineOptions, runEngine } from "../engine/useEngine";
import { machineById, type MachineId } from "../lib/catalog";
import { checksFromResult } from "./verify";
import type { Verifier } from "./types";

/** Verifier for the app: the same engine run (in the worker) that feeds the warning panel, without the simulation. */
export const browserVerify: Verifier = async (design, ctx) => {
  const preset = design.preset ?? machineById(ctx.machine.id as MachineId)?.preset ?? "balanced";
  const r = await runEngine(design.spec, engineOptions(design, ctx.machine.id, ctx.machine.headId, preset), false);
  if (!r.ok) return { checks: checksFromResult(null, r.error ?? "Engine error"), result: null };
  return { checks: checksFromResult(r.result), result: r.result };
};
