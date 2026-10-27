import { curvePolyline, parseDrawing, InvalidSvg, type GenerateResult, type PlateSpecInput, type ElementRef } from "@gsender-next/cam-engine";

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

export type Text = NonNullable<PlateSpecInput["texts"]>[number];
export type Shape = NonNullable<PlateSpecInput["shapes"]>[number];
export type Icon = NonNullable<PlateSpecInput["icons"]>[number];
export type SvgEl = NonNullable<PlateSpecInput["svgs"]>[number];

export const FONTS: { id: NonNullable<Text["font"]>; name: string; tag: string; css: string; widthFactor: number }[] = [
  { id: "archivo-black", name: "Archivo Black", tag: "Easiest to cut", css: "'Archivo Black'", widthFactor: 0.86 },
  { id: "bebas-neue", name: "Bebas Neue", tag: "Condensed, thinner", css: "'Bebas Neue'", widthFactor: 0.46 },
  { id: "pacifico", name: "Pacifico", tag: "Script, letters join", css: "'Pacifico'", widthFactor: 0.82 },
];
export const fontOf = (id?: string) => FONTS.find((f) => f.id === id) ?? FONTS[0];

export const ICONS: { id: Icon["id"]; name: string }[] = [
  { id: "heart", name: "Heart" },
  { id: "star", name: "Star" },
  { id: "house", name: "House" },
  { id: "leaf", name: "Leaf" },
];

export const MODE_NAME: Record<string, string> = { relief: "raised", engrave: "engraved", cutout: "cut out" };
export const SHAPE_NAME: Record<Shape["type"], string> = { rectangle: "Rectangle", circle: "Circle", line: "Line", polygon: "Polygon", star: "Star", curve: "Curve" };
export const OP_NAME: Record<string, string> = { subtract: "subtracts", mask: "mask" };

export function idOf(ref: ElementRef | undefined): ElementId | null {
  if (!ref) return null;
  if (ref.type === "text") return `t:${ref.index}`;
  if (ref.type === "shape") return `f:${ref.index}`;
  if (ref.type === "icon") return `i:${ref.index}`;
  if (ref.type === "svg") return `s:${ref.index}`;
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
  const sign = spec.type !== "lettering";
  const rows: ElementRow[] = [];
  (spec.texts ?? []).forEach((t, i) =>
    rows.push({
      id: `t:${i}`,
      kind: "text",
      name: t.content || "Empty text",
      sub: `Text · ${fontOf(t.font).name} · ${t.size} mm · ${opOr(t, sign ? MODE_NAME[t.mode ?? "relief"] : "cut out")}`,
    }),
  );
  (spec.shapes ?? []).forEach((f, i) =>
    rows.push({
      id: `f:${i}`,
      kind: "shape",
      name: `${SHAPE_NAME[f.type]} ${i + 1}`,
      sub: `${SHAPE_NAME[f.type]} · ${shapeSize(f)} · ${opOr(f, MODE_NAME[f.mode ?? "engrave"])}`,
    }),
  );
  (spec.icons ?? []).forEach((c, i) =>
    rows.push({ id: `i:${i}`, kind: "icon", name: ICONS.find((x) => x.id === c.id)?.name ?? "Icon", sub: `Icon · ${c.size} mm · ${opOr(c, MODE_NAME[c.mode ?? "relief"])}` }),
  );
  (spec.svgs ?? []).forEach((v, i) =>
    rows.push({ id: `s:${i}`, kind: "svg", name: v.name || `Drawing ${i + 1}`, sub: `Drawing · ${r(v.width)} mm wide · ${opOr(v, sign ? MODE_NAME[v.mode ?? "engrave"] : "cut out")}` }),
  );
  const holes = spec.holes?.length ?? 0;
  const slots = spec.slots?.length ?? 0;
  if (holes || slots)
    rows.push({
      id: "holes",
      kind: "holes",
      name: slots ? "Hanging slot" : `${holes} mounting hole${holes > 1 ? "s" : ""}`,
      sub: slots ? `Slot · ${spec.slots![0].width} mm wide · cut through` : `Holes · ⌀ ${spec.holes![0].diameter} mm · cut through`,
    });
  return rows;
}

const opOr = (e: { operation?: string }, mode: string) => (e.operation && e.operation !== "normal" ? OP_NAME[e.operation] : mode);

function shapeSize(f: Shape) {
  if (f.type === "rectangle") return `${r(f.width)} × ${r(f.height)} mm`;
  if (f.type === "circle") return `⌀ ${r(f.diameter)} mm`;
  if (f.type === "polygon") return `${f.sides ?? 6} sides · ⌀ ${r(f.diameter)} mm`;
  if (f.type === "star") return `${f.points ?? 5} points · ⌀ ${r(f.diameter)} mm`;
  if (f.type === "curve") return `${f.nodes.length} points · ${f.closed ?? true ? "closed" : "open"}`;
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
  return spec.outerCutout ?? true ? (spec.margin ?? 10) : 0;
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
    const add = (ref: ElementRef | undefined, reg: Region) => {
      const id = idOf(ref);
      if (!id) return;
      fromEngine.set(id, [...(fromEngine.get(id) ?? []), ...reg]);
    };
    L.engraved.forEach((g) => add(g.ref, g.region));
    L.cutouts.forEach((v) => add(v.ref, v.region));
    L.relief?.items?.forEach((it) => add(it.ref, it.region));
    L.holes.forEach((f) => add(f.ref, f.region));
  }
  for (const [id, reg] of fromEngine) {
    const b = bounds(reg);
    if (b) out.set(id, { cx: (b.x0 + b.x1) / 2 - m, cy: (b.y0 + b.y1) / 2 - m, w: b.x1 - b.x0, h: b.y1 - b.y0 });
  }
  // Estimativas para o que o motor não separou (letreiro, ou resultado ainda não chegou).
  const W = spec.width;
  const H = spec.height;
  const texts = spec.texts ?? [];
  const auto = texts.map((t, i) => ({ t, i })).filter(({ t }) => t.x === undefined || t.y === undefined);
  const heights = auto.map(({ t }) => t.size * 1.15);
  const total = heights.reduce((s, h) => s + h, 0) + auto.slice(1).reduce((s, a) => s + a.t.size * 0.45, 0);
  let top = H / 2 + total / 2;
  auto.forEach(({ t, i }, k) => {
    const id: ElementId = `t:${i}`;
    const h = heights[k];
    if (!out.has(id)) out.set(id, { cx: W / 2, cy: top - h / 2, w: textWidth(t), h });
    top -= h + (auto[k + 1] ? auto[k + 1].t.size * 0.45 : 0);
  });
  texts.forEach((t, i) => {
    const id: ElementId = `t:${i}`;
    if (!out.has(id) && t.x !== undefined && t.y !== undefined) out.set(id, { cx: t.x, cy: t.y, w: textWidth(t), h: t.size * 1.15 });
  });
  (spec.shapes ?? []).forEach((f, i) => {
    const id: ElementId = `f:${i}`;
    if (out.has(id)) return;
    if (f.type === "rectangle") out.set(id, { cx: f.x, cy: f.y, w: f.width, h: f.height });
    else if (f.type === "circle" || f.type === "polygon" || f.type === "star") out.set(id, { cx: f.x, cy: f.y, w: f.diameter, h: f.diameter });
    else if (f.type === "curve") {
      const pts = curvePolyline(f.x, f.y, f.nodes, f.closed ?? true);
      const b = bounds([pts]);
      const e = f.closed ?? true ? 0 : (f.thickness ?? 3.2);
      if (b) out.set(id, { cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, w: b.x1 - b.x0 + e, h: b.y1 - b.y0 + e });
    } else {
      const e = f.thickness ?? 3.2;
      out.set(id, { cx: (f.x + f.x2) / 2, cy: (f.y + f.y2) / 2, w: Math.abs(f.x2 - f.x) + e, h: Math.abs(f.y2 - f.y) + e });
    }
  });
  (spec.icons ?? []).forEach((c, i) => {
    const id: ElementId = `i:${i}`;
    if (!out.has(id)) out.set(id, { cx: c.x, cy: c.y, w: c.size, h: c.size });
  });
  (spec.svgs ?? []).forEach((v, i) => {
    const id: ElementId = `s:${i}`;
    if (!out.has(id)) out.set(id, { cx: v.x, cy: v.y, w: v.width, h: v.width * svgAspect(v.content) });
  });
  if (!out.has("holes")) {
    const pts = [...(spec.holes ?? []).map((f) => ({ x: f.x, y: f.y, r: f.diameter / 2 })), ...(spec.slots ?? []).map((s) => ({ x: s.x, y: s.y, r: s.length / 2 }))];
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

export function textWidth(t: Text) {
  return Math.max(t.size * 0.5, (t.content || " ").length * t.size * fontOf(t.font).widthFactor);
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
    s.holes = s.holes?.map((f) => ({ ...f, x: rx(f.x + dx), y: rx(f.y + dy) }));
    s.slots = s.slots?.map((f) => ({ ...f, x: rx(f.x + dx), y: rx(f.y + dy) }));
    return s;
  }
  const el = elementOf(s, id) as (AnyEl & { x?: number; y?: number; x2?: number; y2?: number; type?: string }) | null;
  if (!el) return s;
  // Texto sem posição (empilhado pelo motor): passa a ter posição; o motor centraliza a caixa nela.
  if (kind === "t" && (el.x === undefined || el.y === undefined)) {
    Object.assign(el, { x: rx(cx), y: rx(cy) });
    return s;
  }
  const line = el.type === "line";
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
  if (kind === "t") s.texts = (s.texts ?? []).filter((_, i) => i !== index);
  if (kind === "f") s.shapes = (s.shapes ?? []).filter((_, i) => i !== index);
  if (kind === "i") s.icons = (s.icons ?? []).filter((_, i) => i !== index);
  if (kind === "s") s.svgs = (s.svgs ?? []).filter((_, i) => i !== index);
  if (kind === "holes") {
    s.holes = [];
    s.slots = [];
    return s;
  }
  // Os alvos de subtrair/máscara apontam por índice: tira o apagado e renumera os seguintes.
  const type = TYPE_OF[kind];
  for (const key of ["texts", "shapes", "icons", "svgs"] as const) {
    for (const el of (s[key] ?? []) as AnyEl[]) {
      if (!el.targets) continue;
      el.targets = el.targets.filter((a) => !(a.type === type && a.index === index)).map((a) => (a.type === type && a.index > index ? { ...a, index: a.index - 1 } : a));
    }
  }
  return s;
}

const TYPE_OF = { t: "text", f: "shape", i: "icon", s: "svg" } as const;
const KIND_OF = { text: "t", shape: "f", icon: "i", svg: "s" } as const;
export type Target = { type: (typeof TYPE_OF)[keyof typeof TYPE_OF]; index: number };

/** Referência do motor para um elemento da tela (null para o grupo de furos). */
export function refOf(id: ElementId): Target | null {
  const { kind, index } = parseId(id);
  return kind === "holes" ? null : { type: TYPE_OF[kind], index: index };
}
export const idOfTarget = (a: Target): ElementId => `${KIND_OF[a.type]}:${a.index}` as ElementId;

/** Duplica e devolve a especificação e o id da cópia (deslocada 8 mm). */
export function duplicateElement(spec: PlateSpecInput, id: ElementId, box: Box | undefined): [PlateSpecInput, ElementId | null] {
  const s = structuredClone(spec);
  const { kind, index } = parseId(id);
  if (kind === "t" && s.texts?.[index]) {
    const t = structuredClone(s.texts[index]);
    t.x = (box?.cx ?? spec.width / 2) + 8;
    t.y = (box?.cy ?? spec.height / 2) - 8;
    s.texts.push(t);
    return [s, `t:${s.texts.length - 1}`];
  }
  if (kind === "f" && s.shapes?.[index]) {
    const f = structuredClone(s.shapes[index]);
    f.x += 8;
    f.y -= 8;
    if (f.type === "line") {
      f.x2 += 8;
      f.y2 -= 8;
    }
    s.shapes.push(f);
    return [s, `f:${s.shapes.length - 1}`];
  }
  if (kind === "i" && s.icons?.[index]) {
    const c = structuredClone(s.icons[index]);
    c.x += 8;
    c.y -= 8;
    s.icons.push(c);
    return [s, `i:${s.icons.length - 1}`];
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

export type Tool = "select" | "text" | "rect" | "circle" | "polygon" | "star" | "line" | "pen";

/** Nó de curva livre (relativo à origem da curva; alças relativas ao nó). */
export type CurveNode = Extract<Shape, { type: "curve" }>["nodes"][number];

/**
 * Cria uma curva livre a partir dos nós desenhados com a caneta (em mm absolutos da peça).
 * A origem fica no primeiro nó.
 */
export function addCurve(spec: PlateSpecInput, nodes: CurveNode[], closed: boolean): [PlateSpecInput, ElementId] {
  const s = structuredClone(spec);
  const rx = (v: number) => Math.round(v * 100) / 100;
  const ox = rx(nodes[0].x);
  const oy = rx(nodes[0].y);
  const h = (v: number | undefined) => (v === undefined ? undefined : rx(v));
  const points = nodes.map((n) => {
    const p: CurveNode = { x: rx(n.x - ox), y: rx(n.y - oy) };
    if (n.ox || n.oy) Object.assign(p, { ox: h(n.ox), oy: h(n.oy), ix: h(n.ix), iy: h(n.iy) });
    return p;
  });
  const sign = s.type !== "lettering";
  const f: Shape = { type: "curve", x: ox, y: oy, nodes: points, closed, thickness: 3.2, mode: sign ? "engrave" : closed ? "cutout" : "engrave", depth: closed ? 2 : 1 };
  s.shapes = [...(s.shapes ?? []), f];
  return [s, `f:${s.shapes.length - 1}`];
}

/** Acrescenta um elemento novo com o centro em (x, y), mm da peça. */
export function addElement(spec: PlateSpecInput, tool: Exclude<Tool, "select" | "pen">, x: number, y: number): [PlateSpecInput, ElementId] {
  const s = structuredClone(spec);
  const rx = (v: number) => Math.round(v * 10) / 10;
  const sign = s.type !== "lettering";
  if (tool === "text") {
    s.texts = [...(s.texts ?? []), { content: "Text", font: "archivo-black", size: Math.max(10, Math.min(24, Math.round(s.height / 6))), mode: sign ? "engrave" : "cutout", depth: 2, x: rx(x), y: rx(y) }];
    return [s, `t:${s.texts.length - 1}`];
  }
  const mode = sign ? "engrave" : "cutout";
  const f: Shape =
    tool === "rect"
      ? { type: "rectangle", x: rx(x), y: rx(y), width: 40, height: 24, radius: 0, mode: mode, depth: 2 }
      : tool === "circle"
        ? { type: "circle", x: rx(x), y: rx(y), diameter: 30, mode: mode, depth: 2 }
        : tool === "polygon"
          ? { type: "polygon", x: rx(x), y: rx(y), diameter: 34, sides: 6, rotation: 0, mode: mode, depth: 2 }
          : tool === "star"
            ? { type: "star", x: rx(x), y: rx(y), diameter: 36, points: 5, inner: 0.45, rotation: 0, mode: mode, depth: 2 }
            : { type: "line", x: rx(x - 30), y: rx(y), x2: rx(x + 30), y2: rx(y), thickness: 4, mode: "engrave", depth: 1 };
  s.shapes = [...(s.shapes ?? []), f];
  return [s, `f:${s.shapes.length - 1}`];
}

/** Aplica uma correção do motor (campo/valor num elemento) à especificação. */
export function applyCorrection(spec: PlateSpecInput, ref: ElementRef, field: string, value: number): PlateSpecInput {
  const s = structuredClone(spec) as PlateSpecInput & Record<string, unknown>;
  const list: Record<string, unknown[] | undefined> = { text: s.texts, icon: s.icons, shape: s.shapes, svg: s.svgs, hole: s.holes, slot: s.slots };
  const arr = list[ref.type];
  const el = arr?.[ref.index] as Record<string, unknown> | undefined;
  if (el) {
    // Campo pode ser aninhado ("hatch.spacing").
    const path = field.split(".");
    let obj = el;
    for (const k of path.slice(0, -1)) obj = (obj[k] ??= {}) as Record<string, unknown>;
    obj[path[path.length - 1]] = value;
  }
  // Furos: a correção vale para todos (são um grupo na interface).
  if (ref.type === "hole" && field === "diameter") s.holes = s.holes?.map((f) => ({ ...f, diameter: value }));
  return s;
}

// ------------------------------------------------------------------ SVG

/** Altura ÷ largura do desenho (1 se o arquivo não puder ser lido). */
export function svgAspect(content: string) {
  try {
    const d = parseDrawing(content);
    return d.height / d.width;
  } catch {
    return 1;
  }
}

/**
 * Importa um arquivo SVG como elemento novo, centrado em (x, y). A largura começa no tamanho
 * natural do arquivo, limitada a 60% da placa (e ao que couber na altura).
 */
export function addSvg(spec: PlateSpecInput, content: string, name: string, x: number, y: number): [PlateSpecInput, ElementId, number] | { error: string } {
  let d;
  try {
    d = parseDrawing(content);
  } catch (e) {
    return { error: e instanceof InvalidSvg ? e.message : "This file is not a valid SVG or DXF." };
  }
  const s = structuredClone(spec);
  const sign = s.type !== "lettering";
  const maxW = Math.min(s.width * 0.6, (s.height * 0.6 * d.width) / d.height);
  const width = Math.max(5, Math.round(Math.min(d.width, maxW) * 10) / 10);
  const rx = (v: number) => Math.round(v * 10) / 10;
  s.svgs = [...(s.svgs ?? []), { content, name: name.replace(/\.(svg|dxf)$/i, "").slice(0, 60), x: rx(x), y: rx(y), width, mode: sign ? "engrave" : "cutout", depth: 2 }];
  return [s, `s:${s.svgs.length - 1}`, d.openPaths ?? 0];
}

// ------------------------------------------------------------------ generic element access

type AnyEl = Text | Shape | Icon | SvgEl;
const LIST = { t: "texts", f: "shapes", i: "icons", s: "svgs" } as const;

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
      ? { x0: 0, x1: spec.width, y0: 0, y1: spec.height }
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
export function bendOf(t: Text): number {
  if (!t.arc) return 0;
  const L = textWidth(t);
  return Math.max(-100, Math.min(100, Math.round(((L / t.arc) / Math.PI) * 100)));
}
export function arcFromBend(t: Text, bend: number): number | undefined {
  if (!bend) return undefined;
  const L = textWidth(t);
  return Math.round((L / ((bend / 100) * Math.PI)) * 10) / 10;
}
