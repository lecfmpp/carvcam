import type { MaterialId } from "../../schema.js";

/**
 * Sienci Labs' official feeds and speeds table ("Feeds & Speeds", metric version).
 *
 * Source: https://resources.sienci.com/view/cnc-feeds-speeds/ (page updated 2026-05-13, checked
 * 2026-11-03) and the PDF https://resources.sienci.com/wp-content/uploads/2022/10/FeedsSpeedsMetric.pdf.
 * The numbers below were copied from the page as published (already in mm and mm/min).
 *
 * Sienci measured the table on a LongMill MK2 (NEMA 23 motors) and presents it as a starting point.
 * Where the table has no entry for a combination, Sienci says it is because they do not recommend it
 * (FAQ on the same page). So nothing here is made up: missing combinations stay missing, and
 * anything that needs an estimated value goes through `feeds.ts`, which derives it from these rows
 * with documented rules.
 */
export interface Source {
  title: string;
  url: string;
  checkedOn: string;
}

export const TABLE_SOURCE: Source = {
  title: "Sienci Labs · Feeds & Speeds (metric table, updated 2026-05-13)",
  url: "https://resources.sienci.com/view/cnc-feeds-speeds/",
  checkedOn: "2026-11-03",
};
export const TABLE_SOURCE_PDF: Source = {
  title: "Sienci Labs · FeedsSpeedsMetric.pdf",
  url: "https://resources.sienci.com/wp-content/uploads/2022/10/FeedsSpeedsMetric.pdf",
  checkedOn: "2026-11-03",
};

/** Table rows (one per bit geometry Sienci lists). */
export type TableRow =
  | "1/16-straight"
  | "1/16-corncob"
  | "1/8-straight"
  | "1/8-1flute"
  | "1/8-ball"
  | "1/4-straight"
  | "1/4-1flute"
  | "1/4-ball"
  | "surfacing-22"
  | "groove-1-2"
  | "groove-3-4"
  | "groove-1"
  // Engraving / 3D tables (they do not change with speed).
  | "vbit"
  | "vbit-vcarve"
  | "tapered-1-4"
  | "tapered-1-4-finish"
  | "tapered-1-8"
  | "tapered-1-8-finish"
  | "ball-1-4-finish"
  | "ball-1-8-finish";

/** Reference geometry of each row (cutting diameter in mm and flute count), with Sienci's row name. */
export const ROW_GEOMETRY: Record<TableRow, { diameter: number; flutes: number; name: string }> = {
  "1/16-straight": { diameter: 1.5875, flutes: 2, name: '1/16" Flat End Mill UC/DC' },
  "1/16-corncob": { diameter: 1.5875, flutes: 2, name: '1/16" Corncob End Mill' },
  "1/8-straight": { diameter: 3.175, flutes: 2, name: '1/8" Flat End Mill UC/DC' },
  "1/8-1flute": { diameter: 3.175, flutes: 1, name: '1/8" Single Flute Flat End Mill UC' },
  "1/8-ball": { diameter: 3.175, flutes: 2, name: '1/8" Ball End Mill' },
  "1/4-straight": { diameter: 6.35, flutes: 2, name: '1/4" Flat End Mill UC/DC' },
  "1/4-1flute": { diameter: 6.35, flutes: 1, name: '1/4" Single Flute Flat End Mill UC' },
  "1/4-ball": { diameter: 6.35, flutes: 2, name: '1/4" Ball End Mill' },
  "surfacing-22": { diameter: 22, flutes: 2, name: "22mm Surfacing Bit" },
  "groove-1-2": { diameter: 12.7, flutes: 2, name: '1/2" Round Groove Bit' },
  "groove-3-4": { diameter: 19.05, flutes: 2, name: '3/4" Round Groove Bit' },
  "groove-1": { diameter: 25.4, flutes: 2, name: '1" Round Groove Bit' },
  vbit: { diameter: 0, flutes: 0, name: "30, 90, 60 Degree V-bit - Fine Detail/Engraving" },
  "vbit-vcarve": { diameter: 0, flutes: 0, name: "90, 60 Degree V-bit - V-Carving" },
  "tapered-1-4": { diameter: 1.5875, flutes: 2, name: '1/4" - D1/16" Tapered Ball End Mill - Coarse' },
  "tapered-1-4-finish": { diameter: 1.5875, flutes: 2, name: '1/4" - D1/16" Tapered Ball End Mill - Fine' },
  "tapered-1-8": { diameter: 0.5, flutes: 2, name: '1/8" - D0.5mm Tapered Ball End Mill - Coarse' },
  "tapered-1-8-finish": { diameter: 0.5, flutes: 2, name: '1/8" - D0.5mm Tapered Ball End Mill - Fine' },
  "ball-1-4-finish": { diameter: 6.35, flutes: 2, name: '1/4" Ball End Mill - Finishing' },
  "ball-1-8-finish": { diameter: 3.175, flutes: 2, name: '1/8" Ball End Mill - Finishing' },
};

export type Speed = "reduced" | "regular" | "maximum";
/** The four material groups in Sienci's table. */
export type MaterialGroup = "softwood" | "hardwood" | "plastic" | "aluminum";
export const MATERIAL_GROUPS: MaterialGroup[] = ["softwood", "hardwood", "plastic", "aluminum"];
export const SPEEDS: Speed[] = ["reduced", "regular", "maximum"];

/** Sienci table group for each engine material. */
export const MATERIAL_GROUP: Record<MaterialId, MaterialGroup> = {
  mdf: "softwood",
  plywood: "softwood",
  softwood: "softwood",
  hardwood: "hardwood",
  acrylic: "plastic",
};

/**
 * In wood the table lists upcut (UC) and downcut (DC) straight bits with the same numbers.
 * In plastics and aluminum it only lists upcut bits: downcut and compression are left out.
 */
export const UPCUT_ONLY: Record<MaterialGroup, boolean> = { softwood: false, hardwood: false, plastic: true, aluminum: true };

/** [feed mm/min, plunge mm/min, stepover mm, slotting stepdown mm (null = N/A), pocket stepdown mm, RPM] */
export type Row = [number, number, number, number | null, number, number];
type RowTable = Partial<Record<TableRow, Row>>;

const T2D: Record<MaterialGroup, Record<Speed, RowTable>> = {
  // Soft Woods, Plywood, and MDF
  softwood: {
    reduced: {
      "1/4-1flute": [1620, 810, 2.85, 2.8, 6.1, 17000],
      "1/4-straight": [1650, 830, 2.85, 2.7, 6, 12000],
      "1/4-ball": [1650, 830, 2.85, 2.7, 6, 12000],
      "1/8-1flute": [1050, 530, 1.45, 4.3, 9.3, 22000],
      "1/8-straight": [1620, 810, 1.45, 2.8, 6, 17000],
      "1/8-ball": [1620, 810, 1.45, 2.8, 6, 17000],
      "1/16-straight": [860, 430, 0.7, 2.6, 5.9, 17000],
      "1/16-corncob": [860, 430, 0.7, 2.6, 5.9, 17000],
      "surfacing-22": [1550, 780, 8.8, 0.4, 1, 17000],
      "groove-1-2": [860, 430, 5.7, 3.2, 7.2, 17000],
      "groove-3-4": [860, 430, 8.5725, 2.2, 4.8, 17000],
      "groove-1": [860, 430, 11.43, 1.6, 3.6, 17000],
    },
    regular: {
      "1/4-1flute": [2160, 1080, 2.85, 4.1, 9.2, 17000],
      "1/4-straight": [2190, 1100, 2.85, 4.1, 9.1, 12000],
      "1/4-ball": [2190, 1100, 2.85, 4.1, 9.1, 12000],
      "1/8-1flute": [1400, 700, 1.45, 6.4, 14, 22000],
      "1/8-straight": [2160, 1080, 1.45, 4.1, 9.1, 17000],
      "1/8-ball": [2160, 1080, 1.45, 4.1, 9.1, 17000],
      "1/16-straight": [1080, 540, 0.7, 4.1, 9.4, 17000],
      "1/16-corncob": [1080, 540, 0.7, 4.1, 9.4, 17000],
      "surfacing-22": [2070, 1040, 8.8, 0.6, 1.6, 17000],
      "groove-1-2": [1040, 520, 5.7, 8.9, 19.9, 17000],
      "groove-3-4": [1300, 650, 8.5725, 4.8, 10.6, 17000],
      "groove-1": [1300, 650, 11.43, 3.6, 8, 17000],
    },
    maximum: {
      "1/4-1flute": [2700, 1350, 2.85, 5.5, 12.3, 17000],
      "1/4-straight": [2740, 1370, 2.85, 5.4, 12.1, 12000],
      "1/4-ball": [2740, 1370, 2.85, 5.4, 12.1, 12000],
      "1/8-1flute": [1750, 880, 1.45, 8.5, 18.6, 22000],
      "1/8-straight": [2700, 1350, 1.45, 5.5, 12.1, 17000],
      "1/8-ball": [2700, 1350, 1.45, 5.5, 12.1, 17000],
      "1/16-straight": [1350, 680, 0.7, 5.5, 12.5, 17000],
      "1/16-corncob": [1350, 680, 0.7, 5.5, 12.5, 17000],
      "surfacing-22": [2590, 1300, 8.8, 0.8, 2.1, 17000],
      "groove-1-2": [1300, 650, 5.7, 7.2, 15.9, 17000],
      "groove-3-4": [1300, 650, 8.5725, 4.8, 10.6, 17000],
      "groove-1": [1300, 650, 11.43, 3.6, 8, 17000],
    },
  },
  // Hard Woods and Plywoods
  hardwood: {
    reduced: {
      "1/4-1flute": [1620, 810, 2.85, 1.3, 2.9, 17000],
      "1/4-straight": [1650, 830, 2.85, 1.3, 2.8, 12000],
      "1/4-ball": [1650, 830, 2.85, 1.3, 2.8, 12000],
      "1/8-1flute": [1050, 530, 1.45, 2, 4.3, 22000],
      "1/8-straight": [1620, 810, 1.45, 1.3, 2.8, 17000],
      "1/8-ball": [1620, 810, 1.45, 1.3, 2.8, 17000],
      "1/16-straight": [860, 430, 0.7, 1.2, 2.7, 17000],
      "1/16-corncob": [860, 430, 0.7, 1.2, 2.7, 17000],
      "surfacing-22": [1550, 780, 8.8, 0.2, 0.5, 17000],
      "groove-1-2": [780, 390, 5.7, 1.7, 3.7, 17000],
      "groove-3-4": [860, 430, 8.5725, 1, 2.2, 17000],
      "groove-1": [780, 390, 11.43, 0.8, 1.8, 17000],
    },
    regular: {
      "1/4-1flute": [2160, 1080, 2.85, 1.9, 4.3, 17000],
      "1/4-straight": [2190, 1100, 2.85, 1.9, 4.2, 12000],
      "1/4-ball": [2190, 1100, 2.85, 1.9, 4.2, 12000],
      "1/8-1flute": [1400, 700, 1.45, 3, 6.5, 22000],
      "1/8-straight": [2160, 1080, 1.45, 1.9, 4.2, 17000],
      "1/8-ball": [2160, 1080, 1.45, 1.9, 4.2, 17000],
      "1/16-straight": [1080, 540, 0.7, 1.9, 4.4, 17000],
      "1/16-corncob": [1080, 540, 0.7, 1.9, 4.4, 17000],
      "surfacing-22": [2070, 1040, 8.8, 0.3, 0.7, 17000],
      "groove-1-2": [1040, 520, 5.7, 4.2, 9.3, 17000],
      "groove-3-4": [1300, 650, 8.5725, 2.2, 4.9, 17000],
      "groove-1": [1300, 650, 11.43, 1.7, 3.7, 17000],
    },
    maximum: {
      "1/4-1flute": [2700, 1350, 2.85, 2.6, 5.7, 17000],
      "1/4-straight": [2740, 1370, 2.85, 2.5, 5.6, 12000],
      "1/4-ball": [2740, 1370, 2.85, 2.5, 5.6, 12000],
      "1/8-1flute": [1750, 880, 1.45, 3.9, 8.6, 22000],
      "1/8-straight": [2700, 1350, 1.45, 2.6, 5.6, 17000],
      "1/8-ball": [2700, 1350, 1.45, 2.6, 5.6, 17000],
      "1/16-straight": [1350, 680, 0.7, 2.6, 5.8, 17000],
      "1/16-corncob": [1350, 680, 0.7, 2.6, 5.8, 17000],
      "surfacing-22": [2590, 1300, 8.8, 0.4, 1, 17000],
      "groove-1-2": [1300, 650, 5.7, 3.3, 7.4, 17000],
      "groove-3-4": [1300, 650, 8.5725, 2.2, 4.9, 17000],
      "groove-1": [1300, 650, 11.43, 1.7, 3.7, 17000],
    },
  },
  // Plastics (Acrylic, PVC, HDPE, Acetal/Delrin). Upcut bits only; no surfacing, corncob or round groove.
  plastic: {
    reduced: {
      "1/4-1flute": [1600, 800, 2.85, 0.6, 1.3, 12000],
      "1/4-straight": [2310, 1160, 2.85, 0.4, 0.9, 10000],
      "1/4-ball": [2310, 1160, 2.85, 0.4, 0.9, 10000],
      "1/8-1flute": [800, 400, 1.45, 1.2, 2.5, 12000],
      "1/8-straight": [1600, 800, 1.45, 0.6, 1.3, 12000],
      "1/8-ball": [1600, 800, 1.45, 0.6, 1.3, 12000],
      "1/16-straight": [1130, 570, 0.7, 0.4, 0.9, 17000],
    },
    regular: {
      "1/4-1flute": [1830, 920, 2.85, 1, 2.3, 12000],
      "1/4-straight": [2640, 1320, 2.85, 0.7, 1.6, 10000],
      "1/4-ball": [2640, 1320, 2.85, 0.7, 1.6, 10000],
      "1/8-1flute": [910, 460, 1.45, 2, 4.5, 12000],
      "1/8-straight": [1830, 920, 1.45, 1, 2.2, 12000],
      "1/8-ball": [1830, 920, 1.45, 1, 2.2, 12000],
      "1/16-straight": [1300, 650, 0.7, 0.7, 1.6, 17000],
    },
    maximum: {
      "1/4-1flute": [2290, 1150, 2.85, 1.4, 3, 12000],
      "1/4-straight": [3300, 1650, 2.85, 0.9, 2.1, 10000],
      "1/4-ball": [3300, 1650, 2.85, 0.9, 2.1, 10000],
      "1/8-1flute": [1140, 570, 1.45, 2.7, 5.9, 12000],
      "1/8-straight": [2290, 1150, 1.45, 1.4, 3, 12000],
      "1/8-ball": [2290, 1150, 1.45, 1.4, 3, 12000],
      "1/16-straight": [1620, 810, 0.7, 1, 2.2, 17000],
    },
  },
  // Aluminum (6061). Only 1/8″ and 1/4″ upcut (2 flutes, 1 flute and ball).
  aluminum: {
    reduced: {
      "1/4-1flute": [880, 440, 2.85, 0.3, 0.6, 17000],
      "1/4-straight": [1240, 620, 2.85, 0.2, 0.4, 12000],
      "1/4-ball": [1240, 620, 2.85, 0.2, 0.4, 12000],
      "1/8-1flute": [440, 220, 1.45, 0.4, 0.9, 17000],
      "1/8-straight": [880, 440, 1.45, 0.2, 0.5, 17000],
      "1/8-ball": [880, 440, 1.45, 0.2, 0.5, 17000],
    },
    regular: {
      "1/4-1flute": [1080, 540, 2.85, 0.4, 0.9, 17000],
      "1/4-straight": [1520, 760, 2.85, 0.3, 0.6, 12000],
      "1/4-ball": [1520, 760, 2.85, 0.3, 0.6, 12000],
      "1/8-1flute": [540, 270, 1.45, 0.6, 1.3, 17000],
      "1/8-straight": [1080, 540, 1.45, 0.3, 0.7, 17000],
      "1/8-ball": [1080, 540, 1.45, 0.3, 0.7, 17000],
    },
    maximum: {
      "1/4-1flute": [1350, 680, 2.85, 0.45, 1, 17000],
      "1/4-straight": [1910, 960, 2.85, 0.3, 0.7, 12000],
      "1/4-ball": [1910, 960, 2.85, 0.3, 0.7, 12000],
      "1/8-1flute": [670, 340, 1.45, 0.7, 1.5, 17000],
      "1/8-straight": [1350, 680, 1.45, 0.35, 0.8, 17000],
      "1/8-ball": [1350, 680, 1.45, 0.35, 0.8, 17000],
    },
  },
};

/** Engraving and 3D tables ("engraving or 3D carving"): one row each, no speed levels. */
const T3D: Record<MaterialGroup, RowTable> = {
  softwood: {
    "vbit-vcarve": [2240, 750, 1.8, 10.6, 23.4, 22000],
    vbit: [1120, 370, 1.8, 10.6, 23.4, 22000],
    "tapered-1-4": [2470, 820, 0.24, null, 25.4, 28500],
    "tapered-1-4-finish": [3800, 1270, 0.08, null, 25.4, 28500],
    "tapered-1-8": [2000, 670, 0.15, null, 12.7, 28500],
    "tapered-1-8-finish": [3640, 1210, 0.04, null, 12.7, 28500],
    "ball-1-4-finish": [2790, 1400, 0.3, 4, 25.4, 22000],
    "ball-1-8-finish": [2060, 1030, 0.15, 5.4, 25.4, 27000],
  },
  hardwood: {
    "vbit-vcarve": [1730, 580, 1.8, 6.3, 14.1, 17000],
    vbit: [1120, 370, 1.8, 9.8, 21.8, 22000],
    "tapered-1-4": [1630, 815, 0.24, null, 25.4, 28500],
    "tapered-1-4-finish": [3800, 1900, 0.08, null, 25.4, 28500],
    "tapered-1-8": [1290, 645, 0.15, null, 12.7, 28500],
    "tapered-1-8-finish": [3640, 1820, 0.04, null, 12.7, 28500],
    "ball-1-4-finish": [2790, 1400, 0.3, 1.9, 25.4, 22000],
    "ball-1-8-finish": [2060, 1030, 0.15, 2.5, 25.4, 27000],
  },
  plastic: {
    "vbit-vcarve": [1730, 580, 1.8, 0.7, 1.6, 17000],
    vbit: [1120, 370, 1.8, 1.1, 2.4, 22000],
    "tapered-1-4": [700, 350, 0.24, null, 0.4, 10000],
    "tapered-1-4-finish": [1000, 500, 0.08, null, 12.7, 10000],
    "tapered-1-8": [2000, 1000, 0.15, null, 0.25, 10000],
    "tapered-1-8-finish": [3000, 1500, 0.04, null, 25.4, 10000],
    "ball-1-4-finish": [1680, 840, 0.13, 1.4, 25.4, 22000],
    "ball-1-8-finish": [1030, 520, 0.13, 2.3, 25.4, 27000],
  },
  // Sienci says to avoid tapered bits in aluminum; the table only has V (detail) and finishing ball rows.
  aluminum: {
    vbit: [1350, 450, 1.45, 0.2, 0.5, 17000],
    "ball-1-4-finish": [1120, 560, 0.3, 0.4, 25.4, 22000],
    "ball-1-8-finish": [690, 350, 0.15, 0.7, 25.4, 27000],
  },
};

/** Raw row of the official table, or undefined when Sienci publishes nothing for the combination. */
export function officialRow(row: TableRow, group: MaterialGroup, speed: Speed): Row | undefined {
  return T3D[group][row] ?? T2D[group][speed][row];
}

export interface SienciParams {
  rpm: number;
  feed: number;
  plunge: number;
  stepover: number;
  /** Slotting stepdown (full bit width engaged): used for cutouts and the first ring of a pocket. */
  slotStepdown: number;
  pocketStepdown: number;
}

/**
 * Looks up the table row (mm, mm/min). Undefined when Sienci publishes no values for the combination
 * (or when the row has no slotting stepdown, as with the tapered bits).
 */
export function sienciParams(row: TableRow, material: MaterialId, speed: Speed): SienciParams | undefined {
  const l = officialRow(row, MATERIAL_GROUP[material], speed);
  if (!l || l[3] === null) return undefined;
  return { feed: l[0], plunge: l[1], stepover: l[2], slotStepdown: l[3], pocketStepdown: l[4], rpm: l[5] };
}
