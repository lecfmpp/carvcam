/**
 * Routers e spindles usados nas máquinas Sienci Labs.
 * Fontes: páginas de produto em sienci.com e resources.sienci.com (consultadas em out/2026).
 */

export const POL = 25.4;
export const HASTE_1_8 = 3.175;
export const HASTE_1_4 = 6.35;
export const HASTE_3_8 = 9.525;
export const HASTE_1_2 = 12.7;

export type CabecoteId = "makita-rt0701" | "autospin-t1" | "spindle-1-5kw-er20" | "spindle-2-2kw-er20";

export interface Acessorio {
  nome: string;
  url: string;
}

export interface Cabecote {
  id: CabecoteId;
  nome: string;
  tipo: "router" | "spindle";
  rpmMin: number;
  rpmMax: number;
  /** "gcode": a rotação vem do G-code (S). "manual": o usuário gira o dial. */
  controleRpm: "gcode" | "manual";
  /** Posições do dial de velocidade (para mostrar "gire o dial para 3"). */
  dial?: { posicao: number; rpm: number }[];
  /** Hastes (mm) que cabem sem comprar nada. */
  hastes: number[];
  /** Hastes que precisam de uma pinça ou adaptador vendido à parte. */
  hastesComAcessorio: { haste: number; acessorio: Acessorio }[];
  url: string;
}

export const CABECOTES: Record<CabecoteId, Cabecote> = {
  "makita-rt0701": {
    id: "makita-rt0701",
    nome: "Makita RT0701",
    tipo: "router",
    rpmMin: 10000,
    rpmMax: 30000,
    controleRpm: "manual",
    dial: [
      { posicao: 1, rpm: 10000 },
      { posicao: 2, rpm: 12000 },
      { posicao: 3, rpm: 17000 },
      { posicao: 4, rpm: 22000 },
      { posicao: 5, rpm: 27000 },
      { posicao: 6, rpm: 30000 },
    ],
    hastes: [HASTE_1_4],
    hastesComAcessorio: [
      {
        haste: HASTE_1_8,
        acessorio: { nome: "Pinça de precisão 1/8″ para Makita RT0701 (ou adaptador 1/4″→1/8″)", url: "https://sienci.com/product-category/routers-spindles/" },
      },
    ],
    url: "https://sienci.com/product/makita-rt0701c-1-25-hp-110v-compact-router/",
  },
  "autospin-t1": {
    id: "autospin-t1",
    nome: "AutoSpin T1",
    tipo: "router",
    rpmMin: 10000,
    rpmMax: 30000,
    // Em "Spindle Mode" liga, desliga e ajusta a rotação pelo G-code.
    controleRpm: "gcode",
    dial: [
      { posicao: 1, rpm: 10000 },
      { posicao: 2, rpm: 15000 },
      { posicao: 3, rpm: 20000 },
      { posicao: 4, rpm: 25000 },
      { posicao: 5, rpm: 30000 },
    ],
    // Vem com pinças ER11 de 1/8″ e 1/4″.
    hastes: [HASTE_1_8, HASTE_1_4],
    hastesComAcessorio: [],
    url: "https://sienci.com/product/autospin-t1-router/",
  },
  "spindle-1-5kw-er20": {
    id: "spindle-1-5kw-er20",
    nome: "Spindle 1,5 kW ER20 (kit Sienci)",
    tipo: "spindle",
    rpmMin: 7500,
    rpmMax: 24000,
    controleRpm: "gcode",
    // O kit vem com pinças ER20 de 1/8″, 1/4″, 3/8″ e 1/2″.
    hastes: [HASTE_1_8, HASTE_1_4, HASTE_3_8, HASTE_1_2],
    hastesComAcessorio: [],
    url: "https://sienci.com/product/altmill-1-5kw-er20-spindle-clear-cut-dust-shoe-kit/",
  },
  "spindle-2-2kw-er20": {
    id: "spindle-2-2kw-er20",
    nome: "Spindle 2,2 kW ER20 (kit AltMill)",
    tipo: "spindle",
    rpmMin: 7500,
    rpmMax: 24000,
    controleRpm: "gcode",
    hastes: [HASTE_1_8, HASTE_1_4, HASTE_3_8, HASTE_1_2],
    hastesComAcessorio: [],
    url: "https://sienci.com/product/altmill-2-2kw-er20-spindle-clear-cut-dust-shoe-kit/",
  },
};

/** Posição do dial mais próxima da rotação pedida. */
export function dialPara(cab: Cabecote, rpm: number): { posicao: number; rpm: number } | undefined {
  if (!cab.dial) return undefined;
  return cab.dial.reduce((best, d) => (Math.abs(d.rpm - rpm) < Math.abs(best.rpm - rpm) ? d : best));
}
