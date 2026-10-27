/**
 * Upgrades data saved by v0.1.0, whose field names and enum values were in Portuguese
 * (e.g. `{ largura, texto: [{ conteudo, modo: "relevo" }] }`), to the current English schema.
 * Safe to run on data that is already current: unknown keys and values pass through unchanged.
 */

const KEY_MAP: Record<string, string> = {
  // Plate spec
  tipo: "type",
  largura: "width",
  altura: "height",
  espessura: "thickness",
  texto: "texts",
  borda: "edge",
  moldura: "frame",
  icones: "icons",
  formas: "shapes",
  furos: "holes",
  rasgos: "slots",
  recorteExterno: "outerCutout",
  margem: "margin",
  conteudo: "content",
  fonte: "font",
  tamanho: "size",
  modo: "mode",
  profundidade: "depth",
  arco: "arc",
  deslocamento: "offset",
  contorno: "outline",
  distancia: "distance",
  operacao: "operation",
  alvos: "targets",
  indice: "index",
  hachura: "hatch",
  espacamento: "spacing",
  angulo: "angle",
  raio: "radius",
  diametro: "diameter",
  lados: "sides",
  rotacao: "rotation",
  pontas: "points",
  interno: "inner",
  pontos: "nodes",
  fechada: "closed",
  nome: "name",
  comprimento: "length",
  // Tool and machine (CLI example files)
  placa: "plate",
  ferramenta: "tool",
  ferramentaRecorte: "cutoutTool",
  maquina: "machine",
  canais: "flutes",
  comprimentoCorte: "cutLength",
  cursoX: "travelX",
  cursoY: "travelY",
  cursoZ: "travelZ",
  avancoMaxXY: "maxFeedXY",
  avancoMaxZ: "maxFeedZ",
  alturaSegura: "safeHeight",
  alturaRecuo: "retractHeight",
};

/** Enum values, by the (already translated) key that holds them. */
const VALUE_MAP: Record<string, Record<string, string>> = {
  type: {
    placa: "plate",
    letreiro: "lettering",
    reta: "straight",
    arredondada: "rounded",
    chanfrada: "chamfered",
    retangulo: "rectangle",
    circulo: "circle",
    poligono: "polygon",
    estrela: "star",
    curva: "curve",
    linha: "line",
    texto: "text",
    icone: "icon",
    forma: "shape",
  },
  mode: { relevo: "relief", gravado: "engrave", recorte: "cutout" },
  material: { compensado: "plywood", madeira_macia: "softwood", madeira_dura: "hardwood", acrilico: "acrylic" },
  operation: { subtrair: "subtract", mascara: "mask" },
  id: { coracao: "heart", estrela: "star", casa: "house", folha: "leaf" },
};

function walk(v: unknown, key?: string): unknown {
  if (Array.isArray(v)) return v.map((x) => walk(x, key));
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      const nk = k in KEY_MAP && !(KEY_MAP[k] in v) ? KEY_MAP[k] : k;
      out[nk] = walk(x, nk);
    }
    return out;
  }
  if (typeof v === "string" && key && VALUE_MAP[key]?.[v]) return VALUE_MAP[key][v];
  return v;
}

/** Plate spec (or a CLI example file `{ placa, ferramenta, … }`) saved with the v0.1.0 field names. */
export function migrateLegacySpec<T = unknown>(spec: unknown): T {
  return walk(spec) as T;
}

/** Sienci bit ids renamed after v0.1.0. */
export const LEGACY_BIT_IDS: Record<string, string> = {
  "reta-1-16-downcut": "flat-1-16-downcut",
  "reta-1-16-upcut": "flat-1-16-upcut",
  "reta-1-8-downcut": "flat-1-8-downcut",
  "reta-1-8-upcut": "flat-1-8-upcut",
  "reta-1-8-1canal": "flat-1-8-1flute",
  "reta-1-8-compressao": "flat-1-8-compression",
  "reta-1-4-upcut": "flat-1-4-upcut",
  "reta-1-4-downcut": "flat-1-4-downcut",
  "reta-1-4-1canal": "flat-1-4-1flute",
  "reta-1-4-compressao": "flat-1-4-compression",
  "aplainar-22mm": "surfacing-22mm",
  "bola-1-4": "ball-1-4",
  "loja-bola-1-8": "store-ball-1-8",
  "loja-conica-1-4-1-5": "store-tapered-1-4-1-5",
  "loja-conica-1-4-2-dlc": "store-tapered-1-4-2-dlc",
  "loja-bola-1-4-1-dlc": "store-ball-1-4-1-dlc",
  "loja-corncob-1-16": "store-corncob-1-16",
  "loja-desbaste-1-4": "store-roughing-1-4",
  "loja-compressao-1-4-dlc": "store-compression-1-4-dlc",
  "loja-vbit-60-dlc": "store-vbit-60-dlc",
  "loja-canal-1-2": "store-groove-1-2",
  "loja-canal-3-4": "store-groove-3-4",
  "loja-tigela-1": "store-bowl-1",
  "loja-aplainar-1-5": "store-surfacing-1-5",
};

/** Starter project ids renamed after v0.1.0. */
export const LEGACY_PROJECT_IDS: Record<string, string> = {
  "teste-de-profundidade": "depth-test",
  "porta-copos": "coaster",
  "placa-de-porta": "door-sign",
  "plaquinha-de-pet": "pet-plaque",
  "letreiro-bem-vindos": "welcome-sign",
  "chaveiro-acrilico": "acrylic-keychain",
  "placa-de-endereco": "address-sign",
};

export const migrateLegacyBitId = (id: string) => LEGACY_BIT_IDS[id] ?? id;
export const migrateLegacyProjectId = (id: string) => LEGACY_PROJECT_IDS[id] ?? id;
