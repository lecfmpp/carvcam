import { z } from "zod";

/**
 * Especificação de uma placa ou letreiro, no formato que o assistente de IA preenche.
 * Todas as medidas em milímetros. Origem do trabalho: canto inferior esquerdo do bloco,
 * Z0 na face de cima do material.
 */

export const FONT_IDS = ["archivo-black", "pacifico", "bebas-neue"] as const;
export const ICON_IDS = ["coracao", "estrela", "casa", "folha"] as const;
export const MATERIAL_IDS = ["mdf", "compensado", "madeira_macia", "madeira_dura", "acrilico"] as const;

export const ModoSchema = z.enum(["relevo", "gravado", "recorte"]);

/**
 * Ajustes que valem para qualquer elemento desenhado (texto, ícone, forma, desenho importado).
 * - deslocamento: engrossa (+) ou afina (−) o contorno do elemento, em mm (offset de vetor).
 * - contorno: acrescenta um anel em volta do elemento, a `distancia` mm dele, com `largura` mm.
 * - operacao: "subtrair" tira a área deste elemento dos outros que ele cobre (ele mesmo não é
 *   cortado); "mascara" faz os outros elementos ficarem só com a parte dentro dele.
 */
export const ModificadoresShape = {
  deslocamento: z.number().min(-20).max(30).default(0),
  contorno: z
    .object({
      distancia: z.number().min(0).max(50).default(2),
      largura: z.number().positive().max(30).default(2),
    })
    .optional(),
  operacao: z.enum(["normal", "subtrair", "mascara"]).default("normal"),
  /** Só para gravado: em vez de esvaziar a área, grava o contorno e linhas paralelas dentro. */
  hachura: z
    .object({
      espacamento: z.number().min(0.3).max(30).default(2),
      angulo: z.number().min(-180).max(180).default(45),
    })
    .optional(),
};

export const TextoSchema = z.object({
  conteudo: z.string().min(1).max(60),
  fonte: z.enum(FONT_IDS).default("archivo-black"),
  /** Altura das letras maiúsculas, em mm. */
  tamanho: z.number().positive().max(500),
  modo: ModoSchema.default("relevo"),
  profundidade: z.number().positive().max(50).default(3),
  /** Centro do texto. Se omitido, os textos são empilhados e centralizados na placa. */
  x: z.number().optional(),
  y: z.number().optional(),
  /**
   * Texto em arco: raio da linha de base em mm. Positivo curva para cima, negativo para baixo.
   * Omitido ou 0 = texto reto.
   */
  arco: z.number().min(-5000).max(5000).optional(),
  ...ModificadoresShape,
});

export const IconeSchema = z.object({
  id: z.enum(ICON_IDS),
  x: z.number(),
  y: z.number(),
  tamanho: z.number().positive().max(500),
  modo: ModoSchema.default("relevo"),
  profundidade: z.number().positive().max(50).default(3),
  ...ModificadoresShape,
});

/**
 * Formas desenhadas na tela Criar. Retângulo, círculo, polígono e estrela são centrados em
 * (x, y); a linha vai de (x, y) a (x2, y2) com a espessura dada.
 */
export const FormaSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("retangulo"),
    x: z.number(),
    y: z.number(),
    largura: z.number().positive().max(3000),
    altura: z.number().positive().max(3000),
    raio: z.number().min(0).default(0),
    modo: ModoSchema.default("gravado"),
    profundidade: z.number().positive().max(50).default(2),
    ...ModificadoresShape,
  }),
  z.object({
    tipo: z.literal("circulo"),
    x: z.number(),
    y: z.number(),
    diametro: z.number().positive().max(3000),
    modo: ModoSchema.default("gravado"),
    profundidade: z.number().positive().max(50).default(2),
    ...ModificadoresShape,
  }),
  z.object({
    tipo: z.literal("poligono"),
    x: z.number(),
    y: z.number(),
    /** Diâmetro do círculo que passa pelos vértices. */
    diametro: z.number().positive().max(3000),
    lados: z.number().int().min(3).max(24).default(6),
    rotacao: z.number().default(0),
    modo: ModoSchema.default("gravado"),
    profundidade: z.number().positive().max(50).default(2),
    ...ModificadoresShape,
  }),
  z.object({
    tipo: z.literal("estrela"),
    x: z.number(),
    y: z.number(),
    /** Diâmetro do círculo que passa pelas pontas. */
    diametro: z.number().positive().max(3000),
    pontas: z.number().int().min(3).max(24).default(5),
    /** Raio interno como fração do externo. */
    interno: z.number().min(0.15).max(0.95).default(0.45),
    rotacao: z.number().default(0),
    modo: ModoSchema.default("gravado"),
    profundidade: z.number().positive().max(50).default(2),
    ...ModificadoresShape,
  }),
  z.object({
    tipo: z.literal("linha"),
    x: z.number(),
    y: z.number(),
    x2: z.number(),
    y2: z.number(),
    espessura: z.number().positive().max(100).default(3.2),
    modo: ModoSchema.default("gravado"),
    profundidade: z.number().positive().max(50).default(1),
    ...ModificadoresShape,
  }),
]);

/**
 * Desenho importado de um arquivo SVG ou DXF (o formato é detectado pelo conteúdo).
 * O texto do arquivo vai junto na especificação;
 * (x, y) é o centro e a largura define o tamanho (a altura segue a proporção do desenho).
 */
export const SvgSchema = z.object({
  conteudo: z.string().min(10).max(3_000_000),
  nome: z.string().max(120).optional(),
  x: z.number(),
  y: z.number(),
  largura: z.number().positive().max(3000),
  modo: ModoSchema.default("gravado"),
  profundidade: z.number().positive().max(50).default(2),
  ...ModificadoresShape,
});

export const FuroSchema = z.object({
  x: z.number(),
  y: z.number(),
  diametro: z.number().positive().max(100),
});

export const RasgoSchema = z.object({
  x: z.number(),
  y: z.number(),
  comprimento: z.number().positive().max(200),
  largura: z.number().positive().max(50),
  /** Ângulo em graus; 0 = horizontal. */
  angulo: z.number().default(0),
});

export const BordaSchema = z.object({
  tipo: z.enum(["reta", "arredondada", "chanfrada"]).default("reta"),
  raio: z.number().min(0).default(0),
});

export const PlateSpecSchema = z.object({
  tipo: z.enum(["placa", "letreiro"]).default("placa"),
  largura: z.number().positive().max(3000),
  altura: z.number().positive().max(3000),
  espessura: z.number().positive().max(100),
  material: z.enum(MATERIAL_IDS).default("mdf"),
  texto: z.array(TextoSchema).max(6).default([]),
  borda: BordaSchema.default({ tipo: "reta", raio: 0 }),
  /** Largura da moldura que fica em pé ao redor do relevo. 0 = sem moldura. */
  moldura: z.number().min(0).default(6),
  icones: z.array(IconeSchema).max(12).default([]),
  formas: z.array(FormaSchema).max(40).default([]),
  svgs: z.array(SvgSchema).max(8).default([]),
  furos: z.array(FuroSchema).max(12).default([]),
  rasgos: z.array(RasgoSchema).max(4).default([]),
  /** Recortar o contorno externo da peça (com abas de fixação). */
  recorteExterno: z.boolean().default(true),
  /** Sobra de material ao redor da peça, quando há recorte externo. */
  margem: z.number().min(0).default(10),
});

export type PlateSpec = z.infer<typeof PlateSpecSchema>;
export type PlateSpecInput = z.input<typeof PlateSpecSchema>;
export type Texto = z.infer<typeof TextoSchema>;
export type Icone = z.infer<typeof IconeSchema>;
export type Forma = z.infer<typeof FormaSchema>;
export type SvgElemento = z.infer<typeof SvgSchema>;
export type Modo = z.infer<typeof ModoSchema>;
export type FontId = (typeof FONT_IDS)[number];
export type IconId = (typeof ICON_IDS)[number];
export type MaterialId = (typeof MATERIAL_IDS)[number];

export const ToolSchema = z.object({
  id: z.number().int().positive().default(1),
  nome: z.string().default("Fresa reta 1/8\""),
  tipo: z.enum(["reta", "vbit"]).default("reta"),
  diametro: z.number().positive().max(25).default(3.175),
  /** Ângulo da ponta para V-bit, em graus. */
  angulo: z.number().positive().max(180).optional(),
  canais: z.number().int().positive().max(6).default(2),
  /** Comprimento útil de corte. */
  comprimentoCorte: z.number().positive().default(12),
});
export type Tool = z.infer<typeof ToolSchema>;
export type ToolInput = z.input<typeof ToolSchema>;

/**
 * Limites da máquina. Na integração com o gSender, preencha a partir dos parâmetros
 * de firmware ($110–$112 velocidades, $130–$132 curso) em vez de usar o padrão.
 */
export const MachineSchema = z.object({
  nome: z.string().default("Genérica (conservadora)"),
  cursoX: z.number().positive().default(300),
  cursoY: z.number().positive().default(300),
  cursoZ: z.number().positive().default(60),
  avancoMaxXY: z.number().positive().default(3000),
  avancoMaxZ: z.number().positive().default(800),
  rpmMin: z.number().positive().default(10000),
  rpmMax: z.number().positive().default(30000),
  /** Altura segura para deslocamentos entre operações. */
  alturaSegura: z.number().positive().default(10),
  /** Altura de recuo dentro de uma operação. */
  alturaRecuo: z.number().positive().default(3),
});
export type Machine = z.infer<typeof MachineSchema>;
export type MachineInput = z.input<typeof MachineSchema>;
