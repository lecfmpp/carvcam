import type { MaterialId } from "../../schema.js";
import type { LinhaTabela } from "./fresas.js";

/**
 * Tabela oficial de avanço e rotação da Sienci Labs ("Feeds and Speeds", versão imperial),
 * convertida para mm. Fonte: https://resources.sienci.com/view/cnc-feeds-speeds/
 * Medida numa LongMill MK2 (motores NEMA 23); serve como ponto de partida.
 *
 * Cada linha: [avanço pol/min, mergulho pol/min, sobreposição pol, passada em canal pol, passada em pocket pol, RPM]
 */
type Linha = [number, number, number, number, number, number];

export type Velocidade = "reduzida" | "regular" | "maxima";
export type GrupoMaterial = "madeira_macia" | "madeira_dura" | "plastico";

/** Grupos da tabela Sienci para cada material do motor. */
export const GRUPO_DO_MATERIAL: Record<MaterialId, GrupoMaterial> = {
  mdf: "madeira_macia",
  compensado: "madeira_macia",
  madeira_macia: "madeira_macia",
  madeira_dura: "madeira_dura",
  acrilico: "plastico",
};

type Tabela = Record<Velocidade, Partial<Record<Exclude<LinhaTabela, "vbit">, Linha>>> & { vbit: Linha };

const T: Record<GrupoMaterial, Tabela> = {
  // Softwood / Soft Plywood / MDF
  madeira_macia: {
    vbit: [44, 15, 0.07, 0.42, 0.92, 22000],
    reduzida: {
      "1/4-1canal": [64, 32, 0.11, 0.11, 0.24, 17000],
      "1/4-reta": [65, 33, 0.11, 0.11, 0.24, 12000],
      "1/8-1canal": [41, 21, 0.06, 0.17, 0.37, 22000],
      "1/8-reta": [64, 32, 0.06, 0.11, 0.24, 17000],
      "1/16-reta": [34, 17, 0.03, 0.1, 0.23, 17000],
      "aplainar-22": [61, 31, 0.35, 0.016, 0.04, 17000],
    },
    regular: {
      "1/4-1canal": [85, 43, 0.11, 0.16, 0.36, 17000],
      "1/4-reta": [86, 43, 0.11, 0.16, 0.36, 12000],
      "1/8-1canal": [55, 28, 0.06, 0.25, 0.55, 22000],
      "1/8-reta": [85, 43, 0.06, 0.16, 0.36, 17000],
      "1/16-reta": [43, 21, 0.03, 0.16, 0.37, 17000],
      "aplainar-22": [81, 41, 0.35, 0.02, 0.06, 17000],
    },
    maxima: {
      "1/4-1canal": [106, 53, 0.11, 0.22, 0.48, 17000],
      "1/4-reta": [108, 54, 0.11, 0.21, 0.48, 12000],
      "1/8-1canal": [69, 35, 0.06, 0.33, 0.73, 22000],
      "1/8-reta": [106, 53, 0.06, 0.22, 0.48, 17000],
      "1/16-reta": [53, 27, 0.03, 0.22, 0.49, 17000],
      "aplainar-22": [102, 51, 0.35, 0.03, 0.08, 17000],
    },
  },
  // Hardwood / Hard Plywood
  madeira_dura: {
    vbit: [44, 15, 0.07, 0.39, 0.86, 22000],
    reduzida: {
      "1/4-1canal": [64, 32, 0.11, 0.11, 0.24, 17000],
      "1/4-reta": [65, 33, 0.11, 0.11, 0.24, 12000],
      "1/8-1canal": [41, 21, 0.06, 0.17, 0.37, 22000],
      "1/8-reta": [64, 32, 0.06, 0.11, 0.24, 17000],
      "1/16-reta": [34, 17, 0.03, 0.1, 0.24, 17000],
      "aplainar-22": [61, 31, 0.35, 0.016, 0.04, 17000],
    },
    regular: {
      "1/4-1canal": [85, 43, 0.11, 0.07, 0.17, 17000],
      "1/4-reta": [86, 43, 0.11, 0.07, 0.17, 12000],
      "1/8-1canal": [55, 28, 0.06, 0.12, 0.26, 22000],
      "1/8-reta": [85, 43, 0.06, 0.07, 0.17, 17000],
      "1/16-reta": [43, 21, 0.03, 0.07, 0.17, 17000],
      "aplainar-22": [81, 41, 0.35, 0.012, 0.028, 17000],
    },
    maxima: {
      "1/4-1canal": [106, 53, 0.11, 0.1, 0.22, 17000],
      "1/4-reta": [108, 54, 0.11, 0.1, 0.22, 12000],
      "1/8-1canal": [69, 35, 0.06, 0.15, 0.34, 22000],
      "1/8-reta": [106, 53, 0.06, 0.1, 0.22, 17000],
      "1/16-reta": [53, 27, 0.03, 0.1, 0.23, 17000],
      "aplainar-22": [102, 51, 0.35, 0.016, 0.04, 17000],
    },
  },
  // Plastics (Acrylic, PVC, HDPE, Acetal/Delrin). A tabela só traz fresas upcut.
  plastico: {
    vbit: [44, 15, 0.07, 0.04, 0.09, 22000],
    reduzida: {
      "1/4-1canal": [63, 31, 0.11, 0.024, 0.05, 12000],
      "1/4-reta": [91, 46, 0.11, 0.016, 0.04, 10000],
      "1/8-1canal": [31, 16, 0.06, 0.047, 0.1, 12000],
      "1/8-reta": [63, 31, 0.06, 0.02, 0.05, 12000],
      "1/16-reta": [44, 22, 0.03, 0.016, 0.035, 17000],
    },
    regular: {
      "1/4-1canal": [72, 36, 0.11, 0.04, 0.09, 12000],
      "1/4-reta": [104, 52, 0.11, 0.03, 0.06, 10000],
      "1/8-1canal": [36, 18, 0.06, 0.08, 0.18, 12000],
      "1/8-reta": [72, 36, 0.06, 0.04, 0.09, 12000],
      "1/16-reta": [51, 26, 0.03, 0.03, 0.06, 17000],
    },
    maxima: {
      "1/4-1canal": [90, 45, 0.11, 0.06, 0.12, 12000],
      "1/4-reta": [130, 65, 0.11, 0.04, 0.08, 10000],
      "1/8-1canal": [45, 22, 0.06, 0.11, 0.23, 12000],
      "1/8-reta": [90, 45, 0.06, 0.06, 0.12, 12000],
      "1/16-reta": [64, 32, 0.03, 0.04, 0.09, 17000],
    },
  },
};

export interface ParametrosSienci {
  rpm: number;
  avanco: number;
  mergulho: number;
  sobreposicao: number;
  /** Passada em canal (fresa inteira engajada): usada em recortes e no primeiro anel do pocket. */
  passadaCanal: number;
  passadaPocket: number;
}

/** Busca a linha da tabela, já em mm. Undefined quando a Sienci não publica valores para a combinação. */
export function parametrosSienci(linha: LinhaTabela, material: MaterialId, velocidade: Velocidade): ParametrosSienci | undefined {
  const grupo = T[GRUPO_DO_MATERIAL[material]];
  const l = linha === "vbit" ? grupo.vbit : grupo[velocidade][linha];
  if (!l) return undefined;
  const mm = (v: number) => Math.round(v * 25.4 * 100) / 100;
  return {
    avanco: Math.round(l[0] * 25.4),
    mergulho: Math.round(l[1] * 25.4),
    sobreposicao: mm(l[2]),
    passadaCanal: mm(l[3]),
    passadaPocket: mm(l[4]),
    rpm: l[5],
  };
}
