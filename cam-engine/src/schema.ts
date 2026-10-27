import { z } from "zod";

/**
 * Especificação de uma placa ou letreiro, no formato que o assistente de IA preenche.
 * Todas as medidas em milímetros. Origem do trabalho: canto inferior esquerdo do bloco,
 * Z0 na face de cima do material.
 */

export const FONT_IDS = ["archivo-black", "pacifico", "bebas-neue"] as const;
export const ICON_IDS = ["heart", "star", "house", "leaf"] as const;
export const MATERIAL_IDS = ["mdf", "plywood", "softwood", "hardwood", "acrylic"] as const;

export const ModeSchema = z.enum(["relief", "engrave", "cutout"]);

/**
 * Ajustes que valem para qualquer elemento desenhado (texto, ícone, forma, desenho importado).
 * - offset: engrossa (+) ou afina (−) o contorno do elemento, em mm (offset de vetor).
 * - outline: acrescenta um anel em volta do elemento, a `distance` mm dele, com `width` mm.
 * - operation: "subtract" tira a área deste elemento dos outros que ele cobre (ele mesmo não é
 *   cortado); "mask" faz os outros elementos ficarem só com a parte dentro dele.
 */
export const ModifiersShape = {
  offset: z.number().min(-20).max(30).default(0),
  outline: z
    .object({
      distance: z.number().min(0).max(50).default(2),
      width: z.number().positive().max(30).default(2),
    })
    .optional(),
  operation: z.enum(["normal", "subtract", "mask"]).default("normal"),
  /**
   * Só para subtrair/mascara: elementos afetados. Omitido = todos os elementos normais.
   * Lista vazia = nenhum.
   */
  targets: z
    .array(z.object({ type: z.enum(["text", "icon", "shape", "svg"]), index: z.number().int().min(0) }))
    .max(80)
    .optional(),
  /** Só para gravado: em vez de esvaziar a área, grava o contorno e linhas paralelas dentro. */
  hatch: z
    .object({
      spacing: z.number().min(0.3).max(30).default(2),
      angle: z.number().min(-180).max(180).default(45),
    })
    .optional(),
};

export const TextSchema = z.object({
  content: z.string().min(1).max(60),
  font: z.enum(FONT_IDS).default("archivo-black"),
  /** Altura das letras maiúsculas, em mm. */
  size: z.number().positive().max(500),
  mode: ModeSchema.default("relief"),
  depth: z.number().positive().max(50).default(3),
  /** Centro do texto. Se omitido, os textos são empilhados e centralizados na placa. */
  x: z.number().optional(),
  y: z.number().optional(),
  /**
   * Texto em arco: raio da linha de base em mm. Positivo curva para cima, negativo para baixo.
   * Omitido ou 0 = texto reto.
   */
  arc: z.number().min(-5000).max(5000).optional(),
  ...ModifiersShape,
});

export const IconSchema = z.object({
  id: z.enum(ICON_IDS),
  x: z.number(),
  y: z.number(),
  size: z.number().positive().max(500),
  mode: ModeSchema.default("relief"),
  depth: z.number().positive().max(50).default(3),
  ...ModifiersShape,
});

/**
 * Nó de uma curva livre (Bézier cúbica), relativo à origem da curva. As alças (entrada e
 * saída) são relativas ao próprio nó; sem alças, o nó é um canto.
 */
export const CurvePointSchema = z.object({
  x: z.number(),
  y: z.number(),
  ix: z.number().optional(),
  iy: z.number().optional(),
  ox: z.number().optional(),
  oy: z.number().optional(),
});
export type CurvePoint = z.infer<typeof CurvePointSchema>;

/**
 * Formas desenhadas na tela Criar. Retângulo, círculo, polígono e estrela são centrados em
 * (x, y); a linha vai de (x, y) a (x2, y2) com a espessura dada.
 */
export const ShapeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("rectangle"),
    x: z.number(),
    y: z.number(),
    width: z.number().positive().max(3000),
    height: z.number().positive().max(3000),
    radius: z.number().min(0).default(0),
    mode: ModeSchema.default("engrave"),
    depth: z.number().positive().max(50).default(2),
    ...ModifiersShape,
  }),
  z.object({
    type: z.literal("circle"),
    x: z.number(),
    y: z.number(),
    diameter: z.number().positive().max(3000),
    mode: ModeSchema.default("engrave"),
    depth: z.number().positive().max(50).default(2),
    ...ModifiersShape,
  }),
  z.object({
    type: z.literal("polygon"),
    x: z.number(),
    y: z.number(),
    /** Diâmetro do círculo que passa pelos vértices. */
    diameter: z.number().positive().max(3000),
    sides: z.number().int().min(3).max(24).default(6),
    rotation: z.number().default(0),
    mode: ModeSchema.default("engrave"),
    depth: z.number().positive().max(50).default(2),
    ...ModifiersShape,
  }),
  z.object({
    type: z.literal("star"),
    x: z.number(),
    y: z.number(),
    /** Diâmetro do círculo que passa pelas pontas. */
    diameter: z.number().positive().max(3000),
    points: z.number().int().min(3).max(24).default(5),
    /** Raio interno como fração do externo. */
    inner: z.number().min(0.15).max(0.95).default(0.45),
    rotation: z.number().default(0),
    mode: ModeSchema.default("engrave"),
    depth: z.number().positive().max(50).default(2),
    ...ModifiersShape,
  }),
  z.object({
    type: z.literal("curve"),
    /** Origem da curva: os pontos são relativos a (x, y); mover a curva muda só isso. */
    x: z.number(),
    y: z.number(),
    nodes: z.array(CurvePointSchema).min(2).max(400),
    /** Fechada vira área; aberta vira um traço com a espessura dada. */
    closed: z.boolean().default(true),
    thickness: z.number().positive().max(100).default(3.2),
    mode: ModeSchema.default("engrave"),
    depth: z.number().positive().max(50).default(2),
    ...ModifiersShape,
  }),
  z.object({
    type: z.literal("line"),
    x: z.number(),
    y: z.number(),
    x2: z.number(),
    y2: z.number(),
    thickness: z.number().positive().max(100).default(3.2),
    mode: ModeSchema.default("engrave"),
    depth: z.number().positive().max(50).default(1),
    ...ModifiersShape,
  }),
]);

/**
 * Desenho importado de um arquivo SVG ou DXF (o formato é detectado pelo conteúdo).
 * O texto do arquivo vai junto na especificação;
 * (x, y) é o centro e a largura define o tamanho (a altura segue a proporção do desenho).
 */
export const SvgSchema = z.object({
  content: z.string().min(10).max(3_000_000),
  name: z.string().max(120).optional(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive().max(3000),
  mode: ModeSchema.default("engrave"),
  depth: z.number().positive().max(50).default(2),
  ...ModifiersShape,
});

export const HoleSchema = z.object({
  x: z.number(),
  y: z.number(),
  diameter: z.number().positive().max(100),
});

export const SlotSchema = z.object({
  x: z.number(),
  y: z.number(),
  length: z.number().positive().max(200),
  width: z.number().positive().max(50),
  /** Ângulo em graus; 0 = horizontal. */
  angle: z.number().default(0),
});

export const EdgeSchema = z.object({
  type: z.enum(["straight", "rounded", "chamfered"]).default("straight"),
  radius: z.number().min(0).default(0),
});

export const PlateSpecSchema = z.object({
  type: z.enum(["plate", "lettering"]).default("plate"),
  width: z.number().positive().max(3000),
  height: z.number().positive().max(3000),
  thickness: z.number().positive().max(100),
  material: z.enum(MATERIAL_IDS).default("mdf"),
  texts: z.array(TextSchema).max(6).default([]),
  edge: EdgeSchema.default({ type: "straight", radius: 0 }),
  /** Largura da moldura que fica em pé ao redor do relevo. 0 = sem moldura. */
  frame: z.number().min(0).default(6),
  icons: z.array(IconSchema).max(12).default([]),
  shapes: z.array(ShapeSchema).max(40).default([]),
  svgs: z.array(SvgSchema).max(8).default([]),
  holes: z.array(HoleSchema).max(12).default([]),
  slots: z.array(SlotSchema).max(4).default([]),
  /** Recortar o contorno externo da peça (com abas de fixação). */
  outerCutout: z.boolean().default(true),
  /** Sobra de material ao redor da peça, quando há recorte externo. */
  margin: z.number().min(0).default(10),
});

export type PlateSpec = z.infer<typeof PlateSpecSchema>;
export type PlateSpecInput = z.input<typeof PlateSpecSchema>;
export type Text = z.infer<typeof TextSchema>;
export type Icon = z.infer<typeof IconSchema>;
export type Shape = z.infer<typeof ShapeSchema>;
export type SvgElement = z.infer<typeof SvgSchema>;
export type Mode = z.infer<typeof ModeSchema>;
export type FontId = (typeof FONT_IDS)[number];
export type IconId = (typeof ICON_IDS)[number];
export type MaterialId = (typeof MATERIAL_IDS)[number];

export const ToolSchema = z.object({
  id: z.number().int().positive().default(1),
  name: z.string().default("Fresa reta 1/8\""),
  type: z.enum(["straight", "vbit"]).default("straight"),
  diameter: z.number().positive().max(25).default(3.175),
  /** Ângulo da ponta para V-bit, em graus. */
  angle: z.number().positive().max(180).optional(),
  flutes: z.number().int().positive().max(6).default(2),
  /** Comprimento útil de corte. */
  cutLength: z.number().positive().default(12),
});
export type Tool = z.infer<typeof ToolSchema>;
export type ToolInput = z.input<typeof ToolSchema>;

/**
 * Limites da máquina. Na integração com o gSender, preencha a partir dos parâmetros
 * de firmware ($110–$112 velocidades, $130–$132 curso) em vez de usar o padrão.
 */
export const MachineSchema = z.object({
  name: z.string().default("Genérica (conservadora)"),
  travelX: z.number().positive().default(300),
  travelY: z.number().positive().default(300),
  travelZ: z.number().positive().default(60),
  maxFeedXY: z.number().positive().default(3000),
  maxFeedZ: z.number().positive().default(800),
  rpmMin: z.number().positive().default(10000),
  rpmMax: z.number().positive().default(30000),
  /** Altura segura para deslocamentos entre operações. */
  safeHeight: z.number().positive().default(10),
  /** Altura de recuo dentro de uma operação. */
  retractHeight: z.number().positive().default(3),
});
export type Machine = z.infer<typeof MachineSchema>;
export type MachineInput = z.input<typeof MachineSchema>;
