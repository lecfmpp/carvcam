import { parseDesenho, SvgInvalido, type GenerateResult, type PlateSpecInput, type RefElemento } from "@gsender-next/cam-engine";

/**
 * Elementos da tela Create sobre a especificação do motor:
 * textos (t:i), formas (f:i), ícones (i:i), desenhos SVG importados (s:i) e o grupo de furos/rasgo (holes).
 */
export type ElementId = `t:${number}` | `f:${number}` | `i:${number}` | `s:${number}` | "holes";

export interface Box {
  /** Centro e tamanho em mm, coordenadas da peça (origem no canto inferior esquerdo da placa). */
  cx: number;
  cy: number;
  w: number;
  h: number;
}

export type Texto = NonNullable<PlateSpecInput["texto"]>[number];
export type Forma = NonNullable<PlateSpecInput["formas"]>[number];
export type Icone = NonNullable<PlateSpecInput["icones"]>[number];
export type SvgEl = NonNullable<PlateSpecInput["svgs"]>[number];

export const FONTS: { id: NonNullable<Texto["fonte"]>; name: string; tag: string; css: string; widthFactor: number }[] = [
  { id: "archivo-black", name: "Archivo Black", tag: "Easiest to cut", css: "'Archivo Black'", widthFactor: 0.86 },
  { id: "bebas-neue", name: "Bebas Neue", tag: "Condensed, thinner", css: "'Bebas Neue'", widthFactor: 0.46 },
  { id: "pacifico", name: "Pacifico", tag: "Script, letters join", css: "'Pacifico'", widthFactor: 0.82 },
];
export const fontOf = (id?: string) => FONTS.find((f) => f.id === id) ?? FONTS[0];

export const ICONS: { id: Icone["id"]; name: string }[] = [
  { id: "coracao", name: "Heart" },
  { id: "estrela", name: "Star" },
  { id: "casa", name: "House" },
  { id: "folha", name: "Leaf" },
];

export const MODE_NAME: Record<string, string> = { relevo: "raised", gravado: "engraved", recorte: "cut out" };
export const SHAPE_NAME: Record<Forma["tipo"], string> = { retangulo: "Rectangle", circulo: "Circle", linha: "Line", poligono: "Polygon", estrela: "Star" };
export const OP_NAME: Record<string, string> = { subtrair: "subtracts", mascara: "mask" };

export function idOf(ref: RefElemento | undefined): ElementId | null {
  if (!ref) return null;
  if (ref.tipo === "texto") return `t:${ref.indice}`;
  if (ref.tipo === "forma") return `f:${ref.indice}`;
  if (ref.tipo === "icone") return `i:${ref.indice}`;
  if (ref.tipo === "svg") return `s:${ref.indice}`;
  return "holes";
}

export function parseId(id: ElementId): { kind: "t" | "f" | "i" | "s" | "holes"; index: number } {
  if (id === "holes") return { kind: "holes", index: 0 };
  const [k, i] = id.split(":");
  return { kind: k as "t" | "f" | "i" | "s", index: Number(i) };
}

export interface ElementRow {
  id: ElementId;
  kind: "text" | "shape" | "icon" | "svg" | "holes";
  name: string;
  sub: string;
}

/** Lista de elementos na ordem do painel. */
export function listElements(spec: PlateSpecInput): ElementRow[] {
  const sign = spec.tipo !== "letreiro";
  const rows: ElementRow[] = [];
  (spec.texto ?? []).forEach((t, i) =>
    rows.push({
      id: `t:${i}`,
      kind: "text",
      name: t.conteudo || "Empty text",
      sub: `Text · ${fontOf(t.fonte).name} · ${t.tamanho} mm · ${opOr(t, sign ? MODE_NAME[t.modo ?? "relevo"] : "cut out")}`,
    }),
  );
  (spec.formas ?? []).forEach((f, i) =>
    rows.push({
      id: `f:${i}`,
      kind: "shape",
      name: `${SHAPE_NAME[f.tipo]} ${i + 1}`,
      sub: `${SHAPE_NAME[f.tipo]} · ${shapeSize(f)} · ${opOr(f, MODE_NAME[f.modo ?? "gravado"])}`,
    }),
  );
  (spec.icones ?? []).forEach((c, i) =>
    rows.push({ id: `i:${i}`, kind: "icon", name: ICONS.find((x) => x.id === c.id)?.name ?? "Icon", sub: `Icon · ${c.tamanho} mm · ${opOr(c, MODE_NAME[c.modo ?? "relevo"])}` }),
  );
  (spec.svgs ?? []).forEach((v, i) =>
    rows.push({ id: `s:${i}`, kind: "svg", name: v.nome || `Drawing ${i + 1}`, sub: `Drawing · ${r(v.largura)} mm wide · ${opOr(v, sign ? MODE_NAME[v.modo ?? "gravado"] : "cut out")}` }),
  );
  const holes = spec.furos?.length ?? 0;
  const slots = spec.rasgos?.length ?? 0;
  if (holes || slots)
    rows.push({
      id: "holes",
      kind: "holes",
      name: slots ? "Hanging slot" : `${holes} mounting hole${holes > 1 ? "s" : ""}`,
      sub: slots ? `Slot · ${spec.rasgos![0].largura} mm wide · cut through` : `Holes · ⌀ ${spec.furos![0].diametro} mm · cut through`,
    });
  return rows;
}

const opOr = (e: { operacao?: string }, mode: string) => (e.operacao && e.operacao !== "normal" ? OP_NAME[e.operacao] : mode);

function shapeSize(f: Forma) {
  if (f.tipo === "retangulo") return `${r(f.largura)} × ${r(f.altura)} mm`;
  if (f.tipo === "circulo") return `⌀ ${r(f.diametro)} mm`;
  if (f.tipo === "poligono") return `${f.lados ?? 6} sides · ⌀ ${r(f.diametro)} mm`;
  if (f.tipo === "estrela") return `${f.pontas ?? 5} points · ⌀ ${r(f.diametro)} mm`;
  return `${r(Math.hypot(f.x2 - f.x, f.y2 - f.y))} mm`;
}

export function elementName(spec: PlateSpecInput, id: ElementId | null): string {
  if (!id) return "The sign";
  return listElements(spec).find((e) => e.id === id)?.name ?? "This element";
}

const r = (v: number) => Math.round(v * 10) / 10;

// ------------------------------------------------------------------ boxes

type Region = { x: number; y: number }[][];

function bounds(reg: Region | undefined) {
  if (!reg || reg.length === 0) return null;
  let a = Infinity,
    b = Infinity,
    c = -Infinity,
    d = -Infinity;
  for (const p of reg)
    for (const q of p) {
      if (q.x < a) a = q.x;
      if (q.y < b) b = q.y;
      if (q.x > c) c = q.x;
      if (q.y > d) d = q.y;
    }
  return { x0: a, y0: b, x1: c, y1: d };
}

export function margin(spec: PlateSpecInput) {
  return spec.recorteExterno ?? true ? (spec.margem ?? 10) : 0;
}

/**
 * Caixa de cada elemento. Usa a geometria real do motor quando existe (o motor diz onde cada
 * texto foi parar); senão estima a partir da especificação.
 */
export function elementBoxes(spec: PlateSpecInput, result: GenerateResult | null): Map<ElementId, Box> {
  const m = margin(spec);
  const out = new Map<ElementId, Box>();
  const fromEngine = new Map<ElementId, Region>();
  if (result) {
    const L = result.layout;
    const add = (ref: RefElemento | undefined, reg: Region) => {
      const id = idOf(ref);
      if (!id) return;
      fromEngine.set(id, [...(fromEngine.get(id) ?? []), ...reg]);
    };
    L.gravados.forEach((g) => add(g.ref, g.regiao));
    L.vazados.forEach((v) => add(v.ref, v.regiao));
    L.relevo?.itens?.forEach((it) => add(it.ref, it.regiao));
    L.furos.forEach((f) => add(f.ref, f.regiao));
  }
  for (const [id, reg] of fromEngine) {
    const b = bounds(reg);
    if (b) out.set(id, { cx: (b.x0 + b.x1) / 2 - m, cy: (b.y0 + b.y1) / 2 - m, w: b.x1 - b.x0, h: b.y1 - b.y0 });
  }
  // Estimativas para o que o motor não separou (letreiro, ou resultado ainda não chegou).
  const W = spec.largura;
  const H = spec.altura;
  const texts = spec.texto ?? [];
  const auto = texts.map((t, i) => ({ t, i })).filter(({ t }) => t.x === undefined || t.y === undefined);
  const heights = auto.map(({ t }) => t.tamanho * 1.15);
  const total = heights.reduce((s, h) => s + h, 0) + auto.slice(1).reduce((s, a) => s + a.t.tamanho * 0.45, 0);
  let top = H / 2 + total / 2;
  auto.forEach(({ t, i }, k) => {
    const id: ElementId = `t:${i}`;
    const h = heights[k];
    if (!out.has(id)) out.set(id, { cx: W / 2, cy: top - h / 2, w: textWidth(t), h });
    top -= h + (auto[k + 1] ? auto[k + 1].t.tamanho * 0.45 : 0);
  });
  texts.forEach((t, i) => {
    const id: ElementId = `t:${i}`;
    if (!out.has(id) && t.x !== undefined && t.y !== undefined) out.set(id, { cx: t.x, cy: t.y, w: textWidth(t), h: t.tamanho * 1.15 });
  });
  (spec.formas ?? []).forEach((f, i) => {
    const id: ElementId = `f:${i}`;
    if (out.has(id)) return;
    if (f.tipo === "retangulo") out.set(id, { cx: f.x, cy: f.y, w: f.largura, h: f.altura });
    else if (f.tipo === "circulo" || f.tipo === "poligono" || f.tipo === "estrela") out.set(id, { cx: f.x, cy: f.y, w: f.diametro, h: f.diametro });
    else {
      const e = f.espessura ?? 3.2;
      out.set(id, { cx: (f.x + f.x2) / 2, cy: (f.y + f.y2) / 2, w: Math.abs(f.x2 - f.x) + e, h: Math.abs(f.y2 - f.y) + e });
    }
  });
  (spec.icones ?? []).forEach((c, i) => {
    const id: ElementId = `i:${i}`;
    if (!out.has(id)) out.set(id, { cx: c.x, cy: c.y, w: c.tamanho, h: c.tamanho });
  });
  (spec.svgs ?? []).forEach((v, i) => {
    const id: ElementId = `s:${i}`;
    if (!out.has(id)) out.set(id, { cx: v.x, cy: v.y, w: v.largura, h: v.largura * svgAspect(v.conteudo) });
  });
  if (!out.has("holes")) {
    const pts = [...(spec.furos ?? []).map((f) => ({ x: f.x, y: f.y, r: f.diametro / 2 })), ...(spec.rasgos ?? []).map((s) => ({ x: s.x, y: s.y, r: s.comprimento / 2 }))];
    if (pts.length) {
      const x0 = Math.min(...pts.map((p) => p.x - p.r));
      const x1 = Math.max(...pts.map((p) => p.x + p.r));
      const y0 = Math.min(...pts.map((p) => p.y - p.r));
      const y1 = Math.max(...pts.map((p) => p.y + p.r));
      out.set("holes", { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 });
    }
  }
  return out;
}

export function textWidth(t: Texto) {
  return Math.max(t.tamanho * 0.5, (t.conteudo || " ").length * t.tamanho * fontOf(t.fonte).widthFactor);
}

// ------------------------------------------------------------------ edits

/**
 * Move um elemento para que o centro da caixa fique em (cx, cy), em mm da peça. A âncora (x, y)
 * de uma estrela, de um polígono ímpar ou de um elemento com anel não é o centro da caixa, então
 * aplicamos o deslocamento da caixa à âncora em vez de copiar o centro.
 */
export function moveElement(spec: PlateSpecInput, id: ElementId, cx: number, cy: number, box: Box | undefined): PlateSpecInput {
  const s = structuredClone(spec);
  const { kind, index } = parseId(id);
  const rx = (v: number) => Math.round(v * 10) / 10;
  if (kind === "holes") {
    if (!box) return s;
    const dx = cx - box.cx;
    const dy = cy - box.cy;
    s.furos = s.furos?.map((f) => ({ ...f, x: rx(f.x + dx), y: rx(f.y + dy) }));
    s.rasgos = s.rasgos?.map((f) => ({ ...f, x: rx(f.x + dx), y: rx(f.y + dy) }));
    return s;
  }
  const el = elementOf(s, id) as (AnyEl & { x?: number; y?: number; x2?: number; y2?: number; tipo?: string }) | null;
  if (!el) return s;
  // Texto sem posição (empilhado pelo motor): passa a ter posição; o motor centraliza a caixa nela.
  if (kind === "t" && (el.x === undefined || el.y === undefined)) {
    Object.assign(el, { x: rx(cx), y: rx(cy) });
    return s;
  }
  const line = el.tipo === "linha";
  const ox = line ? (el.x! + el.x2!) / 2 : el.x!;
  const oy = line ? (el.y! + el.y2!) / 2 : el.y!;
  const dx = cx - (box?.cx ?? ox);
  const dy = cy - (box?.cy ?? oy);
  Object.assign(el, { x: rx(el.x! + dx), y: rx(el.y! + dy) });
  if (line) Object.assign(el, { x2: rx(el.x2! + dx), y2: rx(el.y2! + dy) });
  return s;
}

export function deleteElement(spec: PlateSpecInput, id: ElementId): PlateSpecInput {
  const s = structuredClone(spec);
  const { kind, index } = parseId(id);
  if (kind === "t") s.texto = (s.texto ?? []).filter((_, i) => i !== index);
  if (kind === "f") s.formas = (s.formas ?? []).filter((_, i) => i !== index);
  if (kind === "i") s.icones = (s.icones ?? []).filter((_, i) => i !== index);
  if (kind === "s") s.svgs = (s.svgs ?? []).filter((_, i) => i !== index);
  if (kind === "holes") {
    s.furos = [];
    s.rasgos = [];
    return s;
  }
  // Os alvos de subtrair/máscara apontam por índice: tira o apagado e renumera os seguintes.
  const tipo = TIPO_OF[kind];
  for (const key of ["texto", "formas", "icones", "svgs"] as const) {
    for (const el of (s[key] ?? []) as AnyEl[]) {
      if (!el.alvos) continue;
      el.alvos = el.alvos.filter((a) => !(a.tipo === tipo && a.indice === index)).map((a) => (a.tipo === tipo && a.indice > index ? { ...a, indice: a.indice - 1 } : a));
    }
  }
  return s;
}

const TIPO_OF = { t: "texto", f: "forma", i: "icone", s: "svg" } as const;
const KIND_OF = { texto: "t", forma: "f", icone: "i", svg: "s" } as const;
export type Alvo = { tipo: (typeof TIPO_OF)[keyof typeof TIPO_OF]; indice: number };

/** Referência do motor para um elemento da tela (null para o grupo de furos). */
export function refOf(id: ElementId): Alvo | null {
  const { kind, index } = parseId(id);
  return kind === "holes" ? null : { tipo: TIPO_OF[kind], indice: index };
}
export const idOfAlvo = (a: Alvo): ElementId => `${KIND_OF[a.tipo]}:${a.indice}` as ElementId;

/** Duplica e devolve a especificação e o id da cópia (deslocada 8 mm). */
export function duplicateElement(spec: PlateSpecInput, id: ElementId, box: Box | undefined): [PlateSpecInput, ElementId | null] {
  const s = structuredClone(spec);
  const { kind, index } = parseId(id);
  if (kind === "t" && s.texto?.[index]) {
    const t = structuredClone(s.texto[index]);
    t.x = (box?.cx ?? spec.largura / 2) + 8;
    t.y = (box?.cy ?? spec.altura / 2) - 8;
    s.texto.push(t);
    return [s, `t:${s.texto.length - 1}`];
  }
  if (kind === "f" && s.formas?.[index]) {
    const f = structuredClone(s.formas[index]);
    f.x += 8;
    f.y -= 8;
    if (f.tipo === "linha") {
      f.x2 += 8;
      f.y2 -= 8;
    }
    s.formas.push(f);
    return [s, `f:${s.formas.length - 1}`];
  }
  if (kind === "i" && s.icones?.[index]) {
    const c = structuredClone(s.icones[index]);
    c.x += 8;
    c.y -= 8;
    s.icones.push(c);
    return [s, `i:${s.icones.length - 1}`];
  }
  if (kind === "s" && s.svgs?.[index]) {
    const v = structuredClone(s.svgs[index]);
    v.x += 8;
    v.y -= 8;
    s.svgs.push(v);
    return [s, `s:${s.svgs.length - 1}`];
  }
  return [s, null];
}

export type Tool = "select" | "text" | "rect" | "circle" | "polygon" | "star" | "line";

/** Acrescenta um elemento novo com o centro em (x, y), mm da peça. */
export function addElement(spec: PlateSpecInput, tool: Exclude<Tool, "select">, x: number, y: number): [PlateSpecInput, ElementId] {
  const s = structuredClone(spec);
  const rx = (v: number) => Math.round(v * 10) / 10;
  const sign = s.tipo !== "letreiro";
  if (tool === "text") {
    s.texto = [...(s.texto ?? []), { conteudo: "Text", fonte: "archivo-black", tamanho: Math.max(10, Math.min(24, Math.round(s.altura / 6))), modo: sign ? "gravado" : "recorte", profundidade: 2, x: rx(x), y: rx(y) }];
    return [s, `t:${s.texto.length - 1}`];
  }
  const mode = sign ? "gravado" : "recorte";
  const f: Forma =
    tool === "rect"
      ? { tipo: "retangulo", x: rx(x), y: rx(y), largura: 40, altura: 24, raio: 0, modo: mode, profundidade: 2 }
      : tool === "circle"
        ? { tipo: "circulo", x: rx(x), y: rx(y), diametro: 30, modo: mode, profundidade: 2 }
        : tool === "polygon"
          ? { tipo: "poligono", x: rx(x), y: rx(y), diametro: 34, lados: 6, rotacao: 0, modo: mode, profundidade: 2 }
          : tool === "star"
            ? { tipo: "estrela", x: rx(x), y: rx(y), diametro: 36, pontas: 5, interno: 0.45, rotacao: 0, modo: mode, profundidade: 2 }
            : { tipo: "linha", x: rx(x - 30), y: rx(y), x2: rx(x + 30), y2: rx(y), espessura: 4, modo: "gravado", profundidade: 1 };
  s.formas = [...(s.formas ?? []), f];
  return [s, `f:${s.formas.length - 1}`];
}

/** Aplica uma correção do motor (campo/valor num elemento) à especificação. */
export function applyCorrection(spec: PlateSpecInput, ref: RefElemento, campo: string, valor: number): PlateSpecInput {
  const s = structuredClone(spec) as PlateSpecInput & Record<string, unknown>;
  const list: Record<string, unknown[] | undefined> = { texto: s.texto, icone: s.icones, forma: s.formas, svg: s.svgs, furo: s.furos, rasgo: s.rasgos };
  const arr = list[ref.tipo];
  const el = arr?.[ref.indice] as Record<string, unknown> | undefined;
  if (el) {
    // Campo pode ser aninhado ("hachura.espacamento").
    const path = campo.split(".");
    let obj = el;
    for (const k of path.slice(0, -1)) obj = (obj[k] ??= {}) as Record<string, unknown>;
    obj[path[path.length - 1]] = valor;
  }
  // Furos: a correção vale para todos (são um grupo na interface).
  if (ref.tipo === "furo" && campo === "diametro") s.furos = s.furos?.map((f) => ({ ...f, diametro: valor }));
  return s;
}

// ------------------------------------------------------------------ SVG

/** Altura ÷ largura do desenho (1 se o arquivo não puder ser lido). */
export function svgAspect(conteudo: string) {
  try {
    const d = parseDesenho(conteudo);
    return d.altura / d.largura;
  } catch {
    return 1;
  }
}

/**
 * Importa um arquivo SVG como elemento novo, centrado em (x, y). A largura começa no tamanho
 * natural do arquivo, limitada a 60% da placa (e ao que couber na altura).
 */
export function addSvg(spec: PlateSpecInput, conteudo: string, nome: string, x: number, y: number): [PlateSpecInput, ElementId, number] | { error: string } {
  let d;
  try {
    d = parseDesenho(conteudo);
  } catch (e) {
    return { error: e instanceof SvgInvalido ? e.message : "This file is not a valid SVG or DXF." };
  }
  const s = structuredClone(spec);
  const sign = s.tipo !== "letreiro";
  const maxW = Math.min(s.largura * 0.6, (s.altura * 0.6 * d.largura) / d.altura);
  const largura = Math.max(5, Math.round(Math.min(d.largura, maxW) * 10) / 10);
  const rx = (v: number) => Math.round(v * 10) / 10;
  s.svgs = [...(s.svgs ?? []), { conteudo, nome: nome.replace(/\.(svg|dxf)$/i, "").slice(0, 60), x: rx(x), y: rx(y), largura, modo: sign ? "gravado" : "recorte", profundidade: 2 }];
  return [s, `s:${s.svgs.length - 1}`, d.abertos ?? 0];
}

// ------------------------------------------------------------------ generic element access

type AnyEl = Texto | Forma | Icone | SvgEl;
const LIST = { t: "texto", f: "formas", i: "icones", s: "svgs" } as const;

/** O objeto do elemento na especificação (null para o grupo de furos). */
export function elementOf(spec: PlateSpecInput, id: ElementId): AnyEl | null {
  const { kind, index } = parseId(id);
  if (kind === "holes") return null;
  return ((spec[LIST[kind]] as AnyEl[] | undefined) ?? [])[index] ?? null;
}

/** Aplica campos a um elemento (texto, forma, ícone ou desenho). */
export function patchElement(spec: PlateSpecInput, id: ElementId, p: Record<string, unknown>): PlateSpecInput {
  const { kind, index } = parseId(id);
  if (kind === "holes") return spec;
  const key = LIST[kind];
  const arr = (spec[key] as AnyEl[] | undefined) ?? [];
  return { ...spec, [key]: arr.map((x, i) => (i === index ? { ...x, ...p } : x)) };
}

// ------------------------------------------------------------------ align & distribute

export type Align = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom" | "hdist" | "vdist";

/**
 * Alinha os elementos. Com um só elemento, alinha à placa; com vários, à caixa da seleção.
 * Distribuir (3 ou mais) espaça os centros por igual entre o primeiro e o último.
 */
export function alignElements(spec: PlateSpecInput, ids: ElementId[], boxes: Map<ElementId, Box>, how: Align): PlateSpecInput {
  const items = ids.map((id) => ({ id, b: boxes.get(id) })).filter((x): x is { id: ElementId; b: Box } => !!x.b);
  if (!items.length) return spec;
  const ref =
    items.length === 1
      ? { x0: 0, x1: spec.largura, y0: 0, y1: spec.altura }
      : {
          x0: Math.min(...items.map(({ b }) => b.cx - b.w / 2)),
          x1: Math.max(...items.map(({ b }) => b.cx + b.w / 2)),
          y0: Math.min(...items.map(({ b }) => b.cy - b.h / 2)),
          y1: Math.max(...items.map(({ b }) => b.cy + b.h / 2)),
        };
  const target = new Map<ElementId, { cx: number; cy: number }>();
  if (how === "hdist" || how === "vdist") {
    if (items.length < 3) return spec;
    const ax = how === "hdist" ? "cx" : "cy";
    const sorted = [...items].sort((a, b) => a.b[ax] - b.b[ax]);
    const a = sorted[0].b[ax];
    const z = sorted[sorted.length - 1].b[ax];
    sorted.forEach(({ id, b }, k) => target.set(id, ax === "cx" ? { cx: a + ((z - a) * k) / (sorted.length - 1), cy: b.cy } : { cx: b.cx, cy: a + ((z - a) * k) / (sorted.length - 1) }));
  } else {
    for (const { id, b } of items) {
      let { cx, cy } = b;
      if (how === "left") cx = ref.x0 + b.w / 2;
      if (how === "right") cx = ref.x1 - b.w / 2;
      if (how === "hcenter") cx = (ref.x0 + ref.x1) / 2;
      if (how === "bottom") cy = ref.y0 + b.h / 2;
      if (how === "top") cy = ref.y1 - b.h / 2;
      if (how === "vcenter") cy = (ref.y0 + ref.y1) / 2;
      target.set(id, { cx, cy });
    }
  }
  let s = spec;
  for (const [id, t] of target) s = moveElement(s, id, t.cx, t.cy, boxes.get(id));
  return s;
}

// ------------------------------------------------------------------ arc text

/** Curvatura do texto em % de meia volta (−100 a 100) ↔ raio do arco em mm. */
export function bendOf(t: Texto): number {
  if (!t.arco) return 0;
  const L = textWidth(t);
  return Math.max(-100, Math.min(100, Math.round(((L / t.arco) / Math.PI) * 100)));
}
export function arcFromBend(t: Texto, bend: number): number | undefined {
  if (!bend) return undefined;
  const L = textWidth(t);
  return Math.round((L / ((bend / 100) * Math.PI)) * 10) / 10;
}
