import { parseSvg, SvgInvalido, type GenerateResult, type PlateSpecInput, type RefElemento } from "@gsender-next/cam-engine";

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
export const SHAPE_NAME: Record<Forma["tipo"], string> = { retangulo: "Rectangle", circulo: "Circle", linha: "Line" };

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
      sub: `Text · ${fontOf(t.fonte).name} · ${t.tamanho} mm · ${sign ? MODE_NAME[t.modo ?? "relevo"] : "cut out"}`,
    }),
  );
  (spec.formas ?? []).forEach((f, i) =>
    rows.push({
      id: `f:${i}`,
      kind: "shape",
      name: `${SHAPE_NAME[f.tipo]} ${i + 1}`,
      sub: `${SHAPE_NAME[f.tipo]} · ${shapeSize(f)} · ${MODE_NAME[f.modo ?? "gravado"]}`,
    }),
  );
  (spec.icones ?? []).forEach((c, i) =>
    rows.push({ id: `i:${i}`, kind: "icon", name: ICONS.find((x) => x.id === c.id)?.name ?? "Icon", sub: `Icon · ${c.tamanho} mm · ${MODE_NAME[c.modo ?? "relevo"]}` }),
  );
  (spec.svgs ?? []).forEach((v, i) =>
    rows.push({ id: `s:${i}`, kind: "svg", name: v.nome || `Drawing ${i + 1}`, sub: `SVG · ${r(v.largura)} mm wide · ${sign ? MODE_NAME[v.modo ?? "gravado"] : "cut out"}` }),
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

function shapeSize(f: Forma) {
  if (f.tipo === "retangulo") return `${r(f.largura)} × ${r(f.altura)} mm`;
  if (f.tipo === "circulo") return `⌀ ${r(f.diametro)} mm`;
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
    else if (f.tipo === "circulo") out.set(id, { cx: f.x, cy: f.y, w: f.diametro, h: f.diametro });
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

/** Move um elemento para que o centro fique em (cx, cy), em mm da peça. */
export function moveElement(spec: PlateSpecInput, id: ElementId, cx: number, cy: number, box: Box | undefined): PlateSpecInput {
  const s = structuredClone(spec);
  const { kind, index } = parseId(id);
  const rx = (v: number) => Math.round(v * 10) / 10;
  if (kind === "t" && s.texto?.[index]) {
    s.texto[index].x = rx(cx);
    s.texto[index].y = rx(cy);
  } else if (kind === "f" && s.formas?.[index]) {
    const f = s.formas[index];
    if (f.tipo === "linha") {
      const dx = cx - (f.x + f.x2) / 2;
      const dy = cy - (f.y + f.y2) / 2;
      Object.assign(f, { x: rx(f.x + dx), y: rx(f.y + dy), x2: rx(f.x2 + dx), y2: rx(f.y2 + dy) });
    } else Object.assign(f, { x: rx(cx), y: rx(cy) });
  } else if (kind === "i" && s.icones?.[index]) {
    s.icones[index].x = rx(cx);
    s.icones[index].y = rx(cy);
  } else if (kind === "s" && s.svgs?.[index]) {
    s.svgs[index].x = rx(cx);
    s.svgs[index].y = rx(cy);
  } else if (kind === "holes" && box) {
    const dx = cx - box.cx;
    const dy = cy - box.cy;
    s.furos = s.furos?.map((f) => ({ ...f, x: rx(f.x + dx), y: rx(f.y + dy) }));
    s.rasgos = s.rasgos?.map((f) => ({ ...f, x: rx(f.x + dx), y: rx(f.y + dy) }));
  }
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
  }
  return s;
}

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

export type Tool = "select" | "text" | "rect" | "circle" | "line";

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
  if (el) el[campo] = valor;
  // Furos: a correção vale para todos (são um grupo na interface).
  if (ref.tipo === "furo" && campo === "diametro") s.furos = s.furos?.map((f) => ({ ...f, diametro: valor }));
  return s;
}

// ------------------------------------------------------------------ SVG

/** Altura ÷ largura do desenho (1 se o arquivo não puder ser lido). */
export function svgAspect(conteudo: string) {
  try {
    const d = parseSvg(conteudo);
    return d.altura / d.largura;
  } catch {
    return 1;
  }
}

/**
 * Importa um arquivo SVG como elemento novo, centrado em (x, y). A largura começa no tamanho
 * natural do arquivo, limitada a 60% da placa (e ao que couber na altura).
 */
export function addSvg(spec: PlateSpecInput, conteudo: string, nome: string, x: number, y: number): [PlateSpecInput, ElementId] | { error: string } {
  let d;
  try {
    d = parseSvg(conteudo);
  } catch (e) {
    return { error: e instanceof SvgInvalido ? e.message : "This file is not a valid SVG." };
  }
  const s = structuredClone(spec);
  const sign = s.tipo !== "letreiro";
  const maxW = Math.min(s.largura * 0.6, (s.altura * 0.6 * d.largura) / d.altura);
  const largura = Math.max(5, Math.round(Math.min(d.largura, maxW) * 10) / 10);
  const rx = (v: number) => Math.round(v * 10) / 10;
  s.svgs = [...(s.svgs ?? []), { conteudo, nome: nome.replace(/\.svg$/i, "").slice(0, 60), x: rx(x), y: rx(y), largura, modo: sign ? "gravado" : "recorte", profundidade: 2 }];
  return [s, `s:${s.svgs.length - 1}`];
}
