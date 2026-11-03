import type { ToolInput } from "../../schema.js";
import { HEADS, INCH, SHANK_1_4, SHANK_1_8, SHANK_3_8, type Accessory, type HeadId } from "./heads.js";
import type { MaterialGroup, TableRow } from "./table.js";

export type { TableRow } from "./table.js";

/**
 * Bits sold by Sienci Labs: every bit in their kits and sets (see `kits.ts`) plus the store bits
 * CarvCAM already had cards for. Measurements come from the "Measurements" table on each product
 * page at sienci.com (checked 2026-11-03). Prices and SKUs are left out: prices change, and the
 * pages show no SKU.
 */
export const VERIFIED_ON = "2026-11-03";

export interface SienciBit {
  id: string;
  /** Name exactly as in the store. */
  name: string;
  url: string;
  /** WebP photo at app/public/bits/<id>.webp (fetched by CI); without it, the UI draws the silhouette. */
  image: string;
  type: "straight" | "vbit" | "ball" | "tapered" | "groove" | "bowl" | "surfacing";
  cut: "upcut" | "downcut" | "compression" | "straight";
  /** Variation that changes how the bit is used (serrated roughing, high helix, corncob, inserts). */
  variant?: "roughing" | "high-helix" | "corncob" | "inserts";
  coating?: "DLC";
  /** Cutting diameter (mm). For tapered bits, the tip diameter. */
  diameter: number;
  shank: number;
  /** 0 when Sienci doesn't say (corncob). */
  flutes: number;
  /** Cutting length (mm). Missing when Sienci lists "n/a" (surfacing bits). For V-bits, the height of the V. */
  cutLength?: number;
  angle?: number;
  /** Compression bit: length of the upcut section (the first pass has to go past it). */
  compressionUpcut?: number;
  /**
   * Row of Sienci's official feeds and speeds table for this bit: the row for the same geometry
   * when `official`, or the reference row the estimate starts from (see feeds.ts).
   */
  tableRow: TableRow | null;
  /** Sienci's table lists this geometry (diameter, flutes and cut direction) for wood. */
  official: boolean;
  /** Materials Sienci advises against for this bit, with the reason. */
  notRecommended?: Partial<Record<MaterialGroup, string>>;
  /** Whether the sign and lettering engine (v1) knows how to use this bit. */
  supportedInV1: boolean;
  bestFor: string;
  /** Remark about the product page data (contradictions, computed values). */
  note?: string;
}

const NO_DOWNCUT_IN_ALUMINUM =
  "Sienci recommends single-flute upcut bits for aluminum: downcut and compression bits push the chips back into the cut.";
const NO_TAPERED_IN_ALUMINUM = "Sienci says to avoid tapered bits in aluminum (the thin tip deflects or breaks).";
const NO_1_16_IN_ALUMINUM = "Sienci's table has no 1/16″ bits for aluminum.";

type Def = Omit<SienciBit, "image">;
const bit = (d: Def): SienciBit => ({ ...d, image: `bits/${d.id}.webp` });

export const BITS: SienciBit[] = [
  // ------------------------------------------------------------------ flat end mills, 1/8″ shank
  bit({
    id: "flat-1-16-downcut",
    name: "1/16″ Flat Downcut End Mill – 1/8″ Shank-2F",
    url: "https://sienci.com/product/1-16-flat-downcut-end-mill/",
    type: "straight", cut: "downcut", diameter: 1.5875, shank: SHANK_1_8, flutes: 2, cutLength: 8,
    tableRow: "1/16-straight", official: true, supportedInV1: true,
    notRecommended: { aluminum: NO_1_16_IN_ALUMINUM },
    bestFor: "Fine details and small lettering, with a clean finish on the top face.",
  }),
  bit({
    id: "flat-1-16-upcut",
    name: "1/16″ Flat Upcut End Mill – 1/8″ Shank-2F",
    url: "https://sienci.com/product/1-16-flat-upcut-end-mill/",
    type: "straight", cut: "upcut", diameter: 1.5875, shank: SHANK_1_8, flutes: 2, cutLength: 8,
    tableRow: "1/16-straight", official: true, supportedInV1: true,
    notRecommended: { aluminum: NO_1_16_IN_ALUMINUM },
    bestFor: "Fine details; clears chips well.",
  }),
  bit({
    id: "flat-1-8-downcut",
    name: "1/8″ Flat Downcut End Mill – 1/8″ Shank-2F",
    url: "https://sienci.com/product/1-8-flat-downcut_end-mill_3-10pc_pack/",
    type: "straight", cut: "downcut", diameter: SHANK_1_8, shank: SHANK_1_8, flutes: 2, cutLength: 15,
    tableRow: "1/8-straight", official: true, supportedInV1: true,
    notRecommended: { aluminum: NO_DOWNCUT_IN_ALUMINUM },
    bestFor: "Relief and engraving in plywood and MDF without chipping the top face.",
  }),
  bit({
    id: "flat-1-8-upcut",
    name: "1/8″ Flat Upcut End Mill – 1/8″ Shank-2F",
    url: "https://sienci.com/product/1-8-flat-upcut-end-mill_3pcs_or10pcs/",
    type: "straight", cut: "upcut", diameter: SHANK_1_8, shank: SHANK_1_8, flutes: 2, cutLength: 17,
    tableRow: "1/8-straight", official: true, supportedInV1: true,
    bestFor: "The general-purpose bit: lettering, shapes and cutouts on small projects.",
  }),
  bit({
    id: "flat-1-8-1flute",
    name: "1/8″ Single Flute Upcut End Mill – 1/8″ Shank-1F",
    url: "https://sienci.com/product/1-8-singleflute_upcut_endmill_2pcs/",
    type: "straight", cut: "upcut", diameter: SHANK_1_8, shank: SHANK_1_8, flutes: 1, cutLength: 12,
    tableRow: "1/8-1flute", official: true, supportedInV1: true,
    bestFor: "Acrylic and other plastics (no melting) and aluminum.",
  }),
  bit({
    id: "flat-1-8-compression",
    name: "1/8″ Flat Compression End Mill – 1/8″ Shank-2F",
    url: "https://sienci.com/product/1-8_flat_compression_end-mill_2pcs/",
    type: "straight", cut: "compression", diameter: SHANK_1_8, shank: SHANK_1_8, flutes: 2, cutLength: 13, compressionUpcut: 3,
    tableRow: "1/8-straight", official: false, supportedInV1: true,
    notRecommended: { aluminum: NO_DOWNCUT_IN_ALUMINUM },
    bestFor: "Cutouts in plywood and pine with both faces clean. The first pass has to go deeper than 3 mm.",
    note: "Sienci's table doesn't list compression bits; we use the 1/8″ straight row (same diameter and flutes). 3 mm upcut section: https://sienci.com/2021/03/01/introducing-1-8-compression-bits-to-our-store/",
  }),
  // ------------------------------------------------------------------ flat end mills, 1/4″
  bit({
    id: "flat-1-4-upcut",
    name: "1/4″ Flat Upcut End Mill – 1/4″ Shank-2F",
    url: "https://sienci.com/product/1-4-flat-upcut-endmill/",
    type: "straight", cut: "upcut", diameter: SHANK_1_4, shank: SHANK_1_4, flutes: 2, cutLength: 25.4,
    tableRow: "1/4-straight", official: true, supportedInV1: true,
    bestFor: "Cutouts and large pockets; faster and sturdier than the 1/8″.",
  }),
  bit({
    id: "flat-1-4-downcut",
    name: "1/4″x1-1/4″ Flat Downcut End Mill – 1/4″ Shank-2F",
    url: "https://sienci.com/product/1-4-1-1-4_flat-downcut-end-mill/",
    type: "straight", cut: "downcut", diameter: SHANK_1_4, shank: SHANK_1_4, flutes: 2, cutLength: 25.4,
    tableRow: "1/4-straight", official: true, supportedInV1: true,
    notRecommended: { aluminum: NO_DOWNCUT_IN_ALUMINUM },
    bestFor: "Large pockets in plywood without chipping the top face.",
  }),
  bit({
    id: "flat-1-4-1flute",
    name: "1/4″ Single Flute Upcut End Mill – 1/4″ Shank-1F",
    url: "https://sienci.com/product/1-4-single-flute-end-mill/",
    type: "straight", cut: "upcut", diameter: SHANK_1_4, shank: SHANK_1_4, flutes: 1, cutLength: 19.05,
    tableRow: "1/4-1flute", official: true, supportedInV1: true,
    bestFor: "Plastics and aluminum on larger parts.",
  }),
  bit({
    id: "flat-1-4-compression",
    name: "1/4″ Flat Compression End Mill – 1/4″ Shank-2F",
    url: "https://sienci.com/product/1-4-flat-compression-end-mill/",
    type: "straight", cut: "compression", diameter: SHANK_1_4, shank: SHANK_1_4, flutes: 2, cutLength: 25, compressionUpcut: 4,
    tableRow: "1/4-straight", official: false, supportedInV1: true,
    notRecommended: { aluminum: NO_DOWNCUT_IN_ALUMINUM },
    bestFor: "Cutouts in plywood with both faces clean. The first pass has to go deeper than 4 mm.",
    note: "Sienci's table doesn't list compression bits; we use the 1/4″ straight row (same diameter and flutes).",
  }),
  // ------------------------------------------------------------------ V-bits
  bit({
    id: "vbit-30-1-8",
    name: "30 Degree Engraving V-Bit – 1/8″ Shank-1F",
    url: "https://sienci.com/product/30-degree_engraving_vbit_4-10pc_pack/",
    type: "vbit", cut: "straight", diameter: SHANK_1_8, shank: SHANK_1_8, flutes: 1, cutLength: 11, angle: 30,
    tableRow: "vbit", official: true, supportedInV1: true,
    bestFor: "Engraving fine text and outlines.",
  }),
  bit({
    id: "vbit-60-15mm",
    name: "15mm 60 Degree V-Bit – 1/4″ Shank-2F",
    url: "https://sienci.com/product/15mm_60-degree-v-bit/",
    type: "vbit", cut: "straight", diameter: 15, shank: SHANK_1_4, flutes: 2, cutLength: 17, angle: 60,
    tableRow: "vbit", official: true, supportedInV1: true,
    bestFor: "Signs and V-carving; comes in the Starter End Mill Set.",
  }),
  bit({
    id: "vbit-90-15mm",
    name: "15mm 90 Degree V-Bit – 1/4″ Shank-2F",
    url: "https://sienci.com/product/15mm_90-degree-1_4-v-bit/",
    type: "vbit", cut: "straight", diameter: 15, shank: SHANK_1_4, flutes: 2, cutLength: 12.7, angle: 90,
    tableRow: "vbit", official: true, supportedInV1: true,
    bestFor: "Wider V-carving and chamfers.",
  }),
  // ------------------------------------------------------------------ surfacing and 3D
  bit({
    id: "surfacing-22mm",
    name: "22mm Surfacing Bit – 1/4″ Shank-2F",
    url: "https://sienci.com/product/22mm-surfacing-bit/",
    type: "surfacing", cut: "straight", diameter: 22, shank: SHANK_1_4, flutes: 2, cutLength: 12,
    tableRow: "surfacing-22", official: true, supportedInV1: false,
    bestFor: "Surfacing the spoilboard with the Surfacing tool. Not for signs.",
  }),
  bit({
    id: "ball-1-4",
    name: "1/4″ Ball Nose Upcut End Mill – 1/4″ Shank-2F",
    url: "https://sienci.com/product/1-4-ballnose-upcut-end-mill/",
    type: "ball", cut: "upcut", diameter: SHANK_1_4, shank: SHANK_1_4, flutes: 2, cutLength: 25.4,
    tableRow: "1/4-ball", official: true, supportedInV1: false,
    bestFor: "3D reliefs and rounded carving (out of scope for v1).",
  }),

  // ================================================================== store and set bits
  bit({
    id: "store-ball-1-8",
    name: "1/8″ Ball Nose Upcut End Mill Pack – 1/8″ Shank-2F (3 or 10pcs)",
    url: "https://sienci.com/product/1-8-ballnose-upcut_endmill_3pc_or_10pc/",
    type: "ball", cut: "upcut", diameter: SHANK_1_8, shank: SHANK_1_8, flutes: 2, cutLength: 17,
    tableRow: "1/8-ball", official: true, supportedInV1: false,
    bestFor: "Small 3D reliefs, contours and maps.",
  }),
  bit({
    id: "store-tapered-1-4-1-5",
    name: "1/4″x1-1/2″xR1/32″ Tapered Ball Nose End Mill – 1/4″ Shank-2F",
    url: "https://sienci.com/product/1-4_1-1-2_r1-32-tapered-ballnose-endmill/",
    type: "tapered", cut: "upcut", diameter: 1.5875, shank: SHANK_1_4, flutes: 2, cutLength: 38.1,
    tableRow: "tapered-1-4", official: true, supportedInV1: false,
    notRecommended: { aluminum: NO_TAPERED_IN_ALUMINUM },
    bestFor: "Fine detail in 3D relief (rough with the Coarse row, finish with the Fine row).",
  }),
  bit({
    id: "store-tapered-1-4-2-dlc",
    name: "1/4″x2″xR1/32″ Tapered Ball Nose End Mill – 1/4″ Shank-2F-DLC",
    url: "https://sienci.com/product/1-4_2_r1-32_tapered_ballnose/",
    type: "tapered", cut: "upcut", coating: "DLC", diameter: 1.5875, shank: SHANK_1_4, flutes: 2, cutLength: 50.8,
    tableRow: "tapered-1-4", official: true, supportedInV1: false,
    notRecommended: { aluminum: NO_TAPERED_IN_ALUMINUM },
    bestFor: "Deep, detailed 3D relief; comes in the AltMill Pro Set.",
  }),
  bit({
    id: "store-ball-1-4-1-dlc",
    name: "1/4″x1″ Downcut Ball Nose End Mill – 1/4″ Shank-2F-DLC",
    url: "https://sienci.com/product/1-4_1_downcut_ballnose/",
    type: "ball", cut: "downcut", coating: "DLC", diameter: SHANK_1_4, shank: SHANK_1_4, flutes: 2, cutLength: 25.4,
    tableRow: "1/4-ball", official: false, supportedInV1: false,
    notRecommended: { aluminum: NO_DOWNCUT_IN_ALUMINUM },
    bestFor: "Smooth 3D surfaces with less sanding.",
  }),
  bit({
    id: "store-compression-1-4-dlc",
    name: "1/4″x1″ Extra Hard Compression Upcut End Mill w/ Chip Breaker – 1/4″ Shank-3F-DLC",
    url: "https://sienci.com/product/1-4_extra-hard-compression-upcut-with-chip-breaker/",
    type: "straight", cut: "compression", coating: "DLC", diameter: SHANK_1_4, shank: SHANK_1_4, flutes: 3, cutLength: 25.4,
    tableRow: "1/4-straight", official: false, supportedInV1: true,
    notRecommended: { aluminum: NO_DOWNCUT_IN_ALUMINUM },
    bestFor: "Clean cutouts in 3/4″ plywood and MDF; comes in the AltMill Sign Maker Set.",
    note: "Sienci doesn't give the length of the upcut section, so CarvCAM doesn't force a deeper first pass.",
  }),
  bit({
    id: "store-roughing-1-4",
    name: "1/4″ Extra Long Flat Roughing End Mill – 1/4″ Shank-3F",
    url: "https://sienci.com/product/1-4-extra-long-flat-roughing-endmill/",
    type: "straight", cut: "upcut", variant: "roughing", diameter: SHANK_1_4, shank: SHANK_1_4, flutes: 3, cutLength: 44.45,
    tableRow: "1/4-straight", official: false, supportedInV1: false,
    bestFor: "Fast stock removal in thick lumber (leaves a serrated wall).",
  }),
  bit({
    id: "store-corncob-1-16",
    name: "1/16″ (1.6mm) Corncob End Mill (10pcs)",
    url: "https://sienci.com/product/1-16_1-6mm_corncob_endmill_10pcs/",
    type: "straight", cut: "straight", variant: "corncob", diameter: 1.6, shank: SHANK_1_8, flutes: 0, cutLength: 8,
    tableRow: "1/16-corncob", official: true, supportedInV1: false,
    notRecommended: {
      plastic: "Sienci's table only lists the corncob for wood.",
      aluminum: "Sienci gives a corncob in aluminum as an example of a combination they don't recommend.",
    },
    bestFor: "Composites, circuit boards and fine detail in wood.",
  }),
  bit({
    id: "store-vbit-60-dlc",
    name: "1/4″ 60 Degree Downcut V-Bit – 1/4″ Shank-3F-DLC",
    url: "https://sienci.com/product/1-4_60_degree_downcut_vbit/",
    type: "vbit", cut: "downcut", coating: "DLC", diameter: SHANK_1_4, shank: SHANK_1_4, flutes: 3, cutLength: 5.5, angle: 60,
    tableRow: "vbit", official: true, supportedInV1: true,
    bestFor: "V-grooves, chamfers and signs with crisp edges (cuts through Oramask); comes in the AltMill Pro and Chamfer Sets.",
    note: "Sienci lists the cutting length as n/a; we use the height of the V (3.175 / tan 30°).",
  }),
  bit({
    id: "store-groove-1-2",
    name: "1/2″x1-1/4″ Round Groove Bit – 1/4″ Shank-2F",
    url: "https://sienci.com/product/1-2_1-1-4_round_groove_bit/",
    type: "groove", cut: "straight", diameter: 12.7, shank: SHANK_1_4, flutes: 2, cutLength: 12.7,
    tableRow: "groove-1-2", official: true, supportedInV1: false,
    bestFor: "Rounded grooves, trays and recesses.",
  }),
  bit({
    id: "store-groove-3-4",
    name: "3/4″x1-1/4″ Round Groove Bit – 1/4″ Shank-2F",
    url: "https://sienci.com/product/3-4_1-1-4_round-groove-bit/",
    type: "groove", cut: "straight", diameter: 19.05, shank: SHANK_1_4, flutes: 2, cutLength: 19.05,
    tableRow: "groove-3-4", official: true, supportedInV1: false,
    bestFor: "Wide rounded channels and trays.",
  }),
  bit({
    id: "store-bowl-1",
    name: "1″x3/4″xR3/8″ Flat Bottom Bowl Bit – 1/4″ Shank-2F",
    url: "https://sienci.com/product/1_3-4_r3-8_flat_bottom_bowl_bit/",
    type: "bowl", cut: "straight", diameter: 25.4, shank: SHANK_1_4, flutes: 2, cutLength: 19.05,
    tableRow: "groove-1", official: false, supportedInV1: false,
    bestFor: "Bowls and trays with flat floors.",
  }),
  bit({
    id: "store-surfacing-1-5",
    name: "1-1/2″ Surfacing Bit – 1/4″ Shank-4F",
    url: "https://sienci.com/product/1-1-2_surfacing_bit/",
    type: "surfacing", cut: "straight", diameter: 1.5 * INCH, shank: SHANK_1_4, flutes: 4,
    tableRow: "surfacing-22", official: false, supportedInV1: false,
    bestFor: "Flattens spoilboards and wide boards faster; comes in the AltMill Starter Set.",
  }),

  // ------------------------------------------------------------------ AltMill sets (DLC) and 3D Carver set
  bit({
    id: "roughing-3-8-1-1-4-dlc",
    name: "3/8″x1-1/4″ Roughing Upcut End Mill – 3/8″ Shank-3F-DLC",
    url: "https://sienci.com/product/3-8_1-1-4_roughing-upcut-endmill/",
    type: "straight", cut: "upcut", variant: "roughing", coating: "DLC", diameter: SHANK_3_8, shank: SHANK_3_8, flutes: 3, cutLength: 1.25 * INCH,
    tableRow: "1/4-straight", official: false, supportedInV1: false,
    bestFor: "Fast roughing in hardwood, plywood, MDF and aluminum; leaves a serrated wall.",
  }),
  bit({
    id: "roughing-3-8-2-dlc",
    name: "3/8″x2″ Roughing Upcut End Mill – 3/8″ Shank-3F-DLC",
    url: "https://sienci.com/product/3-8_2_roughing-upcut-end-mill/",
    type: "straight", cut: "upcut", variant: "roughing", coating: "DLC", diameter: SHANK_3_8, shank: SHANK_3_8, flutes: 3, cutLength: 2 * INCH,
    tableRow: "1/4-straight", official: false, supportedInV1: false,
    notRecommended: { aluminum: "Sienci lists this bit for hardwood, plywood and MDF (not aluminum)." },
    bestFor: "Deep roughing in thick lumber.",
  }),
  bit({
    id: "high-helix-1-4-2-dlc",
    name: "1/4″x2″ High Helix Upcut End Mill – 1/4″ Shank-2F-DLC",
    url: "https://sienci.com/product/1-4_2_high_helix_upcut_end_mill/",
    type: "straight", cut: "upcut", variant: "high-helix", coating: "DLC", diameter: SHANK_1_4, shank: SHANK_1_4, flutes: 2, cutLength: 2 * INCH,
    tableRow: "1/4-straight", official: false, supportedInV1: true,
    bestFor: "Profiles and cutouts with a very clean wall finish (45° helix).",
  }),
  bit({
    id: "flat-1-8-downcut-dlc",
    name: "1/8″x3/4″ Downcut End Mill – 1/4″ Shank-1F-DLC",
    url: "https://sienci.com/product/1-8_3-3_downcut_end_mill/",
    type: "straight", cut: "downcut", coating: "DLC", diameter: SHANK_1_8, shank: SHANK_1_4, flutes: 1, cutLength: 0.75 * INCH,
    tableRow: "1/8-1flute", official: false, supportedInV1: true,
    notRecommended: { aluminum: NO_DOWNCUT_IN_ALUMINUM },
    bestFor: "Pockets, joinery and inlays in plywood without chipping; 1/4″ shank (no extra collet).",
  }),
  bit({
    id: "flat-1-8-upcut-dlc",
    name: "1/8″x1/2″ Upcut End Mill – 1/4″ Shank-1F-DLC",
    url: "https://sienci.com/product/1-8_1-2_upcut_end_mill/",
    type: "straight", cut: "upcut", coating: "DLC", diameter: SHANK_1_8, shank: SHANK_1_4, flutes: 1, cutLength: 0.5 * INCH,
    tableRow: "1/8-1flute", official: true, supportedInV1: true,
    bestFor: "Plastics and soft metals; small cutouts and holes. 1/4″ shank.",
  }),
  bit({
    id: "vbit-30-dlc",
    name: "1/4″ 30 Degree Downcut V-Bit – 1/4″ Shank-3F-DLC",
    url: "https://sienci.com/product/1-4_30_degree_downcut_vbit/",
    type: "vbit", cut: "downcut", coating: "DLC", diameter: SHANK_1_4, shank: SHANK_1_4, flutes: 3, cutLength: 11.85, angle: 30,
    tableRow: "vbit", official: true, supportedInV1: true,
    bestFor: "Fine engraving and small lettering, even through Oramask.",
    note: "Sienci lists the cutting length as n/a; we use the height of the V (3.175 / tan 15°).",
  }),
  bit({
    id: "vbit-90-dlc",
    name: "1/4″ 90 Degree Downcut V-Bit – 1/4″ Shank-3F-DLC",
    url: "https://sienci.com/product/1-4_90_degree_vbit/",
    type: "vbit", cut: "downcut", coating: "DLC", diameter: SHANK_1_4, shank: SHANK_1_4, flutes: 3, cutLength: 3.18, angle: 90,
    tableRow: "vbit", official: true, supportedInV1: true,
    bestFor: "Chamfers and V-grooves; comes in the AltMill Starter, Sign Maker and Chamfer Sets.",
    note: "Sienci lists the cutting length as n/a; we use the height of the V (3.175 / tan 45°).",
  }),
  bit({
    id: "vbit-90-3-8-dlc",
    name: "3/8″ 90 Degree Downcut V-Bit – 1/4″ Shank-3F-DLC",
    url: "https://sienci.com/product/3-8_90_degree_vbit/",
    type: "vbit", cut: "downcut", coating: "DLC", diameter: SHANK_3_8, shank: SHANK_1_4, flutes: 3, cutLength: 4.76, angle: 90,
    tableRow: "vbit", official: true, supportedInV1: true,
    bestFor: "Signs with a wider V and bigger chamfers.",
    note: "Sienci lists the cutting length as n/a; we use the height of the V (4.76 / tan 45°).",
  }),
  bit({
    id: "ball-1-4-1-3-4-dlc",
    name: "1/4″x1-3/4″ Downcut Ball Nose End Mill – 1/4″ Shank-2F-DLC",
    url: "https://sienci.com/product/1-4_1-3-4_downcut_ballnose/",
    type: "ball", cut: "downcut", coating: "DLC", diameter: SHANK_1_4, shank: SHANK_1_4, flutes: 2, cutLength: 1.75 * INCH,
    tableRow: "1/4-ball", official: false, supportedInV1: false,
    notRecommended: { aluminum: NO_DOWNCUT_IN_ALUMINUM },
    bestFor: "Curved surfaces and 3D relief; comes in the AltMill Starter Set.",
    note: "The page says \"Number of Flutes: 1\" in the text but 2 in the measurements table and the name; we use 2.",
  }),
  bit({
    id: "tapered-1-8-r0-25",
    name: "1/8″xR0.25mm Tapered Ball Nose End Mill – 1/8″ Shank-2F (2pcs)",
    url: "https://sienci.com/product/1-8_r0-25_tapered_ballnose_endmill_2pcs/",
    type: "tapered", cut: "upcut", diameter: 0.5, shank: SHANK_1_8, flutes: 2, cutLength: 15,
    tableRow: "tapered-1-8", official: true, supportedInV1: false,
    notRecommended: { aluminum: NO_TAPERED_IN_ALUMINUM },
    bestFor: "Extreme detail in 3D relief; comes in the 3D Carver End Mill Set.",
    note: "The product page currently shows the wrong title (\"1/8″ Single Flute Upcut…\"), but its description and measurements are the tapered bit's.",
  }),
  bit({
    id: "surfacing-1-5-inserted",
    name: "1-1/2″ Inserted Heavy Duty Spoilboard Surfacing Bit – 3/8″ Shank-3F",
    url: "https://sienci.com/product/1-1-2_inserted_heavy_duty_spoilboard_surfacing/",
    type: "surfacing", cut: "straight", variant: "inserts", diameter: 1.5 * INCH, shank: SHANK_3_8, flutes: 3, cutLength: 0.5 * INCH,
    tableRow: "surfacing-22", official: false, supportedInV1: false,
    bestFor: "Flattening spoilboards and glued-up panels; replaceable carbide inserts. Comes in the AltMill Sign Maker Set.",
    note: "The page gives a flute length of 2″ in the text and 1/2″ in the measurements table; we use 1/2″.",
  }),
];

export const BIT_BY_ID = new Map(BITS.map((f) => [f.id, f]));

/** Bits included in the Starter End Mill Set (part of the Beginner's Kit). See `kits.ts`. */
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
    flutes: bit.flutes || undefined,
    cutLength: bit.cutLength,
  };
}

function fmtInch(mm: number) {
  const map: Record<string, string> = { "3.175": "1/8″", "6.35": "1/4″", "9.525": "3/8″", "12.7": "1/2″" };
  return map[String(mm)] ?? `${mm} mm`;
}
