import type { MaterialId } from "../../schema.js";
import type { TableRow } from "./bits.js";

/**
 * Sienci Labs' official feeds and speeds table ("Feeds and Speeds", imperial version),
 * converted to mm. Source: https://resources.sienci.com/view/cnc-feeds-speeds/
 * Measured on a LongMill MK2 (NEMA 23 motors); use it as a starting point.
 *
 * Each row: [feed rate in/min, plunge rate in/min, stepover in, slotting stepdown in, pocket stepdown in, RPM]
 */
type Row = [number, number, number, number, number, number];

export type Speed = "reduced" | "regular" | "maximum";
export type MaterialGroup = "softwood" | "hardwood" | "plastic";

/** Sienci table groups for each engine material. */
export const MATERIAL_GROUP: Record<MaterialId, MaterialGroup> = {
  mdf: "softwood",
  plywood: "softwood",
  softwood: "softwood",
  hardwood: "hardwood",
  acrylic: "plastic",
};

type Table = Record<Speed, Partial<Record<Exclude<TableRow, "vbit">, Row>>> & { vbit: Row };

const T: Record<MaterialGroup, Table> = {
  // Softwood / Soft Plywood / MDF
  softwood: {
    vbit: [44, 15, 0.07, 0.42, 0.92, 22000],
    reduced: {
      "1/4-1flute": [64, 32, 0.11, 0.11, 0.24, 17000],
      "1/4-straight": [65, 33, 0.11, 0.11, 0.24, 12000],
      "1/8-1flute": [41, 21, 0.06, 0.17, 0.37, 22000],
      "1/8-straight": [64, 32, 0.06, 0.11, 0.24, 17000],
      "1/16-straight": [34, 17, 0.03, 0.1, 0.23, 17000],
      "surfacing-22": [61, 31, 0.35, 0.016, 0.04, 17000],
    },
    regular: {
      "1/4-1flute": [85, 43, 0.11, 0.16, 0.36, 17000],
      "1/4-straight": [86, 43, 0.11, 0.16, 0.36, 12000],
      "1/8-1flute": [55, 28, 0.06, 0.25, 0.55, 22000],
      "1/8-straight": [85, 43, 0.06, 0.16, 0.36, 17000],
      "1/16-straight": [43, 21, 0.03, 0.16, 0.37, 17000],
      "surfacing-22": [81, 41, 0.35, 0.02, 0.06, 17000],
    },
    maximum: {
      "1/4-1flute": [106, 53, 0.11, 0.22, 0.48, 17000],
      "1/4-straight": [108, 54, 0.11, 0.21, 0.48, 12000],
      "1/8-1flute": [69, 35, 0.06, 0.33, 0.73, 22000],
      "1/8-straight": [106, 53, 0.06, 0.22, 0.48, 17000],
      "1/16-straight": [53, 27, 0.03, 0.22, 0.49, 17000],
      "surfacing-22": [102, 51, 0.35, 0.03, 0.08, 17000],
    },
  },
  // Hardwood / Hard Plywood
  hardwood: {
    vbit: [44, 15, 0.07, 0.39, 0.86, 22000],
    reduced: {
      "1/4-1flute": [64, 32, 0.11, 0.11, 0.24, 17000],
      "1/4-straight": [65, 33, 0.11, 0.11, 0.24, 12000],
      "1/8-1flute": [41, 21, 0.06, 0.17, 0.37, 22000],
      "1/8-straight": [64, 32, 0.06, 0.11, 0.24, 17000],
      "1/16-straight": [34, 17, 0.03, 0.1, 0.24, 17000],
      "surfacing-22": [61, 31, 0.35, 0.016, 0.04, 17000],
    },
    regular: {
      "1/4-1flute": [85, 43, 0.11, 0.07, 0.17, 17000],
      "1/4-straight": [86, 43, 0.11, 0.07, 0.17, 12000],
      "1/8-1flute": [55, 28, 0.06, 0.12, 0.26, 22000],
      "1/8-straight": [85, 43, 0.06, 0.07, 0.17, 17000],
      "1/16-straight": [43, 21, 0.03, 0.07, 0.17, 17000],
      "surfacing-22": [81, 41, 0.35, 0.012, 0.028, 17000],
    },
    maximum: {
      "1/4-1flute": [106, 53, 0.11, 0.1, 0.22, 17000],
      "1/4-straight": [108, 54, 0.11, 0.1, 0.22, 12000],
      "1/8-1flute": [69, 35, 0.06, 0.15, 0.34, 22000],
      "1/8-straight": [106, 53, 0.06, 0.1, 0.22, 17000],
      "1/16-straight": [53, 27, 0.03, 0.1, 0.23, 17000],
      "surfacing-22": [102, 51, 0.35, 0.016, 0.04, 17000],
    },
  },
  // Plastics (Acrylic, PVC, HDPE, Acetal/Delrin). The table only lists upcut bits.
  plastic: {
    vbit: [44, 15, 0.07, 0.04, 0.09, 22000],
    reduced: {
      "1/4-1flute": [63, 31, 0.11, 0.024, 0.05, 12000],
      "1/4-straight": [91, 46, 0.11, 0.016, 0.04, 10000],
      "1/8-1flute": [31, 16, 0.06, 0.047, 0.1, 12000],
      "1/8-straight": [63, 31, 0.06, 0.02, 0.05, 12000],
      "1/16-straight": [44, 22, 0.03, 0.016, 0.035, 17000],
    },
    regular: {
      "1/4-1flute": [72, 36, 0.11, 0.04, 0.09, 12000],
      "1/4-straight": [104, 52, 0.11, 0.03, 0.06, 10000],
      "1/8-1flute": [36, 18, 0.06, 0.08, 0.18, 12000],
      "1/8-straight": [72, 36, 0.06, 0.04, 0.09, 12000],
      "1/16-straight": [51, 26, 0.03, 0.03, 0.06, 17000],
    },
    maximum: {
      "1/4-1flute": [90, 45, 0.11, 0.06, 0.12, 12000],
      "1/4-straight": [130, 65, 0.11, 0.04, 0.08, 10000],
      "1/8-1flute": [45, 22, 0.06, 0.11, 0.23, 12000],
      "1/8-straight": [90, 45, 0.06, 0.06, 0.12, 12000],
      "1/16-straight": [64, 32, 0.03, 0.04, 0.09, 17000],
    },
  },
};

export interface SienciParams {
  rpm: number;
  feed: number;
  plunge: number;
  stepover: number;
  /** Slotting stepdown (full bit width engaged): used for cutouts and the first ring of a pocket. */
  slotStepdown: number;
  pocketStepdown: number;
}

/** Looks up the table row, already in mm. Undefined when Sienci publishes no values for the combination. */
export function sienciParams(tableRow: TableRow, material: MaterialId, speed: Speed): SienciParams | undefined {
  const group = T[MATERIAL_GROUP[material]];
  const l = tableRow === "vbit" ? group.vbit : group[speed][tableRow];
  if (!l) return undefined;
  const mm = (v: number) => Math.round(v * 25.4 * 100) / 100;
  return {
    feed: Math.round(l[0] * 25.4),
    plunge: Math.round(l[1] * 25.4),
    stepover: mm(l[2]),
    slotStepdown: mm(l[3]),
    pocketStepdown: mm(l[4]),
    rpm: l[5],
  };
}
