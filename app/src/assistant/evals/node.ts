import { generatePlate, loadFonts, type FontMap } from "@carvcam/cam-engine";
import { engineOptions } from "../../engine/useEngine";
import { machineById, MACHINES, type MachineId } from "../../lib/catalog";
import { checksFromResult } from "../verify";
import type { AssistantMachine, Verifier, VerifyOutcome } from "../types";

/**
 * Node side of the assistant (vitest and the eval runner): the engine runs in-process with the
 * bundled fonts read from disk. Node built-ins are loaded dynamically so the browser app's
 * TypeScript config (no Node types) still checks this file.
 */

type NodeFs = { readFile(p: URL): Promise<Uint8Array> };
const nodeImport = (spec: string) => import(/* @vite-ignore */ spec) as Promise<unknown>;

let fonts: Promise<FontMap> | null = null;
export function nodeFonts(): Promise<FontMap> {
  return (fonts ??= (async () => {
    const fs = (await nodeImport("node:fs/promises")) as NodeFs;
    const dir = new URL("../../../../cam-engine/fonts/", import.meta.url);
    return loadFonts(async (file) => {
      const buf = await fs.readFile(new URL(file, dir));
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    });
  })());
}

/** The same engine run as the app's worker (generatePlate with the app's options), in-process. */
export const nodeVerify: Verifier = async (design, ctx) => {
  const preset = design.preset ?? machineById(ctx.machine.id as MachineId)?.preset ?? "balanced";
  const options = engineOptions(design, ctx.machine.id, ctx.machine.headId, preset);
  const key = JSON.stringify([design.spec, options]);
  const hit = memo.get(key);
  if (hit) return hit;
  // The engine is synchronous and can take seconds: let pending I/O (test runner, API calls) run first.
  await new Promise((r) => setTimeout(r, 0));
  let out: VerifyOutcome;
  try {
    const result = generatePlate(design.spec, { fonts: await nodeFonts(), ...options });
    out = { checks: checksFromResult(result), result };
  } catch (e) {
    out = { checks: checksFromResult(null, e instanceof Error ? e.message : String(e)), result: null };
  }
  memo.set(key, out);
  if (memo.size > 200) memo.delete(memo.keys().next().value!);
  return out;
};

/** Same design, same options → same result (the harness checks designs the turn already checked). */
const memo = new Map<string, VerifyOutcome>();

/** A Sienci machine as the assistant sees it. */
export function machineCtx(id: MachineId = "longmill-mk2-30x30"): AssistantMachine {
  const m = MACHINES.find((x) => x.id === id) ?? MACHINES[0];
  return { id: m.id, name: `${m.family} ${m.size}`, headId: m.defaultHead, travelX: m.area[0], travelY: m.area[1], travelZ: m.z };
}

/** process.env / argv without Node types. */
export const proc = (globalThis as unknown as { process: { env: Record<string, string | undefined>; argv: string[]; exitCode?: number } }).process;
