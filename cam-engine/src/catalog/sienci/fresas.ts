import type { ToolInput } from "../../schema.js";
import { CABECOTES, HASTE_1_4, HASTE_1_8, type Acessorio, type CabecoteId } from "./cabecotes.js";

/**
 * Fresas vendidas pela Sienci Labs, com as medidas das tabelas das páginas de produto
 * (consultadas em out/2026). Preços ficam de fora porque mudam; a UI busca na loja.
 */
export type LinhaTabela = "1/16-reta" | "1/8-reta" | "1/8-1canal" | "1/4-reta" | "1/4-1canal" | "vbit" | "aplainar-22";

export interface FresaSienci {
  id: string;
  nome: string;
  url: string;
  tipo: "reta" | "vbit" | "bola" | "aplainar";
  corte: "upcut" | "downcut" | "compressao" | "reto";
  diametro: number;
  haste: number;
  canais: number;
  comprimentoCorte: number;
  angulo?: number;
  /** Fresa de compressão: comprimento da parte upcut (a primeira passada precisa passar dele). */
  compressaoUpcut?: number;
  /** Linha da tabela oficial de avanço e rotação da Sienci usada para esta fresa. */
  linha: LinhaTabela | null;
  /** Se o motor de placas e letreiros (v1) sabe usar esta fresa. */
  usoNaV1: boolean;
  indicacao: string;
}

export const FRESAS: FresaSienci[] = [
  {
    id: "reta-1-16-downcut",
    nome: "1/16″ Flat Downcut End Mill – 1/8″ Shank-2F",
    url: "https://sienci.com/product/1-16-flat-downcut-end-mill/",
    tipo: "reta", corte: "downcut", diametro: 1.5875, haste: HASTE_1_8, canais: 2, comprimentoCorte: 8,
    linha: "1/16-reta", usoNaV1: true,
    indicacao: "Detalhes finos e letras pequenas, com acabamento limpo na face de cima.",
  },
  {
    id: "reta-1-16-upcut",
    nome: "1/16″ Flat Upcut End Mill – 1/8″ Shank-2F",
    url: "https://sienci.com/product/1-16-flat-upcut-end-mill/",
    tipo: "reta", corte: "upcut", diametro: 1.5875, haste: HASTE_1_8, canais: 2, comprimentoCorte: 8,
    linha: "1/16-reta", usoNaV1: true,
    indicacao: "Detalhes finos; tira bem o cavaco.",
  },
  {
    id: "reta-1-8-downcut",
    nome: "1/8″ Flat Downcut End Mill – 1/8″ Shank-2F",
    url: "https://sienci.com/product/1-8-flat-downcut_end-mill_3-10pc_pack/",
    tipo: "reta", corte: "downcut", diametro: HASTE_1_8, haste: HASTE_1_8, canais: 2, comprimentoCorte: 15,
    linha: "1/8-reta", usoNaV1: true,
    indicacao: "Relevo e gravação em compensado e MDF sem lascar a face de cima.",
  },
  {
    id: "reta-1-8-upcut",
    nome: "1/8″ Flat Upcut End Mill – 1/8″ Shank-2F",
    url: "https://sienci.com/product/1-8-flat-upcut-end-mill_3pcs_or10pcs/",
    tipo: "reta", corte: "upcut", diametro: HASTE_1_8, haste: HASTE_1_8, canais: 2, comprimentoCorte: 17,
    linha: "1/8-reta", usoNaV1: true,
    indicacao: "A fresa de uso geral: letras, formas e recortes de projetos pequenos.",
  },
  {
    id: "reta-1-8-1canal",
    nome: "1/8″ Single Flute Upcut End Mill – 1/8″ Shank-1F",
    url: "https://sienci.com/product/1-8-singleflute_upcut_endmill_2pcs/",
    tipo: "reta", corte: "upcut", diametro: HASTE_1_8, haste: HASTE_1_8, canais: 1, comprimentoCorte: 12,
    linha: "1/8-1canal", usoNaV1: true,
    indicacao: "Acrílico e outros plásticos (não derrete) e alumínio.",
  },
  {
    id: "reta-1-8-compressao",
    nome: "1/8″ Flat Compression End Mill – 1/8″ Shank-2F",
    url: "https://sienci.com/product/1-8_flat_compression_end-mill_2pcs/",
    tipo: "reta", corte: "compressao", diametro: HASTE_1_8, haste: HASTE_1_8, canais: 2, comprimentoCorte: 13, compressaoUpcut: 3,
    linha: "1/8-reta", usoNaV1: true,
    indicacao: "Recortes em compensado e pinus com as duas faces limpas. A primeira passada precisa passar de 3 mm.",
  },
  {
    id: "reta-1-4-upcut",
    nome: "1/4″ Flat Upcut End Mill – 1/4″ Shank-2F",
    url: "https://sienci.com/product/1-4-flat-upcut-endmill/",
    tipo: "reta", corte: "upcut", diametro: HASTE_1_4, haste: HASTE_1_4, canais: 2, comprimentoCorte: 25.4,
    linha: "1/4-reta", usoNaV1: true,
    indicacao: "Recortes e rebaixos grandes; mais rápida e mais robusta que a 1/8″.",
  },
  {
    id: "reta-1-4-downcut",
    nome: "1/4″x1-1/4″ Flat Downcut End Mill – 1/4″ Shank-2F",
    url: "https://sienci.com/product/1-4-1-1-4_flat-downcut-end-mill/",
    tipo: "reta", corte: "downcut", diametro: HASTE_1_4, haste: HASTE_1_4, canais: 2, comprimentoCorte: 25.4,
    linha: "1/4-reta", usoNaV1: true,
    indicacao: "Rebaixos grandes em compensado sem lascar a face de cima.",
  },
  {
    id: "reta-1-4-1canal",
    nome: "1/4″ Single Flute Upcut End Mill – 1/4″ Shank-1F",
    url: "https://sienci.com/product/1-4-single-flute-end-mill/",
    tipo: "reta", corte: "upcut", diametro: HASTE_1_4, haste: HASTE_1_4, canais: 1, comprimentoCorte: 19.05,
    linha: "1/4-1canal", usoNaV1: true,
    indicacao: "Plásticos e alumínio em peças maiores.",
  },
  {
    id: "reta-1-4-compressao",
    nome: "1/4″ Flat Compression End Mill – 1/4″ Shank-2F",
    url: "https://sienci.com/product/1-4-flat-compression-end-mill/",
    tipo: "reta", corte: "compressao", diametro: HASTE_1_4, haste: HASTE_1_4, canais: 2, comprimentoCorte: 25, compressaoUpcut: 4,
    linha: "1/4-reta", usoNaV1: true,
    indicacao: "Recortes em compensado com as duas faces limpas. A primeira passada precisa passar de 4 mm.",
  },
  {
    id: "vbit-30-1-8",
    nome: "30 Degree Engraving V-Bit – 1/8″ Shank-1F",
    url: "https://sienci.com/product/30-degree_engraving_vbit_4-10pc_pack/",
    tipo: "vbit", corte: "reto", diametro: HASTE_1_8, haste: HASTE_1_8, canais: 1, comprimentoCorte: 11, angulo: 30,
    linha: "vbit", usoNaV1: true,
    indicacao: "Gravação de textos finos e contornos.",
  },
  {
    id: "vbit-60-15mm",
    nome: "15mm 60 Degree V-Bit – 1/4″ Shank-2F",
    url: "https://sienci.com/product/15mm_60-degree-v-bit/",
    tipo: "vbit", corte: "reto", diametro: 15, haste: HASTE_1_4, canais: 2, comprimentoCorte: 17, angulo: 60,
    linha: "vbit", usoNaV1: true,
    indicacao: "Letreiros e gravação em V; vem no Starter End Mill Set.",
  },
  {
    id: "vbit-90-15mm",
    nome: "15mm 90 Degree V-Bit – 1/4″ Shank-2F",
    url: "https://sienci.com/product/15mm_90-degree-1_4-v-bit/",
    tipo: "vbit", corte: "reto", diametro: 15, haste: HASTE_1_4, canais: 2, comprimentoCorte: 12.7, angulo: 90,
    linha: "vbit", usoNaV1: true,
    indicacao: "Gravação em V mais larga e chanfros.",
  },
  {
    id: "aplainar-22mm",
    nome: "22mm Surfacing Bit – 1/4″ Shank-2F",
    url: "https://sienci.com/product/22mm-surfacing-bit/",
    tipo: "aplainar", corte: "reto", diametro: 22, haste: HASTE_1_4, canais: 2, comprimentoCorte: 12,
    linha: "aplainar-22", usoNaV1: false,
    indicacao: "Aplainar a mesa de sacrifício (ferramenta Surfacing do gSender). Não serve para placas.",
  },
  {
    id: "bola-1-4",
    nome: "1/4″ Ball Nose Upcut End Mill – 1/4″ Shank-2F",
    url: "https://sienci.com/product/1-4-ballnose-upcut-end-mill/",
    tipo: "bola", corte: "upcut", diametro: HASTE_1_4, haste: HASTE_1_4, canais: 2, comprimentoCorte: 25.4,
    linha: null, usoNaV1: false,
    indicacao: "Relevos 3D e entalhes arredondados (fora do escopo da v1).",
  },
];

export const FRESA_POR_ID = new Map(FRESAS.map((f) => [f.id, f]));

/** Fresas que vêm no Starter End Mill Set (incluído no Beginner's Kit). */
export const STARTER_SET = ["reta-1-4-upcut", "reta-1-8-upcut", "reta-1-8-1canal", "vbit-60-15mm", "aplainar-22mm"];

export type Compatibilidade =
  | { status: "compativel" }
  | { status: "com-acessorio"; acessorio: Acessorio }
  | { status: "incompativel"; motivo: string };

/** Se a fresa cabe no router/spindle, e se precisa comprar pinça ou adaptador. */
export function compatibilidade(fresa: FresaSienci, cabecote: CabecoteId): Compatibilidade {
  const cab = CABECOTES[cabecote];
  if (cab.hastes.some((h) => Math.abs(h - fresa.haste) < 0.01)) return { status: "compativel" };
  const ac = cab.hastesComAcessorio.find((h) => Math.abs(h.haste - fresa.haste) < 0.01);
  if (ac) return { status: "com-acessorio", acessorio: ac.acessorio };
  return { status: "incompativel", motivo: `O ${cab.nome} não prende hastes de ${fmtPol(fresa.haste)}.` };
}

/** Converte para o formato de ferramenta do motor de CAM. */
export function paraFerramenta(fresa: FresaSienci, numero: number): ToolInput {
  return {
    id: numero,
    nome: fresa.nome,
    tipo: fresa.tipo === "vbit" ? "vbit" : "reta",
    diametro: fresa.diametro,
    angulo: fresa.angulo,
    canais: fresa.canais,
    comprimentoCorte: fresa.comprimentoCorte,
  };
}

function fmtPol(mm: number) {
  const map: Record<string, string> = { "3.175": "1/8″", "6.35": "1/4″", "9.525": "3/8″", "12.7": "1/2″" };
  return map[String(mm)] ?? `${mm} mm`;
}
