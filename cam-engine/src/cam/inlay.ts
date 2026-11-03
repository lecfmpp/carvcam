import { fmt, type ElementRef, type Warning } from "../warnings.js";
import { area, difference, offset, union, type Region } from "../geometry/clip.js";
import type { CutElement, Layout } from "../layout.js";
import type { Inlay, MaterialId, PlateSpec, PlateSpecInput, Tool } from "../schema.js";

/**
 * V-carve inlay: the maths.
 *
 * Let S be the design, D the pocket depth, g the glue gap, F the gap between the boards and
 * t = tan(half angle of the V-bit).
 *
 * Pocket (female): V-carve S down to D. At depth z, the pocket wall is S shrunk by z·t.
 *
 * Plug (male): the mirrored design P stays up; the rest of the board is V-carved with start depth
 * s = D − g (the tip is already at s on the edge of P) down to s + F. With the start depth, the cone
 * reaches s·t into P at the surface: the top of the plug is P shrunk by s·t, and at a distance h
 * below the top the plug is P shrunk by (s − h)·t.
 *
 * Flipped and fitted, the top of the plug stops at depth s in the pocket (the walls touch: in both
 * parts the section at depth z is S shrunk by z·t). That leaves g = D − s for glue on the flat
 * bottom of the pocket, and the bottom of the plug board stays F above the base's surface.
 */
export interface InlayNumbers {
  /** tan(half angle). */
  tan: number;
  /** Depth the bit's cone reaches before the shank would touch (radius / tan). */
  cone: number;
  /** Plug start depth: D − g. */
  plugStart: number;
  /** Total cut depth on the plug: s + F. */
  plugDepth: number;
  /** How far the pocket wall slopes in over its depth (D·t). */
  wallWidth: number;
}

export function inlayNumbers(inlay: Pick<Inlay, "depth" | "glueGap" | "boardGap">, tool: Pick<Tool, "diameter" | "angle">): InlayNumbers {
  const tan = Math.tan(((tool.angle ?? 60) * Math.PI) / 360);
  const plugStart = Math.max(0, inlay.depth - inlay.glueGap);
  return {
    tan,
    cone: tool.diameter / 2 / tan,
    plugStart,
    plugDepth: plugStart + inlay.boardGap,
    wallWidth: inlay.depth * tan,
  };
}

/** What the generator cuts on one side of the inlay. */
export interface InlayPlan {
  label: string;
  /** Region V-carved (pocket: the design; plug: everything but the design). */
  region: Region;
  startDepth: number;
  depth: number;
  step: number;
  flatStep: number;
  /** Flat bottom the flat bit clears (null: the V-bit clears it all). */
  clearing: Region | null;
  /** Engraved elements that are not part of the inlay (cut as usual). */
  rest: CutElement[];
  /** Extra margin for the verifier: on the plug the bit goes a little past the board's edge. */
  outsideMargin: number;
}

const sameRef = (a: ElementRef | undefined, b: { type: string; index: number }) => !!a && a.type === b.type && a.index === b.index;

export function planInlay(spec: PlateSpec, layout: Layout, tool: Tool, cutTool: Tool, warnings: Warning[]): InlayPlan | null {
  const inlay = spec.inlay;
  if (!inlay) return null;
  if (tool.type !== "vbit") {
    warnings.push({
      code: "INLAY_NEEDS_VBIT",
      severity: "error",
      message: "A V-carve inlay needs a V-bit as the main bit.",
      suggestion: "Pick a 60° or 90° V-bit.",
    });
    return null;
  }
  const n = inlayNumbers(inlay, tool);
  const plug = inlay.part === "plug";
  const inInlay = (g: CutElement) => plug || !inlay.targets || inlay.targets.some((a) => sameRef(g.ref, a));
  const pieces = layout.engraved.filter(inInlay);
  const rest = layout.engraved.filter((g) => !inInlay(g));
  const design = union(...pieces.map((g) => g.region));
  if (area(design) <= 0) {
    warnings.push({ code: "NOTHING_TO_CUT", severity: "error", message: "The inlay has no closed shape." });
    return null;
  }

  const name = plug ? "plug" : "pocket";
  const depth = plug ? n.plugDepth : inlay.depth;
  const limit = Math.min(n.cone, tool.cutLength);
  if (depth > limit + 1e-6) {
    warnings.push({
      code: "INLAY_BIT_TOO_SMALL",
      severity: "error",
      message: `The V-bit's cone reaches ${fmt(limit)} mm deep; the ${name} needs ${fmt(depth)} mm.`,
      suggestion: plug ? "Use a shallower pocket or a smaller gap between the boards, or a bigger V-bit." : "Use a shallower pocket or a bigger V-bit.",
      data: { limit, depth },
    });
  }
  if (depth > spec.thickness - 1) {
    warnings.push({
      code: "INLAY_BOARD_TOO_THIN",
      severity: "error",
      message: `The ${name} is ${fmt(depth)} mm deep; the ${fmt(spec.thickness)} mm board needs at least 1 mm more under it.`,
      suggestion: `Use a board at least ${fmt(Math.ceil(depth + 1))} mm thick, or a shallower pocket.`,
      data: { depth, thickness: spec.thickness },
    });
  }

  // Plug: lower the whole board (and a little past its edge, so the edge is down too), otherwise
  // the leftover board would hit the base's surface before the plug is in.
  const outsideMargin = plug ? inlay.boardGap * n.tan + 0.5 : 0;
  const region = plug ? difference(offset(layout.part, outsideMargin), design) : design;
  const startDepth = plug ? n.plugStart : 0;
  // Ridges on the flat bottom (height = step / 2·tan): on the pocket, under half the glue gap;
  // on the plug, under a quarter of the board gap (that is waste that gets sawn off).
  const flatStep = plug ? Math.max(0.2, Math.min(2, (inlay.boardGap * n.tan) / 2)) : Math.max(0.1, Math.min(0.5, inlay.glueGap * n.tan));

  let clearing: Region | null = null;
  const zone = offset(region, -(depth - startDepth) * n.tan);
  if (inlay.clear && area(zone) > 1) {
    if (cutTool !== tool && cutTool.type === "straight") clearing = zone;
    else {
      warnings.push({
        code: "INLAY_NO_CLEARING",
        severity: "warning",
        message: "There is no flat bit to clear the flat bottom; the V-bit clears all of it (slower).",
        suggestion: "Turn on the second bit (a 1/8″ or 1/4″ flat bit) to clear the bottom faster.",
      });
    }
  }

  return {
    label: plug ? "inlay plug" : "inlay pocket",
    region,
    startDepth,
    depth,
    // Closer rings on the pocket: the ridge along the middle of thin strokes is half as tall.
    step: plug ? 0.2 : 0.1,
    flatStep,
    clearing,
    rest,
    outsideMargin,
  };
}

// ------------------------------------------------------------------ building both boards

export interface InlayParams {
  depth: number;
  glueGap: number;
  boardGap: number;
  clear: boolean;
  /** Plug board thickness, mm. */
  plugThickness: number;
  plugMaterial?: MaterialId;
  /** Board left around the design on the plug board, mm. Default: 10. */
  plugMargin?: number;
}

/** Box of an element in part mm (center and size), as the UI measures it. */
export interface ElementBox {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

export interface BuiltInlay {
  base: PlateSpecInput;
  plug: PlateSpecInput;
  /** Base point (part mm) → plug board point: x' = a − x, y' = y + b. */
  map: { a: number; b: number };
}

type Ref = { type: "text" | "icon" | "shape" | "svg"; index: number };
type El = Record<string, unknown> & { x?: number; y?: number; x2?: number; y2?: number; type?: string; mirror?: boolean };
const LIST = { text: "texts", shape: "shapes", icon: "icons", svg: "svgs" } as const;

/**
 * Builds both boards of an inlay from a board and the chosen elements:
 * - base: the same board, with the chosen elements turned into the pocket;
 * - plug: a board the size of the design (plus the margin) with the same elements mirrored.
 * `box` is each chosen element's box (for the plug board size, and to pin texts that the engine
 * would otherwise place by itself).
 */
export function buildInlay(spec: PlateSpecInput, targets: { ref: Ref; box: ElementBox }[], p: InlayParams): BuiltInlay {
  if (!targets.length) throw new Error("Choose at least one element for the inlay.");
  const mg = p.plugMargin ?? 10;
  const x0 = Math.min(...targets.map((a) => a.box.cx - a.box.w / 2));
  const x1 = Math.max(...targets.map((a) => a.box.cx + a.box.w / 2));
  const y0 = Math.min(...targets.map((a) => a.box.cy - a.box.h / 2));
  const y1 = Math.max(...targets.map((a) => a.box.cy + a.box.h / 2));
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const map = { a: r2(x1 + mg), b: r2(mg - y0) };
  const mx = (x: number) => r2(map.a - x);
  const my = (y: number) => r2(y + map.b);
  const params = { depth: p.depth, glueGap: p.glueGap, boardGap: p.boardGap, clear: p.clear };

  const base = structuredClone(spec);
  const plugEls: Record<string, El[]> = { texts: [], shapes: [], icons: [], svgs: [] };
  for (const { ref, box } of targets) {
    const list = (base as Record<string, unknown>)[LIST[ref.type]] as El[] | undefined;
    const el = list?.[ref.index];
    if (!el) continue;
    // On the base: engraved, without the modifiers that make no sense on an inlay.
    Object.assign(el, { mode: "engrave", depth: p.depth, operation: "normal", targets: undefined, hatch: undefined, copies: undefined });
    if (ref.type === "text" && (el.x === undefined || el.y === undefined)) Object.assign(el, { x: r2(box.cx), y: r2(box.cy) });

    const m = structuredClone(el);
    Object.assign(m, { depth: r2(Math.max(0.5, p.depth - p.glueGap + p.boardGap)) });
    if (m.type === "line") Object.assign(m, { x: mx(m.x!), y: my(m.y!), x2: mx(m.x2!), y2: my(m.y2!) });
    else Object.assign(m, { x: mx(m.x!), y: my(m.y!), mirror: !m.mirror });
    plugEls[LIST[ref.type]].push(m);
  }
  base.inlay = { part: "pocket", ...params, targets: targets.map((a) => a.ref) };

  const plug: PlateSpecInput = {
    type: "plate",
    width: r2(x1 - x0 + 2 * mg),
    height: r2(y1 - y0 + 2 * mg),
    thickness: p.plugThickness,
    material: p.plugMaterial ?? spec.material ?? "hardwood",
    edge: { type: "straight", radius: 0 },
    frame: 0,
    outerCutout: false,
    margin: 0,
    texts: plugEls.texts as PlateSpecInput["texts"],
    shapes: plugEls.shapes as PlateSpecInput["shapes"],
    icons: plugEls.icons as PlateSpecInput["icons"],
    svgs: plugEls.svgs as PlateSpecInput["svgs"],
    inlay: { part: "plug", ...params },
  };
  return { base, plug, map };
}
