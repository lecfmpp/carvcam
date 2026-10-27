import { fmt, type Warning } from "../../warnings.js";
import type { CutParams } from "../../materials.js";
import type { MachineInput, MaterialId, ToolInput } from "../../schema.js";
import { HEADS, nearestDial, type HeadId } from "./heads.js";
import { compatibility, BIT_BY_ID, toTool, type SienciBit } from "./bits.js";
import { machineLimits, MACHINES, type MachineId } from "./machines.js";
import { sienciParams, type Speed } from "./table.js";

/** Max plunge rate for a straight plunge (resources.sienci.com, "Feeds & Speeds - LongMill"). */
export const MAX_STRAIGHT_PLUNGE = 300;

/** What the user picks in the UI: machine, router/spindle, bits and speed. */
export interface SienciConfig {
  machine: MachineId;
  /** Default: the machine's default head. */
  head?: HeadId;
  /** Main bit (engraving and relief), catalog id. */
  bit: string;
  /** Bit for cutouts and holes. Default: the main bit. */
  cutoutBit?: string;
  /** Default: the speed suggested for the machine. */
  speed?: Speed;
}

export interface ManualAdjustment {
  tool: number;
  rpm: number;
  dial: number;
  message: string;
}

export interface ResolvedConfig {
  machine: MachineInput;
  tool: ToolInput;
  cutoutTool?: ToolInput;
  cut?: Partial<CutParams>;
  cutoutCut?: Partial<CutParams>;
  warnings: Warning[];
  /** When the router is not controlled by the G-code (Makita), the user has to turn the dial. */
  manualAdjustments: ManualAdjustment[];
  source: string;
}

/** Turns the user's choice into limits, tools and cutting parameters for the engine. */
export function resolveSienci(cfg: SienciConfig, material: MaterialId): ResolvedConfig {
  const machine = MACHINES[cfg.machine];
  const headId = cfg.head ?? machine.defaultHead;
  const head = HEADS[headId];
  const speed = cfg.speed ?? machine.defaultSpeed;
  const warnings: Warning[] = [];
  const manualAdjustments: ManualAdjustment[] = [];

  if (!machine.heads.includes(headId)) {
    warnings.push({ code: "BIT_INCOMPATIBLE", severity: "error", message: `The ${head.name} is not an option for the ${machine.name}.` });
  }

  const bits: { f: SienciBit; toolNumber: number; role: string }[] = [];
  const main = findBit(cfg.bit, warnings);
  if (main) bits.push({ f: main, toolNumber: 1, role: "main" });
  const cutout = cfg.cutoutBit && cfg.cutoutBit !== cfg.bit ? findBit(cfg.cutoutBit, warnings) : undefined;
  if (cutout) bits.push({ f: cutout, toolNumber: 2, role: "cutout" });

  const params: Partial<CutParams>[] = [];
  for (const { f, toolNumber, role } of bits) {
    if (!f.supportedInV1) {
      warnings.push({
        code: "BIT_NOT_SUPPORTED",
        severity: "error",
        message: `The ${role} bit (${f.name}) is not suitable for signs and lettering.`,
        suggestion: f.bestFor,
      });
    }
    const c = compatibility(f, headId);
    if (c.status === "incompatible") warnings.push({ code: "BIT_INCOMPATIBLE", severity: "error", message: c.reason });
    if (c.status === "with-accessory") {
      warnings.push({
        code: "BIT_NEEDS_ACCESSORY",
        severity: "warning",
        message: `To use the ${f.name} in the ${head.name} you need: ${c.accessory.name}.`,
        data: { url: c.accessory.url },
      });
    }

    const t = f.tableRow ? sienciParams(f.tableRow, material, speed) : undefined;
    if (!t) {
      warnings.push({
        code: "NO_SIENCI_TABLE",
        severity: "warning",
        message: `Sienci does not publish parameters for the ${f.name} in this material; using calculated conservative values.`,
      });
      params.push({});
      continue;
    }
    let stepdown = t.slotStepdown;
    if (f.compressionUpcut && stepdown <= f.compressionUpcut) {
      const minimum = f.compressionUpcut + 0.5;
      if (minimum <= t.pocketStepdown) {
        stepdown = minimum;
        warnings.push({
          code: "COMPRESSION_STEPDOWN",
          severity: "warning",
          message: `Stepdown increased to ${fmt(minimum)} mm: with a compression bit the first pass has to go past the ${fmt(f.compressionUpcut)} mm upcut section.`,
        });
      } else {
        warnings.push({
          code: "COMPRESSION_STEPDOWN",
          severity: "warning",
          message: `With this material and speed the stepdown stays below ${fmt(f.compressionUpcut)} mm, and the compression bit will chip the top face.`,
          suggestion: "Use a downcut bit or pick a faster table speed.",
        });
      }
    }
    // The engine still plunges straight down (no ramping). Outside 3D carving, Sienci recommends
    // a plunge rate of 100–300 mm/min, well below the table value.
    const plunge = Math.min(t.plunge, MAX_STRAIGHT_PLUNGE);
    params.push({ rpm: t.rpm, feed: t.feed, plunge, stepdown, stepover: t.stepover });

    if (head.rpmControl === "manual") {
      const d = nearestDial(head, t.rpm);
      if (d) {
        manualAdjustments.push({
          tool: toolNumber,
          rpm: t.rpm,
          dial: d.position,
          message: `Before cutting with the ${f.name}, set the ${head.name} dial to ${d.position} (${d.rpm.toLocaleString("en-US")} RPM).`,
        });
      }
    }
  }

  return {
    machine: machineLimits(cfg.machine, headId),
    tool: main ? toTool(main, 1) : {},
    cutoutTool: cutout ? toTool(cutout, 2) : undefined,
    cut: params[0],
    cutoutCut: cutout ? params[1] : undefined,
    warnings,
    manualAdjustments,
    source: `Sienci Labs table, ${speed} speed`,
  };
}

function findBit(id: string, warnings: Warning[]): SienciBit | undefined {
  const f = BIT_BY_ID.get(id);
  if (!f) warnings.push({ code: "BIT_INCOMPATIBLE", severity: "error", message: `Bit "${id}" is not in the Sienci catalog.` });
  return f;
}
