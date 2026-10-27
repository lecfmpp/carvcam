import type { ToolInput } from "../../schema.js";
import { HEADS, SHANK_1_4, SHANK_1_8, type Accessory, type HeadId } from "./heads.js";

/**
 * Bits sold by Sienci Labs, with the measurements from the tables on their product pages
 * (checked Oct 2026). Prices are left out because they change; the UI looks them up in the store.
 */
export type TableRow = "1/16-straight" | "1/8-straight" | "1/8-1flute" | "1/4-straight" | "1/4-1flute" | "vbit" | "surfacing-22";

export interface SienciBit {
  id: string;
  name: string;
  url: string;
  type: "straight" | "vbit" | "ball" | "surfacing";
  cut: "upcut" | "downcut" | "compression" | "straight";
  diameter: number;
  shank: number;
  flutes: number;
  cutLength: number;
  angle?: number;
  /** Compression bit: length of the upcut section (the first pass has to go past it). */
  compressionUpcut?: number;
  /** Row of Sienci's official feeds and speeds table used for this bit. */
  tableRow: TableRow | null;
  /** Whether the sign and lettering engine (v1) knows how to use this bit. */
  supportedInV1: boolean;
  bestFor: string;
}

export const BITS: SienciBit[] = [
  {
    id: "flat-1-16-downcut",
    name: "1/16″ Flat Downcut End Mill – 1/8″ Shank-2F",
    url: "https://sienci.com/product/1-16-flat-downcut-end-mill/",
    type: "straight", cut: "downcut", diameter: 1.5875, shank: SHANK_1_8, flutes: 2, cutLength: 8,
    tableRow: "1/16-straight", supportedInV1: true,
    bestFor: "Fine details and small lettering, with a clean finish on the top face.",
  },
  {
    id: "flat-1-16-upcut",
    name: "1/16″ Flat Upcut End Mill – 1/8″ Shank-2F",
    url: "https://sienci.com/product/1-16-flat-upcut-end-mill/",
    type: "straight", cut: "upcut", diameter: 1.5875, shank: SHANK_1_8, flutes: 2, cutLength: 8,
    tableRow: "1/16-straight", supportedInV1: true,
    bestFor: "Fine details; clears chips well.",
  },
  {
    id: "flat-1-8-downcut",
    name: "1/8″ Flat Downcut End Mill – 1/8″ Shank-2F",
    url: "https://sienci.com/product/1-8-flat-downcut_end-mill_3-10pc_pack/",
    type: "straight", cut: "downcut", diameter: SHANK_1_8, shank: SHANK_1_8, flutes: 2, cutLength: 15,
    tableRow: "1/8-straight", supportedInV1: true,
    bestFor: "Relief and engraving in plywood and MDF without chipping the top face.",
  },
  {
    id: "flat-1-8-upcut",
    name: "1/8″ Flat Upcut End Mill – 1/8″ Shank-2F",
    url: "https://sienci.com/product/1-8-flat-upcut-end-mill_3pcs_or10pcs/",
    type: "straight", cut: "upcut", diameter: SHANK_1_8, shank: SHANK_1_8, flutes: 2, cutLength: 17,
    tableRow: "1/8-straight", supportedInV1: true,
    bestFor: "The general-purpose bit: lettering, shapes and cutouts on small projects.",
  },
  {
    id: "flat-1-8-1flute",
    name: "1/8″ Single Flute Upcut End Mill – 1/8″ Shank-1F",
    url: "https://sienci.com/product/1-8-singleflute_upcut_endmill_2pcs/",
    type: "straight", cut: "upcut", diameter: SHANK_1_8, shank: SHANK_1_8, flutes: 1, cutLength: 12,
    tableRow: "1/8-1flute", supportedInV1: true,
    bestFor: "Acrylic and other plastics (no melting) and aluminum.",
  },
  {
    id: "flat-1-8-compression",
    name: "1/8″ Flat Compression End Mill – 1/8″ Shank-2F",
    url: "https://sienci.com/product/1-8_flat_compression_end-mill_2pcs/",
    type: "straight", cut: "compression", diameter: SHANK_1_8, shank: SHANK_1_8, flutes: 2, cutLength: 13, compressionUpcut: 3,
    tableRow: "1/8-straight", supportedInV1: true,
    bestFor: "Cutouts in plywood and pine with both faces clean. The first pass has to go deeper than 3 mm.",
  },
  {
    id: "flat-1-4-upcut",
    name: "1/4″ Flat Upcut End Mill – 1/4″ Shank-2F",
    url: "https://sienci.com/product/1-4-flat-upcut-endmill/",
    type: "straight", cut: "upcut", diameter: SHANK_1_4, shank: SHANK_1_4, flutes: 2, cutLength: 25.4,
    tableRow: "1/4-straight", supportedInV1: true,
    bestFor: "Cutouts and large pockets; faster and sturdier than the 1/8″.",
  },
  {
    id: "flat-1-4-downcut",
    name: "1/4″x1-1/4″ Flat Downcut End Mill – 1/4″ Shank-2F",
    url: "https://sienci.com/product/1-4-1-1-4_flat-downcut-end-mill/",
    type: "straight", cut: "downcut", diameter: SHANK_1_4, shank: SHANK_1_4, flutes: 2, cutLength: 25.4,
    tableRow: "1/4-straight", supportedInV1: true,
    bestFor: "Large pockets in plywood without chipping the top face.",
  },
  {
    id: "flat-1-4-1flute",
    name: "1/4″ Single Flute Upcut End Mill – 1/4″ Shank-1F",
    url: "https://sienci.com/product/1-4-single-flute-end-mill/",
    type: "straight", cut: "upcut", diameter: SHANK_1_4, shank: SHANK_1_4, flutes: 1, cutLength: 19.05,
    tableRow: "1/4-1flute", supportedInV1: true,
    bestFor: "Plastics and aluminum on larger parts.",
  },
  {
    id: "flat-1-4-compression",
    name: "1/4″ Flat Compression End Mill – 1/4″ Shank-2F",
    url: "https://sienci.com/product/1-4-flat-compression-end-mill/",
    type: "straight", cut: "compression", diameter: SHANK_1_4, shank: SHANK_1_4, flutes: 2, cutLength: 25, compressionUpcut: 4,
    tableRow: "1/4-straight", supportedInV1: true,
    bestFor: "Cutouts in plywood with both faces clean. The first pass has to go deeper than 4 mm.",
  },
  {
    id: "vbit-30-1-8",
    name: "30 Degree Engraving V-Bit – 1/8″ Shank-1F",
    url: "https://sienci.com/product/30-degree_engraving_vbit_4-10pc_pack/",
    type: "vbit", cut: "straight", diameter: SHANK_1_8, shank: SHANK_1_8, flutes: 1, cutLength: 11, angle: 30,
    tableRow: "vbit", supportedInV1: true,
    bestFor: "Engraving fine text and outlines.",
  },
  {
    id: "vbit-60-15mm",
    name: "15mm 60 Degree V-Bit – 1/4″ Shank-2F",
    url: "https://sienci.com/product/15mm_60-degree-v-bit/",
    type: "vbit", cut: "straight", diameter: 15, shank: SHANK_1_4, flutes: 2, cutLength: 17, angle: 60,
    tableRow: "vbit", supportedInV1: true,
    bestFor: "Signs and V-carving; comes in the Starter End Mill Set.",
  },
  {
    id: "vbit-90-15mm",
    name: "15mm 90 Degree V-Bit – 1/4″ Shank-2F",
    url: "https://sienci.com/product/15mm_90-degree-1_4-v-bit/",
    type: "vbit", cut: "straight", diameter: 15, shank: SHANK_1_4, flutes: 2, cutLength: 12.7, angle: 90,
    tableRow: "vbit", supportedInV1: true,
    bestFor: "Wider V-carving and chamfers.",
  },
  {
    id: "surfacing-22mm",
    name: "22mm Surfacing Bit – 1/4″ Shank-2F",
    url: "https://sienci.com/product/22mm-surfacing-bit/",
    type: "surfacing", cut: "straight", diameter: 22, shank: SHANK_1_4, flutes: 2, cutLength: 12,
    tableRow: "surfacing-22", supportedInV1: false,
    bestFor: "Surfacing the spoilboard with the Surfacing tool. Not for signs.",
  },
  {
    id: "ball-1-4",
    name: "1/4″ Ball Nose Upcut End Mill – 1/4″ Shank-2F",
    url: "https://sienci.com/product/1-4-ballnose-upcut-end-mill/",
    type: "ball", cut: "upcut", diameter: SHANK_1_4, shank: SHANK_1_4, flutes: 2, cutLength: 25.4,
    tableRow: null, supportedInV1: false,
    bestFor: "3D reliefs and rounded carving (out of scope for v1).",
  },
];

export const BIT_BY_ID = new Map(BITS.map((f) => [f.id, f]));

/** Bits included in the Starter End Mill Set (part of the Beginner's Kit). */
export const STARTER_SET = ["flat-1-4-upcut", "flat-1-8-upcut", "flat-1-8-1flute", "vbit-60-15mm", "surfacing-22mm"];

export type Compatibility =
  | { status: "compatible" }
  | { status: "with-accessory"; accessory: Accessory }
  | { status: "incompatible"; reason: string };

/** Whether the bit fits the router/spindle, and whether a collet or adapter must be bought. */
export function compatibility(bit: SienciBit, headId: HeadId): Compatibility {
  const head = HEADS[headId];
  if (head.shanks.some((h) => Math.abs(h - bit.shank) < 0.01)) return { status: "compatible" };
  const ac = head.shanksWithAccessory.find((h) => Math.abs(h.shank - bit.shank) < 0.01);
  if (ac) return { status: "with-accessory", accessory: ac.accessory };
  return { status: "incompatible", reason: `The ${head.name} cannot hold ${fmtInch(bit.shank)} shanks.` };
}

/** Converts to the CAM engine's tool format. */
export function toTool(bit: SienciBit, toolNumber: number): ToolInput {
  return {
    id: toolNumber,
    name: bit.name,
    type: bit.type === "vbit" ? "vbit" : "straight",
    diameter: bit.diameter,
    angle: bit.angle,
    flutes: bit.flutes,
    cutLength: bit.cutLength,
  };
}

function fmtInch(mm: number) {
  const map: Record<string, string> = { "3.175": "1/8″", "6.35": "1/4″", "9.525": "3/8″", "12.7": "1/2″" };
  return map[String(mm)] ?? `${mm} mm`;
}
