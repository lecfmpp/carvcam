import type { MachineInput } from "../../schema.js";
import { CABECOTES, type CabecoteId } from "./cabecotes.js";

/**
 * Máquinas Sienci Labs. Curso e velocidades vêm dos padrões de firmware que o próprio gSender
 * aplica a cada perfil ($110–$112 e $130–$132, em
 * src/app/src/features/Config/assets/MachineDefaults/), não do material de marketing.
 */
export type MaquinaId =
  | "longmill-mk2-12x30"
  | "longmill-mk2-30x30"
  | "longmill-mk2-48x30"
  | "longmill-mk3-30x30"
  | "longmill-mk3-48x30"
  | "altmill-2x4"
  | "altmill-4x4"
  | "altmill-4x8";

export interface MaquinaSienci {
  id: MaquinaId;
  familia: "LongMill" | "AltMill";
  versao: string;
  tamanho: string;
  nome: string;
  /** Curso útil (mm). */
  curso: { x: number; y: number; z: number };
  /** Velocidade máxima (mm/min). */
  avancoMax: { xy: number; z: number };
  controlador: string;
  cabecotes: CabecoteId[];
  cabecotePadrao: CabecoteId;
  /** Velocidade da tabela Sienci sugerida para quem está começando nesta máquina. */
  velocidadePadrao: "reduzida" | "regular" | "maxima";
  observacoes: string[];
  url: string;
}

const LONGMILL_MK2 = {
  familia: "LongMill" as const,
  versao: "MK2",
  avancoMax: { xy: 4000, z: 3000 },
  controlador: "LongBoard (grbl) ou SuperLongBoard (grblHAL)",
  cabecotes: ["makita-rt0701", "autospin-t1", "spindle-1-5kw-er20"] as CabecoteId[],
  cabecotePadrao: "makita-rt0701" as CabecoteId,
  velocidadePadrao: "regular" as const,
  observacoes: ["O kit de spindle 1,5 kW exige a SuperLongBoard."],
  url: "https://resources.sienci.com/",
};

const LONGMILL_MK3 = {
  familia: "LongMill" as const,
  versao: "MK3",
  avancoMax: { xy: 7000, z: 4000 },
  controlador: "SLB-LITE (grblHAL)",
  cabecotes: ["autospin-t1", "makita-rt0701", "spindle-1-5kw-er20"] as CabecoteId[],
  cabecotePadrao: "autospin-t1" as CabecoteId,
  velocidadePadrao: "regular" as const,
  observacoes: ["O AutoSpin T1 vem no Beginner's Kit.", "Com spindle de 80 mm e coletor de pó, a área de corte diminui."],
  url: "https://resources.sienci.com/view/lmk3-specifications/",
};

const ALTMILL = {
  familia: "AltMill" as const,
  versao: "MK2",
  avancoMax: { xy: 15000, z: 6000 },
  controlador: "SLB-EXT (grblHAL)",
  cabecotes: ["spindle-2-2kw-er20", "spindle-1-5kw-er20"] as CabecoteId[],
  cabecotePadrao: "spindle-2-2kw-er20" as CabecoteId,
  velocidadePadrao: "maxima" as const,
  observacoes: ["A tabela Sienci foi medida numa LongMill MK2; a AltMill, mais rígida, aguenta a velocidade máxima da tabela como ponto de partida."],
  url: "https://sienci.com/product/altmill-2x4/",
};

export const MAQUINAS: Record<MaquinaId, MaquinaSienci> = {
  "longmill-mk2-12x30": { ...LONGMILL_MK2, id: "longmill-mk2-12x30", tamanho: "12×30", nome: "LongMill MK2 12×30", curso: { x: 810, y: 355, z: 120 } },
  "longmill-mk2-30x30": { ...LONGMILL_MK2, id: "longmill-mk2-30x30", tamanho: "30×30", nome: "LongMill MK2 30×30", curso: { x: 810, y: 855, z: 120 } },
  "longmill-mk2-48x30": { ...LONGMILL_MK2, id: "longmill-mk2-48x30", tamanho: "48×30", nome: "LongMill MK2 48×30", curso: { x: 1270, y: 855, z: 120 } },
  "longmill-mk3-30x30": { ...LONGMILL_MK3, id: "longmill-mk3-30x30", tamanho: "30×30", nome: "LongMill MK3 30×30", curso: { x: 805, y: 830, z: 129 } },
  "longmill-mk3-48x30": { ...LONGMILL_MK3, id: "longmill-mk3-48x30", tamanho: "48×30", nome: "LongMill MK3 48×30", curso: { x: 1296, y: 830, z: 129 } },
  "altmill-2x4": { ...ALTMILL, id: "altmill-2x4", tamanho: "2×4", nome: "AltMill 2×4", curso: { x: 1260, y: 648, z: 170 } },
  "altmill-4x4": { ...ALTMILL, id: "altmill-4x4", tamanho: "4×4", nome: "AltMill 4×4", curso: { x: 1260, y: 1248, z: 170 } },
  "altmill-4x8": { ...ALTMILL, id: "altmill-4x8", tamanho: "4×8", nome: "AltMill 4×8", curso: { x: 1260, y: 2661, z: 220 } },
};

/** Limites da máquina no formato do motor de CAM, com a faixa de rotação do cabeçote escolhido. */
export function limitesDaMaquina(id: MaquinaId, cabecote?: CabecoteId): MachineInput {
  const m = MAQUINAS[id];
  const cab = CABECOTES[cabecote ?? m.cabecotePadrao];
  return {
    nome: `${m.nome} + ${cab.nome}`,
    cursoX: m.curso.x,
    cursoY: m.curso.y,
    cursoZ: m.curso.z,
    avancoMaxXY: m.avancoMax.xy,
    avancoMaxZ: m.avancoMax.z,
    rpmMin: cab.rpmMin,
    rpmMax: cab.rpmMax,
  };
}
