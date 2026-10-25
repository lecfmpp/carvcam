export { generatePlate, type GenerateOptions, type GenerateResult, type OperacaoInfo } from "./generate.js";
export { verifyGcode, type VerifyLimits, type VerifyResult, type Problema } from "./verify.js";
export { simulate, Heightmap } from "./sim/heightmap.js";
export { loadFonts, FONT_FILES } from "./fonts.js";
export { MATERIAIS, cutParams, type CutParams } from "./materials.js";
export type { Aviso, RefElemento, Correcao } from "./avisos.js";
export type { Layout, ElementoCorte, FontMap } from "./layout.js";
export * from "./schema.js";
export * as sienci from "./catalog/sienci/index.js";
