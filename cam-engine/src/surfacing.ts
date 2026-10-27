import { depthLevels, PathBuilder } from "./cam/builder.js";
import { HEADS, nearestDial, type HeadId } from "./catalog/sienci/heads.js";
import { BIT_BY_ID, toTool } from "./catalog/sienci/bits.js";
import { machineLimits, type MachineId } from "./catalog/sienci/machines.js";
import { sienciParams, type Speed } from "./catalog/sienci/table.js";
import { cutParams, type CutParams } from "./materials.js";
import { postGrbl } from "./post/grbl.js";
import { MachineSchema, ToolSchema, type MachineInput, type Tool, type ToolInput } from "./schema.js";
import { verifyGcode, type VerifyResult } from "./verify.js";

/**
 * Spoilboard surfacing: zigzag passes along X, stepping over in Y.
 * Work origin: front-left corner of the area, Z0 on the current spoilboard surface.
 * The bit center covers the whole area [0, width] × [0, height].
 */
export interface SurfacingInput {
  width: number;
  height: number;
  /** How much to take off the spoilboard (mm). */
  depth: number;
  stepdown?: number;
  stepover?: number;
  tool?: ToolInput;
  machine?: MachineInput;
  cut?: Partial<CutParams>;
  /** Fills in machine, bit (22 mm) and parameters from the Sienci catalog. */
  sienci?: { machine: MachineId; head?: HeadId; speed?: Speed };
}

export interface SurfacingResult {
  ok: boolean;
  gcode: string;
  lines: number;
  passes: number;
  tool: Tool;
  params: CutParams;
  verification: VerifyResult;
  /** Dial setting when the router speed is set by hand (Makita). */
  dial?: { position: number; rpm: number };
}

const SURFACING_BIT = "surfacing-22mm";

export function generateSurfacing(input: SurfacingInput): SurfacingResult {
  let machineIn = input.machine;
  let toolIn = input.tool;
  let cut = input.cut ?? {};
  let dial: SurfacingResult["dial"];
  if (input.sienci) {
    machineIn = machineIn ?? machineLimits(input.sienci.machine, input.sienci.head);
    toolIn = toolIn ?? toTool(BIT_BY_ID.get(SURFACING_BIT)!, 1);
    const t = sienciParams("surfacing-22", "mdf", input.sienci.speed ?? "regular");
    if (t) cut = { rpm: t.rpm, feed: t.feed, plunge: Math.min(t.plunge, 300), stepdown: t.pocketStepdown, stepover: t.stepover, ...cut };
    const head = input.sienci.head ? HEADS[input.sienci.head] : undefined;
    if (head && head.rpmControl === "manual" && t) dial = nearestDial(head, t.rpm);
  }
  const machine = MachineSchema.parse(machineIn ?? {});
  const tool = ToolSchema.parse(toolIn ?? { diameter: 22, cutLength: 12, name: "22mm Surfacing Bit" });
  const p = cutParams("mdf", tool, machine, {
    ...cut,
    ...(input.stepdown ? { stepdown: input.stepdown } : {}),
    ...(input.stepover ? { stepover: input.stepover } : {}),
  });
  if (!input.stepover && !cut.stepover) p.stepover = Math.round(tool.diameter * 0.4 * 100) / 100;
  if (!input.stepdown && !cut.stepdown) p.stepdown = Math.min(p.stepdown, 1);

  const W = input.width;
  const H = input.height;
  const rows: number[] = [];
  for (let y = 0; y < H - 1e-6; y += p.stepover) rows.push(round3(y));
  rows.push(H);

  const b = new PathBuilder({ feed: p.feed, plunge: p.plunge, retractHeight: machine.retractHeight, safeHeight: machine.safeHeight });
  const levels = depthLevels(input.depth, p.stepdown);
  for (const z of levels) {
    b.travel({ x: 0, y: rows[0] });
    b.plunge(z);
    rows.forEach((y, i) => {
      const xa = i % 2 === 0 ? 0 : W;
      const xb = i % 2 === 0 ? W : 0;
      if (i > 0) b.feed({ x: xa, y }, z);
      b.feed({ x: xb, y }, z);
    });
    b.retract();
  }
  b.safe();

  const notes = dial ? [`Makita: set the dial to ${dial.position}, about ${dial.rpm} RPM, before switching on`] : [];
  const gcode = postGrbl(
    { title: "Surface the spoilboard", stock: { width: W, height: H, thickness: input.depth }, safeHeight: machine.safeHeight, notes },
    [{ name: "Surfacing", tool: tool, rpm: p.rpm, moves: b.moves }],
  );
  const verification = verifyGcode(gcode, {
    xMin: -1,
    xMax: Math.min(machine.travelX, W) + 1,
    yMin: -1,
    yMax: Math.min(machine.travelY, H) + 1,
    zMin: -(input.depth + 0.5),
    zMax: machine.safeHeight + 0.001,
    maxFeed: machine.maxFeedXY,
    rpmMin: machine.rpmMin,
    rpmMax: machine.rpmMax,
  });
  return { ok: verification.ok && W <= machine.travelX && H <= machine.travelY, gcode, lines: rows.length, passes: levels.length, tool: tool, params: p, verification, dial };
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;
