import { ELEMENT_BY_ID, PlateSpecSchema, type GenerateResult, type PlateSpecInput } from "@carvcam/cam-engine";
import { bitById, materialById, MATERIALS, type Preset } from "../lib/catalog";
import type { Design } from "../state/design";
import { addSvg, deleteElement, elementBoxes, moveElement, setCopies, type Box, type ElementId } from "../screens/create/elements";
import { bitLine, bitsText, changeLine, describeDesign, fieldText, fontsText, labelOf, libraryText, r1 } from "./describe";
import { aidString, allAids, appIdOf, exists, listKey, listOf, parseAid, type AId, type AKind } from "./ids";
import { elementFields, ELEMENT_ARRAYS, EXCLUDED, SHAPE_TYPES } from "./schema";
import type { AssistantContext, Check, ProAction } from "./types";

/**
 * Applies the assistant's tool calls to a draft of the design. Every edit is validated against the
 * engine schema before it is kept; an invalid one leaves the draft untouched and returns an error
 * the model can act on. Nothing here talks to the machine.
 */

export interface Draft {
  ctx: AssistantContext;
  /** The design when the turn started (for the undo step and the change list). */
  before: Design;
  design: Design;
  /** Engine checks and layout of the latest verification, and the spec they belong to. */
  checks: Check[];
  layout: { spec: PlateSpecInput; result: GenerateResult | null } | null;
  changes: string[];
  question?: { question: string; options: string[] };
  action?: ProAction;
}

export type ToolOutcome = { ok: true; output: string } | { ok: false; error: string };

export function newDraft(ctx: AssistantContext, checks: Check[] = [], result: GenerateResult | null = null): Draft {
  return { ctx, before: ctx.design, design: structuredClone(ctx.design), checks, layout: result ? { spec: ctx.design.spec, result } : null, changes: [] };
}

export const changed = (d: Draft) => JSON.stringify(d.design) !== JSON.stringify(d.before);

// ------------------------------------------------------------------ boxes

/** Box of every element by assistant id. Uses the engine layout when it belongs to the current spec. */
export function boxesOf(d: Draft): Map<string, Box> {
  const spec = d.design.spec;
  const result = d.layout && JSON.stringify(d.layout.spec) === JSON.stringify(spec) ? d.layout.result : null;
  const app = elementBoxes(spec, result);
  const out = new Map<string, Box>();
  for (const a of allAids(spec)) {
    const id = appIdOf(a);
    if (id) {
      const b = app.get(id);
      if (b) out.set(aidString(a), b);
      continue;
    }
    const el = listOf(spec, a.kind)[a.index] as { x: number; y: number; diameter?: number; length?: number; width?: number; angle?: number };
    if (a.kind === "hole") out.set(aidString(a), { cx: el.x, cy: el.y, w: el.diameter ?? 5, h: el.diameter ?? 5 });
    else {
      const t = ((el.angle ?? 0) * Math.PI) / 180;
      const L = el.length ?? 10;
      const W = el.width ?? 5;
      out.set(aidString(a), { cx: el.x, cy: el.y, w: Math.abs(L * Math.cos(t)) + W, h: Math.abs(L * Math.sin(t)) + W });
    }
  }
  return out;
}

export const describe = (d: Draft) => describeDesign(d.design, d.ctx, boxesOf(d), d.checks);

// ------------------------------------------------------------------ helpers

const fail = (error: string): ToolOutcome => ({ ok: false, error });
const okOut = (output: string): ToolOutcome => ({ ok: true, output });

/** zod issue path ["texts", 0, "size"] → "text:0 size". */
function issuePath(path: PropertyKey[]): string {
  const kinds: Record<string, AKind> = { texts: "text", shapes: "shape", icons: "icon", svgs: "drawing", holes: "hole", slots: "slot" };
  const [head, idx, ...rest] = path.map(String);
  if (kinds[head] && idx !== undefined) return `${kinds[head]}:${idx}${rest.length ? ` ${rest.join(".")}` : ""}`;
  return path.map(String).join(".") || "design";
}

/** Validates a spec against the engine schema; returns a readable error or null. */
export function specError(spec: PlateSpecInput): string | null {
  const r = PlateSpecSchema.safeParse(spec);
  if (r.success) return null;
  return r.error.issues
    .slice(0, 6)
    .map((i) => `${issuePath(i.path)}: ${i.message}`)
    .join("; ");
}

/** Keeps a new design if it passes the engine schema. */
function commit(d: Draft, next: Design, lines: string[], output: string): ToolOutcome {
  const err = specError(next.spec);
  if (err) return fail(`Not applied, the design would be invalid: ${err}. Nothing was changed.`);
  d.design = next;
  d.changes.push(...lines);
  return okOut(output);
}

const withSpec = (d: Draft, spec: PlateSpecInput): Design => ({ ...d.design, spec });

function resolveIds(d: Draft, raw: unknown, opts: { kinds?: AKind[]; emptyMeansAll?: boolean } = {}): AId[] | string {
  const list = Array.isArray(raw) ? raw : [];
  const kinds = opts.kinds ?? ["text", "shape", "icon", "drawing", "hole", "slot"];
  if (!list.length) return opts.emptyMeansAll ? allAids(d.design.spec, kinds) : "Give at least one element id.";
  const out: AId[] = [];
  for (const raw1 of list) {
    const a = parseAid(String(raw1));
    if (!a) return `"${raw1}" is not an element id. Ids look like text:0, shape:2, icon:1, drawing:0, hole:3, slot:0.`;
    if (!exists(d.design.spec, a)) return `${aidString(a)} does not exist. Current elements: ${allAids(d.design.spec).map(aidString).join(", ") || "none"}.`;
    if (!kinds.includes(a.kind)) return `${aidString(a)} can't be used here (only ${kinds.join(", ")}).`;
    if (!out.some((x) => x.kind === a.kind && x.index === a.index)) out.push(a);
  }
  return out;
}

function one(d: Draft, raw: unknown, kinds?: AKind[]): AId | string {
  const r = resolveIds(d, [raw], { kinds });
  return typeof r === "string" ? r : r[0];
}

const rx = (v: number) => Math.round(v * 10) / 10;

function moveTo(spec: PlateSpecInput, a: AId, cx: number, cy: number, box: Box | undefined): PlateSpecInput {
  const id = appIdOf(a);
  if (id) return moveElement(spec, id, cx, cy, box);
  const s = structuredClone(spec);
  const el = listOf(s, a.kind)[a.index] as { x: number; y: number };
  el.x = rx(cx);
  el.y = rx(cy);
  return s;
}

function removeIds(spec: PlateSpecInput, ids: AId[]): PlateSpecInput {
  // Highest index first, so the others don't shift while removing.
  const order = [...ids].sort((a, b) => b.index - a.index);
  let s = spec;
  for (const a of order) {
    const id = appIdOf(a);
    if (id) s = deleteElement(s, id);
    else s = { ...s, [listKey(a.kind)]: listOf(s, a.kind).filter((_, i) => i !== a.index) };
  }
  return s;
}

const STYLE_TO_MODE = { raised: "relief", engraved: "engrave", cut_through: "cutout", part: "part" } as const;

function unknownKeys(input: Record<string, unknown>, allowed: string[]) {
  return Object.keys(input).filter((k) => !allowed.includes(k));
}

// ------------------------------------------------------------------ tools

type Handler = (d: Draft, input: Record<string, unknown>) => ToolOutcome;

const HANDLERS: Record<string, Handler> = {
  get_design: (d) => okOut(describe(d)),
  list_fonts: () => okOut(fontsText()),
  list_library: () => okOut(libraryText()),
  list_bits: (d) => okOut(bitsText(d.ctx.ownedBits)),

  add_element(d, input) {
    const el = input.element as Record<string, unknown> | undefined;
    if (!el || typeof el !== "object") return fail("Missing `element`.");
    const { kind, ...fields } = el as { kind?: string } & Record<string, unknown>;
    const spec = d.design.spec;
    if (kind === "library") {
      const lib = ELEMENT_BY_ID.get(String(fields.id));
      if (!lib) return fail(`Unknown library element "${fields.id}". Call list_library.`);
      const extra = unknownKeys(fields, elementFields("svg").filter((k) => k !== "content").concat("id"));
      if (extra.length) return fail(`Unknown field(s) for a library element: ${extra.join(", ")}.`);
      const fw = Math.max(30, spec.width - 16);
      const fh = Math.max(30, spec.height - 16);
      const width = typeof fields.width === "number" ? fields.width : lib.generate ? fw : undefined;
      const content = lib.generate ? lib.generate(width ?? fw, width ? (width * fh) / fw : fh) : lib.svg;
      const out = addSvg(spec, content, lib.name, Number(fields.x ?? spec.width / 2), Number(fields.y ?? spec.height / 2));
      if ("error" in out) return fail(out.error);
      const [next] = out;
      const v = next.svgs![next.svgs!.length - 1] as Record<string, unknown>;
      // Frames are drawn at their final size (scaling them would thin the strokes).
      if (lib.generate) v.width = rx(width ?? fw);
      else if (width === undefined) {
        const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(lib.svg);
        const aspect = vb ? Number(vb[2]) / Number(vb[1]) : 1;
        v.width = rx(Math.min(lib.width, spec.width * 0.85, (spec.height * 0.85) / aspect));
      }
      const { id: _id, ...rest } = fields;
      Object.assign(v, rest);
      const a: AId = { kind: "drawing", index: next.svgs!.length - 1 };
      return commit(d, withSpec(d, next), [`Added ${lib.name} (${aidString(a)}), ${r1(v.width as number)} mm wide`], `Added ${aidString(a)} (${lib.name}).`);
    }
    const target: Record<string, { k: AKind; fields: string }> = {
      text: { k: "text", fields: "text" },
      icon: { k: "icon", fields: "icon" },
      shape: { k: "shape", fields: `shape.${fields.type}` },
      hole: { k: "hole", fields: "hole" },
      slot: { k: "slot", fields: "slot" },
    };
    const t = target[String(kind)];
    if (!t) return fail(`Unknown kind "${kind}". Use text, icon, shape, library, hole or slot.`);
    if (t.k === "shape" && !SHAPE_TYPES.includes(String(fields.type))) return fail(`Unknown shape type "${fields.type}". Shapes: ${SHAPE_TYPES.join(", ")}.`);
    const extra = unknownKeys(fields, elementFields(t.fields as "text"));
    if (extra.length) return fail(`Unknown field(s) for ${t.fields.replace("shape.", "")}: ${extra.join(", ")}. Fields: ${elementFields(t.fields as "text").join(", ")}.`);
    const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null && v !== undefined));
    const key = listKey(t.k);
    const next = { ...spec, [key]: [...listOf(spec, t.k), clean] } as PlateSpecInput;
    const a: AId = { kind: t.k, index: listOf(spec, t.k).length };
    const label = labelOf(next, a);
    const where = typeof clean.x === "number" && typeof clean.y === "number" ? ` at (${r1(clean.x)}, ${r1(clean.y)}) mm` : "";
    const size = clean.size ?? clean.diameter ?? clean.width;
    return commit(d, withSpec(d, next), [`Added ${label}${size !== undefined ? `, ${fieldText(clean.size !== undefined ? "size" : clean.diameter !== undefined ? "diameter" : "width", size)}` : ""}${where}`], `Added ${aidString(a)}.`);
  },

  update_element(d, input) {
    const a = one(d, input.id);
    if (typeof a === "string") return fail(a);
    const changes = input.changes as Record<string, unknown> | undefined;
    if (!changes || typeof changes !== "object" || !Object.keys(changes).length) return fail("Give the fields to change in `changes`.");
    const spec = d.design.spec;
    const el = listOf(spec, a.kind)[a.index];
    const fieldsKey = a.kind === "shape" ? `shape.${el.type}` : a.kind === "drawing" ? "svg" : a.kind;
    const allowed = elementFields(fieldsKey as "text").filter((k) => k !== "type" && !(a.kind === "drawing" && k === "content"));
    const extra = unknownKeys(changes, allowed);
    if (extra.length)
      return fail(
        `${labelOf(spec, a)} has no field ${extra.join(", ")}.${extra.includes("type") ? " To change a shape's type, remove it and add a new one." : ""}${extra.includes("content") && a.kind === "drawing" ? ` ${EXCLUDED["svg.content"]}.` : ""} Fields: ${allowed.join(", ")}.`,
      );
    const next = structuredClone(el);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) delete next[k];
      else next[k] = v;
    }
    const list = listOf(spec, a.kind).map((x, i) => (i === a.index ? next : x));
    return commit(d, withSpec(d, { ...spec, [listKey(a.kind)]: list } as PlateSpecInput), [changeLine(labelOf(spec, a), changes)], `Updated ${aidString(a)}.`);
  },

  remove_element(d, input) {
    const ids = resolveIds(d, input.ids);
    if (typeof ids === "string") return fail(ids);
    const spec = d.design.spec;
    const lines = ids.map((a) => `Removed ${labelOf(spec, a)}`);
    const next = removeIds(spec, ids);
    const after = allAids(next).map(aidString).join(", ") || "none";
    return commit(d, withSpec(d, next), lines, `Removed ${ids.map(aidString).join(", ")}. Element ids now: ${after}.`);
  },

  move_element(d, input) {
    const a = one(d, input.id);
    if (typeof a === "string") return fail(a);
    const x = Number(input.x);
    const y = Number(input.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return fail("x and y must be numbers (mm).");
    const box = boxesOf(d).get(aidString(a));
    const next = moveTo(d.design.spec, a, x, y, box);
    return commit(d, withSpec(d, next), [`${labelOf(d.design.spec, a)} → moved to (${r1(x)}, ${r1(y)}) mm`], `Moved ${aidString(a)}; its center is now (${r1(x)}, ${r1(y)}).`);
  },

  align_elements(d, input) {
    const ids = resolveIds(d, input.ids, { emptyMeansAll: true });
    if (typeof ids === "string") return fail(ids);
    if (!ids.length) return fail("There are no elements to align.");
    const H = String(input.horizontal ?? "keep");
    const V = String(input.vertical ?? "keep");
    const inset = Math.max(0, Number(input.inset) || 0);
    const spec = d.design.spec;
    const boxes = boxesOf(d);
    const items = ids.map((a) => ({ a, b: boxes.get(aidString(a)) })).filter((x): x is { a: AId; b: Box } => !!x.b);
    const g = {
      x0: Math.min(...items.map(({ b }) => b.cx - b.w / 2)),
      x1: Math.max(...items.map(({ b }) => b.cx + b.w / 2)),
      y0: Math.min(...items.map(({ b }) => b.cy - b.h / 2)),
      y1: Math.max(...items.map(({ b }) => b.cy + b.h / 2)),
    };
    let s = spec;
    if (input.to === "board" || items.length === 1) {
      const dx = H === "left" ? inset - g.x0 : H === "right" ? spec.width - inset - g.x1 : H === "center" ? spec.width / 2 - (g.x0 + g.x1) / 2 : 0;
      const dy = V === "bottom" ? inset - g.y0 : V === "top" ? spec.height - inset - g.y1 : V === "center" ? spec.height / 2 - (g.y0 + g.y1) / 2 : 0;
      for (const { a, b } of items) s = moveTo(s, a, b.cx + dx, b.cy + dy, b);
    } else {
      for (const { a, b } of items) {
        const cx = H === "left" ? g.x0 + b.w / 2 : H === "right" ? g.x1 - b.w / 2 : H === "center" ? (g.x0 + g.x1) / 2 : b.cx;
        const cy = V === "bottom" ? g.y0 + b.h / 2 : V === "top" ? g.y1 - b.h / 2 : V === "center" ? (g.y0 + g.y1) / 2 : b.cy;
        s = moveTo(s, a, cx, cy, b);
      }
    }
    const what = ids.length === allAids(spec).length && ids.length > 1 ? "Everything" : ids.map((a) => labelOf(spec, a)).join(", ");
    const how = [H !== "keep" ? H : "", V !== "keep" ? V : ""].filter(Boolean).join(" / ") || "unchanged";
    return commit(d, withSpec(d, s), [`${what} → aligned ${how}${input.to === "board" || items.length === 1 ? " on the sign" : " with each other"}`], `Aligned ${ids.map(aidString).join(", ")}.`);
  },

  set_board(d, input) {
    const allowed = Object.keys(PlateSpecSchema.shape).filter((k) => !(ELEMENT_ARRAYS as readonly string[]).includes(k) && !EXCLUDED[`board.${k}`]);
    const extra = unknownKeys(input, allowed);
    if (extra.length) return fail(`Unknown board field(s): ${extra.join(", ")}. Fields: ${allowed.join(", ")}.${extra.includes("inlay") ? ` ${EXCLUDED["board.inlay"]}.` : ""}`);
    if (!Object.keys(input).length) return fail("Give at least one board field to change.");
    const next = structuredClone(d.design);
    const { material, ...rest } = input;
    if (material !== undefined) {
      const m = MATERIALS.find((x) => x.id.toLowerCase() === String(material).toLowerCase());
      if (!m) return fail(`Unknown material "${material}". Materials: ${MATERIALS.map((x) => x.id).join(", ")}.`);
      next.material = m.id;
      next.spec.material = m.engine;
    }
    // The edge is merged, so "make the edge rounded" keeps the radius (and the other way round).
    if (rest.edge && typeof rest.edge === "object") rest.edge = { ...(next.spec.edge ?? {}), ...(rest.edge as object) };
    Object.assign(next.spec, rest);
    const lines = [changeLine(d.design.spec.type === "lettering" ? "Board" : "Sign", { ...(material !== undefined ? { material: materialById(next.material).id } : {}), ...rest })];
    return commit(d, next, lines, `Board updated: ${r1(next.spec.width)} × ${r1(next.spec.height)} × ${r1(next.spec.thickness)} mm ${next.material}.`);
  },

  set_style(d, input) {
    const ids = resolveIds(d, input.ids, { kinds: ["text", "shape", "icon", "drawing"], emptyMeansAll: true });
    if (typeof ids === "string") return fail(ids);
    if (!ids.length) return fail("There are no elements to style.");
    const style = String(input.style);
    const depth = Number(input.depth) || 0;
    if (style === "keep" && !depth) return fail("Nothing to change: give a style or a depth.");
    if (depth < 0) return fail("Depth must be positive (mm).");
    const mode = style === "keep" ? undefined : STYLE_TO_MODE[style as keyof typeof STYLE_TO_MODE];
    if (style !== "keep" && !mode) return fail(`Unknown style "${style}".`);
    const fields = { ...(mode ? { mode } : {}), ...(depth ? { depth } : {}) };
    let s = d.design.spec;
    for (const a of ids) s = { ...s, [listKey(a.kind)]: listOf(s, a.kind).map((x, i) => (i === a.index ? { ...x, ...fields } : x)) };
    const spec = d.design.spec;
    const who = ids.length === allAids(spec, ["text", "shape", "icon", "drawing"]).length && ids.length > 1 ? "All elements" : ids.map((a) => labelOf(spec, a)).join(", ");
    return commit(d, withSpec(d, s), [changeLine(who, fields)], `Styled ${ids.map(aidString).join(", ")}.`);
  },

  set_text(d, input) {
    const a = one(d, input.id, ["text"]);
    if (typeof a === "string") return fail(a);
    const fields: Record<string, unknown> = {};
    if (typeof input.content === "string" && input.content.trim()) fields.content = input.content.trim();
    if (input.font && input.font !== "keep") fields.font = input.font;
    if (Number(input.size) > 0) fields.size = Number(input.size);
    if (!Object.keys(fields).length) return fail("Nothing to change: give new words, a font or a size.");
    const spec = d.design.spec;
    const texts = listOf(spec, "text").map((x, i) => (i === a.index ? { ...x, ...fields } : x));
    return commit(d, withSpec(d, { ...spec, texts } as PlateSpecInput), [changeLine(labelOf(spec, a), fields)], `Updated ${aidString(a)}.`);
  },

  set_copies(d, input) {
    const ids = resolveIds(d, input.ids, { kinds: ["text", "shape", "icon", "drawing"] });
    if (typeof ids === "string") return fail(ids);
    const rows = Math.round(Number(input.rows));
    const cols = Math.round(Number(input.cols));
    if (!(rows >= 1 && rows <= 40 && cols >= 1 && cols <= 40)) return fail("rows and cols must be 1–40.");
    if (rows * cols > 400) return fail("At most 400 copies.");
    const spec = d.design.spec;
    const appIds = ids.map((a) => appIdOf(a)!) as ElementId[];
    const label = ids.map((a) => labelOf(spec, a)).join(" + ");
    if (rows * cols === 1) return commit(d, withSpec(d, setCopies(spec, appIds, null)), [`${label} → copies removed`], "Copies removed.");
    const boxes = boxesOf(d);
    const bs = ids.map((a) => boxes.get(aidString(a))).filter((b): b is Box => !!b);
    const g = bs.length
      ? { x0: Math.min(...bs.map((b) => b.cx - b.w / 2)), x1: Math.max(...bs.map((b) => b.cx + b.w / 2)), y0: Math.min(...bs.map((b) => b.cy - b.h / 2)), y1: Math.max(...bs.map((b) => b.cy + b.h / 2)) }
      : { x0: 0, x1: 20, y0: 0, y1: 20 };
    const dx = Number(input.dx) > 0 ? Number(input.dx) : rx(g.x1 - g.x0 + 6);
    const dy = Number(input.dy) > 0 ? Number(input.dy) : rx(g.y1 - g.y0 + 6);
    const texts = Array.isArray(input.texts) ? input.texts.map((t) => String(t).trim()).filter(Boolean) : [];
    if (texts.length > rows * cols - 1) return fail(`${texts.length} texts for ${rows * cols - 1} copies: the original keeps its own words and \`texts\` lists copy 2 onwards. Use more rows/cols or fewer texts.`);
    if (texts.some((t) => t.length > 60)) return fail("Each copy text can be at most 60 characters.");
    const alternate = input.alternate === true;
    const pivot = alternate && ids.length > 1 ? { x: rx((g.x0 + g.x1) / 2), y: rx((g.y0 + g.y1) / 2) } : undefined;
    const c = { rows, cols, dx, dy, ...(alternate ? { alternate } : {}), ...(pivot ? { pivot } : {}), ...(texts.length ? { texts } : {}) };
    const next = setCopies(spec, appIds, c);
    const names = texts.length ? `, names: ${texts.join(", ")}` : "";
    return commit(d, withSpec(d, next), [`${label} → ${rows * cols} copies (${rows} × ${cols}, ${r1(dx)} × ${r1(dy)} mm apart${alternate ? ", every other one turned" : ""}${names})`], `Copies set on ${ids.map(aidString).join(", ")}.`);
  },

  select_bit(d, input) {
    const slot = input.slot === "second" ? "second" : "main";
    const id = String(input.bit_id ?? "").trim();
    if (slot === "second" && !id) {
      if (!d.design.useBit2) return okOut("The second bit is already off.");
      return commit(d, { ...d.design, useBit2: false }, ["Second bit → off (one bit does everything)"], "Second bit turned off.");
    }
    const b = bitById(id);
    if (!b || !b.carvcam || b.notForSigns || b.profile === "surfacing") return fail(`"${id}" is not a bit CarvCAM can carve signs with. Call list_bits.`);
    if (!d.ctx.ownedBits.includes(b.id))
      return fail(`${b.name} is not in the user's My bits, so it can't be selected. Owned: ${d.ctx.ownedBits.join(", ") || "none"}. Tell the user to add it under Workshop → My bits if they have it.`);
    if (slot === "main") return commit(d, { ...d.design, bit: b.id }, [`Main bit → ${b.name}`], `Main bit is now ${bitLine(b, b.id)}.`);
    return commit(d, { ...d.design, bit2: b.id, useBit2: true }, [`Second bit (cutouts and holes) → ${b.name}`], `Second bit is now ${bitLine(b, b.id)}.`);
  },

  set_speed(d, input) {
    const p = String(input.preset) as Preset;
    if (!["fast", "balanced", "detailed"].includes(p)) return fail("Preset must be fast, balanced or detailed.");
    return commit(d, { ...d.design, preset: p }, [`Speed → ${p}`], `Speed preset is now ${p}.`);
  },

  set_tabs(d, input) {
    const count = Math.round(Number(input.count));
    if (!(count >= 0 && count <= 12)) return fail("count must be 0–12.");
    const height = Number(input.height) > 0 ? Number(input.height) : d.design.tabs.height;
    const width = Number(input.width) > 0 ? Number(input.width) : d.design.tabs.width;
    if (height >= d.design.spec.thickness) return fail(`Tabs must be lower than the board (${d.design.spec.thickness} mm).`);
    const tabs = { count, height, width, mode: "auto" as const };
    return commit(d, { ...d.design, tabs }, [count ? `Tabs → ${count}, ${r1(height)} mm tall, ${r1(width)} mm wide` : "Tabs → none"], `Tabs: ${count}, ${r1(height)} mm tall, ${r1(width)} mm wide.`);
  },

  ask_clarifying_question(d, input) {
    const question = String(input.question ?? "").trim();
    if (!question) return fail("Give the question.");
    const options = (Array.isArray(input.options) ? input.options : []).map((o) => String(o).trim()).filter(Boolean).slice(0, 4);
    d.question = { question, options };
    return okOut("The question is shown to the user with the options. End your turn now without changing anything else; repeat the question in one short sentence.");
  },

  open_pro_feature(d, input) {
    const feature = String(input.feature);
    if (feature !== "inlay" && feature !== "batch" && feature !== "cost") return fail("feature must be inlay, batch or cost.");
    let elementIds: string[] = [];
    if (feature === "inlay") {
      const ids = resolveIds(d, input.ids, { kinds: ["text", "shape", "icon", "drawing"], emptyMeansAll: true });
      if (typeof ids === "string") return fail(ids);
      elementIds = ids.map((a) => appIdOf(a)!);
    }
    d.action = { feature, elementIds };
    const where = feature === "inlay" ? "the inlay wizard" : `the ${feature === "batch" ? "Batch" : "Cost"} panel in Prepare`;
    return okOut(
      d.ctx.pro
        ? `The user gets a button that opens ${where}. Tell them in one sentence; they finish it there.`
        : `The user does not have Pro: the button opens ${where}, which explains the feature and offers the upgrade. Say that in one sentence; do not try to do the Pro feature's work with other tools.`,
    );
  },
};

/** Applies one tool call to the draft. Unknown tools and thrown errors come back as errors. */
export function runTool(d: Draft, name: string, input: unknown): ToolOutcome {
  const h = HANDLERS[name];
  if (!h) return fail(`Unknown tool "${name}".`);
  if (input === null || typeof input !== "object" || Array.isArray(input)) return fail("Tool input must be an object.");
  try {
    return h(d, input as Record<string, unknown>);
  } catch (e) {
    return fail(`Could not apply: ${e instanceof Error ? e.message : String(e)}. Nothing was changed.`);
  }
}

export const HANDLED_TOOLS = Object.keys(HANDLERS);
