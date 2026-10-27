/**
 * Routers e spindles usados nas máquinas Sienci Labs.
 * Fontes: páginas de produto em sienci.com e resources.sienci.com (consultadas em out/2026).
 */

export const INCH = 25.4;
export const SHANK_1_8 = 3.175;
export const SHANK_1_4 = 6.35;
export const SHANK_3_8 = 9.525;
export const SHANK_1_2 = 12.7;

export type HeadId = "makita-rt0701" | "autospin-t1" | "spindle-1-5kw-er20" | "spindle-2-2kw-er20";

export interface Accessory {
  name: string;
  url: string;
}

export interface Head {
  id: HeadId;
  name: string;
  type: "router" | "spindle";
  rpmMin: number;
  rpmMax: number;
  /** "gcode": a rotação vem do G-code (S). "manual": o usuário gira o dial. */
  rpmControl: "gcode" | "manual";
  /** Posições do dial de velocidade (para mostrar "gire o dial para 3"). */
  dial?: { position: number; rpm: number }[];
  /** Hastes (mm) que cabem sem comprar nada. */
  shanks: number[];
  /** Hastes que precisam de uma pinça ou adaptador vendido à parte. */
  shanksWithAccessory: { shank: number; accessory: Accessory }[];
  url: string;
}

export const HEADS: Record<HeadId, Head> = {
  "makita-rt0701": {
    id: "makita-rt0701",
    name: "Makita RT0701",
    type: "router",
    rpmMin: 10000,
    rpmMax: 30000,
    rpmControl: "manual",
    dial: [
      { position: 1, rpm: 10000 },
      { position: 2, rpm: 12000 },
      { position: 3, rpm: 17000 },
      { position: 4, rpm: 22000 },
      { position: 5, rpm: 27000 },
      { position: 6, rpm: 30000 },
    ],
    shanks: [SHANK_1_4],
    shanksWithAccessory: [
      {
        shank: SHANK_1_8,
        accessory: { name: "Pinça de precisão 1/8″ para Makita RT0701 (ou adaptador 1/4″→1/8″)", url: "https://sienci.com/product-category/routers-spindles/" },
      },
    ],
    url: "https://sienci.com/product/makita-rt0701c-1-25-hp-110v-compact-router/",
  },
  "autospin-t1": {
    id: "autospin-t1",
    name: "AutoSpin T1",
    type: "router",
    rpmMin: 10000,
    rpmMax: 30000,
    // Em "Spindle Mode" liga, desliga e ajusta a rotação pelo G-code.
    rpmControl: "gcode",
    dial: [
      { position: 1, rpm: 10000 },
      { position: 2, rpm: 15000 },
      { position: 3, rpm: 20000 },
      { position: 4, rpm: 25000 },
      { position: 5, rpm: 30000 },
    ],
    // Vem com pinças ER11 de 1/8″ e 1/4″.
    shanks: [SHANK_1_8, SHANK_1_4],
    shanksWithAccessory: [],
    url: "https://sienci.com/product/autospin-t1-router/",
  },
  "spindle-1-5kw-er20": {
    id: "spindle-1-5kw-er20",
    name: "Spindle 1,5 kW ER20 (kit Sienci)",
    type: "spindle",
    rpmMin: 7500,
    rpmMax: 24000,
    rpmControl: "gcode",
    // O kit vem com pinças ER20 de 1/8″, 1/4″, 3/8″ e 1/2″.
    shanks: [SHANK_1_8, SHANK_1_4, SHANK_3_8, SHANK_1_2],
    shanksWithAccessory: [],
    url: "https://sienci.com/product/altmill-1-5kw-er20-spindle-clear-cut-dust-shoe-kit/",
  },
  "spindle-2-2kw-er20": {
    id: "spindle-2-2kw-er20",
    name: "Spindle 2,2 kW ER20 (kit AltMill)",
    type: "spindle",
    rpmMin: 7500,
    rpmMax: 24000,
    rpmControl: "gcode",
    shanks: [SHANK_1_8, SHANK_1_4, SHANK_3_8, SHANK_1_2],
    shanksWithAccessory: [],
    url: "https://sienci.com/product/altmill-2-2kw-er20-spindle-clear-cut-dust-shoe-kit/",
  },
};

/** Posição do dial mais próxima da rotação pedida. */
export function nearestDial(head: Head, rpm: number): { position: number; rpm: number } | undefined {
  if (!head.dial) return undefined;
  return head.dial.reduce((best, d) => (Math.abs(d.rpm - rpm) < Math.abs(best.rpm - rpm) ? d : best));
}
