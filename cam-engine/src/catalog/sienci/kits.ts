import { VERIFIED_ON } from "./bits.js";
import type { SienciMachine } from "./machines.js";

/**
 * Bit sets sold by Sienci Labs (and the machine kits that include them).
 * Contents copied from the "This set includes…" list on each product page (checked 2026-11-03).
 * Non-bit items in a set (1/4″→1/8″ adapter, Makita collet) go in `accessories`.
 */
export type KitId =
  | "starter-end-mill-set"
  | "sign-maker-end-mill-set"
  | "3d-carver-end-mill-set"
  | "machinists-end-mill-set"
  | "altmill-starter-set"
  | "altmill-pro-set"
  | "altmill-sign-maker-set"
  | "altmill-chamfer-set";

export interface SienciKit {
  id: KitId;
  name: string;
  url: string;
  /** Machine family Sienci sells the set for (null = any). */
  family: SienciMachine["family"] | null;
  bits: { id: string; qty: number }[];
  accessories?: string[];
  /** Machine kits that come with this set. */
  includedIn?: { name: string; url: string }[];
  verifiedOn: string;
}

export const KITS: SienciKit[] = [
  {
    id: "starter-end-mill-set",
    name: "Starter End Mill Set",
    url: "https://sienci.com/product/sems/",
    family: "LongMill",
    bits: [
      { id: "flat-1-4-upcut", qty: 1 },
      { id: "flat-1-8-upcut", qty: 3 },
      { id: "flat-1-8-1flute", qty: 2 },
      { id: "vbit-60-15mm", qty: 1 },
      { id: "surfacing-22mm", qty: 1 },
    ],
    accessories: ["1/4″ to 1/8″ Collet Adapter"],
    includedIn: [
      { name: "LongMill MK3 Beginner's Kit", url: "https://sienci.com/product/longmill-mk3-beginners-kit/" },
      { name: "LongMill MK2 Beginner's Kit", url: "https://sienci.com/2023/08/21/introducing-longmill-mk2-starter-kit/" },
    ],
    verifiedOn: VERIFIED_ON,
  },
  {
    id: "sign-maker-end-mill-set",
    name: "Sign Maker End Mill Set",
    url: "https://sienci.com/product/sign-making-bit-set/",
    family: "LongMill",
    bits: [
      { id: "vbit-90-15mm", qty: 1 },
      { id: "vbit-60-15mm", qty: 1 },
      { id: "flat-1-4-downcut", qty: 1 },
      { id: "flat-1-4-compression", qty: 1 },
      { id: "flat-1-8-compression", qty: 2 },
    ],
    verifiedOn: VERIFIED_ON,
  },
  {
    id: "3d-carver-end-mill-set",
    name: "3D Carver End Mill Set",
    url: "https://sienci.com/product/3d-carver-bit-set/",
    family: "LongMill",
    bits: [
      { id: "flat-1-4-upcut", qty: 1 },
      { id: "flat-1-8-upcut", qty: 3 },
      { id: "store-tapered-1-4-1-5", qty: 2 },
      { id: "tapered-1-8-r0-25", qty: 2 },
    ],
    verifiedOn: VERIFIED_ON,
  },
  {
    id: "machinists-end-mill-set",
    name: "Machinists End Mill Set",
    url: "https://sienci.com/product/machinists-end-mill-set/",
    family: "LongMill",
    bits: [
      { id: "flat-1-4-1flute", qty: 2 },
      { id: "flat-1-8-1flute", qty: 4 },
    ],
    accessories: ["1/8″ Makita RT0701 Precision Collet"],
    verifiedOn: VERIFIED_ON,
  },
  {
    id: "altmill-starter-set",
    name: "AltMill Starter Set",
    url: "https://sienci.com/product/altmill_starter_set/",
    family: "AltMill",
    bits: [
      { id: "roughing-3-8-1-1-4-dlc", qty: 1 },
      { id: "flat-1-8-downcut-dlc", qty: 1 },
      { id: "vbit-90-dlc", qty: 1 },
      { id: "ball-1-4-1-3-4-dlc", qty: 1 },
      { id: "store-surfacing-1-5", qty: 1 },
    ],
    verifiedOn: VERIFIED_ON,
  },
  {
    id: "altmill-pro-set",
    name: "AltMill Pro Set",
    url: "https://sienci.com/product/altmill_pro_set/",
    family: "AltMill",
    bits: [
      { id: "roughing-3-8-2-dlc", qty: 1 },
      { id: "roughing-3-8-1-1-4-dlc", qty: 1 },
      { id: "high-helix-1-4-2-dlc", qty: 1 },
      { id: "store-vbit-60-dlc", qty: 1 },
      { id: "vbit-90-3-8-dlc", qty: 1 },
      { id: "store-tapered-1-4-2-dlc", qty: 1 },
    ],
    verifiedOn: VERIFIED_ON,
  },
  {
    id: "altmill-sign-maker-set",
    name: "AltMill Sign Maker Set",
    url: "https://sienci.com/product/altmill_sign_maker/",
    family: "AltMill",
    bits: [
      { id: "store-compression-1-4-dlc", qty: 1 },
      { id: "high-helix-1-4-2-dlc", qty: 1 },
      { id: "flat-1-8-upcut-dlc", qty: 1 },
      { id: "flat-1-8-downcut-dlc", qty: 1 },
      { id: "vbit-90-dlc", qty: 1 },
      { id: "surfacing-1-5-inserted", qty: 1 },
    ],
    verifiedOn: VERIFIED_ON,
  },
  {
    id: "altmill-chamfer-set",
    name: "AltMill Chamfer Set",
    url: "https://sienci.com/product/altmill_chamfer_set/",
    family: "AltMill",
    bits: [
      { id: "vbit-30-dlc", qty: 1 },
      { id: "store-vbit-60-dlc", qty: 1 },
      { id: "vbit-90-dlc", qty: 1 },
      { id: "vbit-90-3-8-dlc", qty: 1 },
    ],
    verifiedOn: VERIFIED_ON,
  },
];

export const KIT_BY_ID = new Map(KITS.map((k) => [k.id, k]));

/** Sets the bit comes in. */
export function kitsForBit(bitId: string): SienciKit[] {
  return KITS.filter((k) => k.bits.some((x) => x.id === bitId));
}
