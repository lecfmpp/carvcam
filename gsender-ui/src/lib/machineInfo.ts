import type { MachineId } from "./catalog";
import products from "./sienciProducts.json";

/**
 * Ficha de cada máquina para os cards (texto da interface em inglês). Números das páginas de
 * produto da Sienci Labs (out/2026); a geometria que o motor usa para checar se o projeto cabe
 * continua no catálogo do motor (cam-engine/src/catalog/sienci/machines.ts).
 */
export interface MachineInfo {
  id: MachineId;
  /** Linha do produto como a Sienci escreve ("AltMill MK2"). */
  model: string;
  size: string;
  status: "current" | "discontinued";
  tagline: string;
  /** Área de trabalho X × Y em polegadas (como a Sienci divulga). */
  workIn: [number, number];
  /** Altura útil em Z, em polegadas. */
  zIn: number;
  zLabel: string;
  speed: string;
  drive: string;
  motors: string;
  mount: string;
  controller: string;
  footprint?: string;
  extra?: [string, string];
  url: string;
  image: string;
}

const P = Object.fromEntries(products.machines.map((m) => [m.id, m])) as Record<string, { url: string; image: string }>;

const MK3 = {
  model: "LongMill MK3",
  status: "current" as const,
  zIn: 4.6,
  zLabel: "Z clearance",
  speed: "275 in/min",
  drive: "Lead screws · 15 mm linear rails",
  motors: "Closed-loop NEMA 23",
  mount: "65 mm router or 80 mm spindle",
  controller: "SLB-LITE · grblHAL",
};
const ALT_MK2 = {
  model: "AltMill MK2",
  status: "current" as const,
  zIn: 5.5,
  zLabel: "Max Z height",
  speed: "600 in/min",
  drive: "Ball screws · HGR15 linear rails",
  motors: "Closed-loop, all axes",
  mount: "80 mm spindle",
  controller: "SLB-EXT · grblHAL",
};
const MK2 = {
  model: "LongMill MK2",
  status: "discontinued" as const,
  zIn: 4.7,
  zLabel: "Z travel",
  speed: "157 in/min",
  drive: "Lead screws on all axes",
  motors: "NEMA 23 steppers",
  mount: "65 mm router",
  controller: "LongBoard or SuperLongBoard",
};

const base = (id: MachineId) => ({ id, url: P[id].url, image: P[id].image });

export const MACHINE_INFO: Record<MachineId, MachineInfo> = {
  "altmill-2x4": { ...base("altmill-2x4"), ...ALT_MK2, size: "2×4", tagline: "Production speed and rigidity in a 2 × 4 ft footprint.", workIn: [49, 25], footprint: "59 × 38 in" },
  "altmill-4x4": { ...base("altmill-4x4"), ...ALT_MK2, size: "4×4", tagline: "The go-to when time, precision and repeatability matter.", workIn: [49, 49], footprint: "59 × 62 in" },
  "altmill-4x8": {
    ...base("altmill-4x8"),
    ...ALT_MK2,
    model: "AltMill",
    size: "4×8",
    tagline: "Full 4 × 8 ft sheets for large-format production.",
    workIn: [49.8, 104],
    zIn: 8.3,
    speed: "1,000 in/min (Y)",
    drive: "Rack and pinion (Y) · ball screws (X, Z)",
    footprint: "66 × 114 in",
    extra: ["Repeatability", "±0.05 mm"],
  },
  "longmill-mk3-30x30": { ...base("longmill-mk3-30x30"), ...MK3, size: "30×30", tagline: "Pre-assembled benchtop CNC, carving in about two hours.", workIn: [32, 32], footprint: "40 × 45 in" },
  "longmill-mk3-48x30": { ...base("longmill-mk3-48x30"), ...MK3, size: "48×30", tagline: "The same easy MK3, with room for longer signs and boards.", workIn: [49, 32], footprint: "60 × 45 in" },
  "longmill-mk2-12x30": { ...base("longmill-mk2-12x30"), ...MK2, size: "12×30", tagline: "Compact earlier-generation benchtop. Fully supported.", workIn: [31.9, 14] },
  "longmill-mk2-30x30": { ...base("longmill-mk2-30x30"), ...MK2, size: "30×30", tagline: "Earlier-generation benchtop. Fully supported.", workIn: [31.9, 33.7] },
  "longmill-mk2-48x30": { ...base("longmill-mk2-48x30"), ...MK2, size: "48×30", tagline: "Earlier-generation benchtop, extended. Fully supported.", workIn: [50, 33.7] },
};

export const machineInfo = (id: MachineId) => MACHINE_INFO[id];

/** Grupos na ordem em que aparecem no onboarding. */
export const MACHINE_GROUPS: { title: string; note: string; ids: MachineId[]; collapsed?: boolean }[] = [
  { title: "AltMill", note: "Prosumer and production. Spindle, ball screws, closed loop on every axis.", ids: ["altmill-2x4", "altmill-4x4", "altmill-4x8"] },
  { title: "LongMill MK3", note: "Benchtop and beginner friendly. Pre-assembled, automatic speed with the AutoSpin.", ids: ["longmill-mk3-30x30", "longmill-mk3-48x30"] },
  { title: "LongMill MK2", note: "No longer sold. Pick it if you already own one.", ids: ["longmill-mk2-12x30", "longmill-mk2-30x30", "longmill-mk2-48x30"], collapsed: true },
];

export const inToMm = (v: number) => Math.round(v * 25.4);
export const fmtIn = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
