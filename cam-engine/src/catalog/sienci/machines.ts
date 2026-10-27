import type { MachineInput } from "../../schema.js";
import { HEADS, type HeadId } from "./heads.js";

/**
 * Sienci Labs machines. Travel and max rates come from the firmware defaults that gSender itself
 * applies to each profile ($110–$112 and $130–$132, in
 * src/app/src/features/Config/assets/MachineDefaults/), not from marketing material.
 */
export type MachineId =
  | "longmill-mk2-12x30"
  | "longmill-mk2-30x30"
  | "longmill-mk2-48x30"
  | "longmill-mk3-30x30"
  | "longmill-mk3-48x30"
  | "altmill-2x4"
  | "altmill-4x4"
  | "altmill-4x8";

export interface SienciMachine {
  id: MachineId;
  family: "LongMill" | "AltMill";
  version: string;
  size: string;
  name: string;
  /** Usable travel (mm). */
  travel: { x: number; y: number; z: number };
  /** Max rate (mm/min). */
  maxFeed: { xy: number; z: number };
  controller: string;
  heads: HeadId[];
  defaultHead: HeadId;
  /** Sienci table speed suggested for someone starting out on this machine. */
  defaultSpeed: "reduced" | "regular" | "maximum";
  notes: string[];
  url: string;
}

const LONGMILL_MK2 = {
  family: "LongMill" as const,
  version: "MK2",
  maxFeed: { xy: 4000, z: 3000 },
  controller: "LongBoard (grbl) or SuperLongBoard (grblHAL)",
  heads: ["makita-rt0701", "autospin-t1", "spindle-1-5kw-er20"] as HeadId[],
  defaultHead: "makita-rt0701" as HeadId,
  defaultSpeed: "regular" as const,
  notes: ["The 1.5 kW spindle kit requires the SuperLongBoard."],
  url: "https://resources.sienci.com/",
};

const LONGMILL_MK3 = {
  family: "LongMill" as const,
  version: "MK3",
  maxFeed: { xy: 7000, z: 4000 },
  controller: "SLB-LITE (grblHAL)",
  heads: ["autospin-t1", "makita-rt0701", "spindle-1-5kw-er20"] as HeadId[],
  defaultHead: "autospin-t1" as HeadId,
  defaultSpeed: "regular" as const,
  notes: ["The AutoSpin T1 comes in the Beginner's Kit.", "With an 80 mm spindle and a dust shoe, the cutting area gets smaller."],
  url: "https://resources.sienci.com/view/lmk3-specifications/",
};

const ALTMILL = {
  family: "AltMill" as const,
  version: "MK2",
  maxFeed: { xy: 15000, z: 6000 },
  controller: "SLB-EXT (grblHAL)",
  heads: ["spindle-2-2kw-er20", "spindle-1-5kw-er20"] as HeadId[],
  defaultHead: "spindle-2-2kw-er20" as HeadId,
  defaultSpeed: "maximum" as const,
  notes: ["The Sienci table was measured on a LongMill MK2; the stiffer AltMill handles the table's maximum speed as a starting point."],
  url: "https://sienci.com/product/altmill-2x4/",
};

export const MACHINES: Record<MachineId, SienciMachine> = {
  "longmill-mk2-12x30": { ...LONGMILL_MK2, id: "longmill-mk2-12x30", size: "12×30", name: "LongMill MK2 12×30", travel: { x: 810, y: 355, z: 120 } },
  "longmill-mk2-30x30": { ...LONGMILL_MK2, id: "longmill-mk2-30x30", size: "30×30", name: "LongMill MK2 30×30", travel: { x: 810, y: 855, z: 120 } },
  "longmill-mk2-48x30": { ...LONGMILL_MK2, id: "longmill-mk2-48x30", size: "48×30", name: "LongMill MK2 48×30", travel: { x: 1270, y: 855, z: 120 } },
  "longmill-mk3-30x30": { ...LONGMILL_MK3, id: "longmill-mk3-30x30", size: "30×30", name: "LongMill MK3 30×30", travel: { x: 805, y: 830, z: 129 } },
  "longmill-mk3-48x30": { ...LONGMILL_MK3, id: "longmill-mk3-48x30", size: "48×30", name: "LongMill MK3 48×30", travel: { x: 1296, y: 830, z: 129 } },
  "altmill-2x4": { ...ALTMILL, id: "altmill-2x4", size: "2×4", name: "AltMill 2×4", travel: { x: 1260, y: 648, z: 170 } },
  "altmill-4x4": { ...ALTMILL, id: "altmill-4x4", size: "4×4", name: "AltMill 4×4", travel: { x: 1260, y: 1248, z: 170 } },
  "altmill-4x8": { ...ALTMILL, id: "altmill-4x8", size: "4×8", name: "AltMill 4×8", travel: { x: 1260, y: 2661, z: 220 } },
};

/** Machine limits in the CAM engine's format, with the spindle speed range of the chosen head. */
export function machineLimits(id: MachineId, headId?: HeadId): MachineInput {
  const m = MACHINES[id];
  const head = HEADS[headId ?? m.defaultHead];
  return {
    name: `${m.name} + ${head.name}`,
    travelX: m.travel.x,
    travelY: m.travel.y,
    travelZ: m.travel.z,
    maxFeedXY: m.maxFeed.xy,
    maxFeedZ: m.maxFeed.z,
    rpmMin: head.rpmMin,
    rpmMax: head.rpmMax,
  };
}
