import type opentype from "opentype.js";
import { fmt, type Warning, type ElementRef } from "./warnings.js";
import { area, bounds, difference, intersection, offset, translate, union, type Region } from "./geometry/clip.js";
import { circle, curve, icon, plateOutline, polygon, slot, star, stroke } from "./geometry/shapes.js";
import { centerAt, textToRegion } from "./geometry/text.js";
import { parseDrawing } from "./drawing.js";
import { placeSvg, InvalidSvg } from "./svg.js";
import type { FontId, Machine, Mode, PlateSpec, Tool } from "./schema.js";

type Mods = {
  offset: number;
  outline?: { distance: number; width: number };
  operation: "normal" | "subtract" | "mask";
  targets?: { type: "text" | "icon" | "shape" | "svg"; index: number }[];
  hatch?: { spacing: number; angle: number };
};

export interface CutElement {
  /** E.g. "text 1 (Ana's House)", "icon 2 (heart)". */
  label: string;
  ref?: ElementRef;
  /** Relief background only: the raised elements, to know which one a warning refers to. */
  items?: { ref: ElementRef; region: Region }[];
  region: Region;
  depth: number;
  /** Engrave with hatch lines instead of clearing the whole area. */
  hatch?: { spacing: number; angle: number };
}

/** Everything in stock coordinates: X0 Y0 at the bottom-left corner, Z0 on the top surface. */
export interface Layout {
  stock: { width: number; height: number; thickness: number };
  /** Outline of the finished part. */
  part: Region;
  engraved: CutElement[];
  /** Background to clear around the relief (raised) elements. */
  relief: CutElement | null;
  /** Through-cut (stencil) elements inside the sign. */
  cutouts: CutElement[];
  holes: CutElement[];
  /** Outer outline to profile cut (bit on the outside). Null when there is no cutout. */
  profile: CutElement | null;
  warnings: Warning[];
}

export type FontMap = Partial<Record<FontId, opentype.Font>>;

const THROUGH = 0.3; // mm past the thickness on through cuts (goes into the spoilboard)

export function buildLayout(spec: PlateSpec, fonts: FontMap, tool: Tool, cutTool: Tool, machine: Machine): Layout {
  const warnings: Warning[] = [];
  const m = spec.outerCutout ? spec.margin : 0;
  const stock = { width: spec.width + 2 * m, height: spec.height + 2 * m, thickness: spec.thickness };
  const through = spec.thickness + THROUGH;

  if (stock.width > machine.travelX || stock.height > machine.travelY) {
    warnings.push({
      code: "PART_LARGER_THAN_MACHINE",
      severity: "error",
      message: `The stock (${fmt(stock.width)} × ${fmt(stock.height)} mm) is larger than the machine's work area (${fmt(machine.travelX)} × ${fmt(machine.travelY)} mm).`,
      suggestion: "Make the sign smaller or split the project into parts.",
    });
  }
  if (spec.thickness > cutTool.cutLength && (spec.outerCutout || spec.type === "lettering")) {
    warnings.push({
      code: "TOOL_TOO_SHORT",
      severity: "error",
      message: `The cutout bit cuts up to ${fmt(cutTool.cutLength)} mm deep, but the material is ${fmt(spec.thickness)} mm thick.`,
      suggestion: "Use a longer bit or thinner material.",
      data: { needed: Math.round(through * 10) / 10, cutLength: cutTool.cutLength, role: cutTool === tool ? "main" : "cutout" },
    });
  }

  // ---- Elements (text and icons) in part coordinates ----
  type Placed = { label: string; region: Region; mode: Mode; depth: number; size: number; idx: number; type: "text" | "icon" | "shape" | "svg"; mods: Mods };
  let placed: Placed[] = [];

  const autoTexts: { idx: number; region: Region; size: number }[] = [];
  spec.texts.forEach((t, i) => {
    const font = fonts[t.font];
    if (!font) {
      warnings.push({ code: "FONT_UNAVAILABLE", severity: "error", message: `The font "${t.font}" was not loaded.`, element: { type: "text", index: i }, data: { font: t.font } });
      return;
    }
    const raw = textToRegion(font, t.content, t.size, t.arc || undefined);
    if (t.x !== undefined && t.y !== undefined) {
      placed.push({ label: `text ${i + 1} (${t.content})`, region: centerAt(raw, t.x, t.y), mode: t.mode, depth: t.depth, size: t.size, idx: i, type: "text", mods: t });
    } else {
      autoTexts.push({ idx: i, region: raw, size: t.size });
    }
  });

  // Stack the texts that have no position, centered on the sign, in the order they came.
  if (autoTexts.length) {
    const heights = autoTexts.map((a) => {
      const b = bounds(a.region);
      return b.maxY - b.minY;
    });
    const gaps = autoTexts.slice(1).map((a) => a.size * 0.45);
    const total = heights.reduce((s, h) => s + h, 0) + gaps.reduce((s, g) => s + g, 0);
    let top = spec.height / 2 + total / 2;
    autoTexts.forEach((a, k) => {
      const cy = top - heights[k] / 2;
      const t = spec.texts[a.idx];
      placed.push({ label: `text ${a.idx + 1} (${t.content})`, region: centerAt(a.region, spec.width / 2, cy), mode: t.mode, depth: t.depth, size: t.size, idx: a.idx, type: "text", mods: t });
      top -= heights[k] + (gaps[k] ?? 0);
    });
  }

  spec.shapes.forEach((f, i) => {
    const name = { rectangle: "rectangle", circle: "circle", line: "line", polygon: "polygon", star: "star", curve: "curve" }[f.type];
    if (f.type === "curve") {
      const region = curve(f.x, f.y, f.nodes, f.closed, f.thickness);
      const b = region.length ? bounds(region) : null;
      const size = f.closed && b ? Math.min(b.maxX - b.minX, b.maxY - b.minY) : f.thickness;
      placed.push({ label: `${name} ${i + 1}`, region, mode: f.mode, depth: f.depth, size, idx: i, type: "shape", mods: f });
      return;
    }
    const region =
      f.type === "rectangle"
        ? plateOutline(f.x - f.width / 2, f.y - f.height / 2, f.width, f.height, f.radius > 0 ? "rounded" : "straight", f.radius)
        : f.type === "circle"
          ? circle(f.x, f.y, f.diameter / 2)
          : f.type === "polygon"
            ? polygon(f.x, f.y, f.diameter / 2, f.sides, f.rotation)
            : f.type === "star"
              ? star(f.x, f.y, f.diameter / 2, f.points, f.inner, f.rotation)
              : stroke(f.x, f.y, f.x2, f.y2, f.thickness);
    const size = f.type === "rectangle" ? Math.min(f.width, f.height) : f.type === "line" ? f.thickness : f.diameter;
    placed.push({ label: `${name} ${i + 1}`, region, mode: f.mode, depth: f.depth, size, idx: i, type: "shape", mods: f });
  });

  spec.svgs.forEach((sv, i) => {
    const name = sv.name ? `drawing ${i + 1} (${sv.name})` : `drawing ${i + 1}`;
    try {
      const d = parseDrawing(sv.content);
      // A drawing's "size" is its width: that is the field the suggested fix adjusts.
      placed.push({ label: name, region: placeSvg(d, sv.x, sv.y, sv.width), mode: sv.mode, depth: sv.depth, size: sv.width, idx: i, type: "svg", mods: sv });
    } catch (e) {
      warnings.push({
        code: "INVALID_SVG",
        severity: "error",
        message: `Could not read ${name}: ${e instanceof InvalidSvg ? e.message : "invalid file."}`,
        suggestion: "Export it again as a plain SVG or DXF (text converted to curves), or delete this drawing.",
        element: { type: "svg", index: i },
      });
    }
  });

  spec.icons.forEach((ic, i) => {
    placed.push({ label: `icon ${i + 1} (${ic.id})`, region: icon(ic.id, ic.x, ic.y, ic.size), mode: ic.mode, depth: ic.depth, size: ic.size, idx: i, type: "icon", mods: ic });
  });

  placed = applyModifiers(placed, warnings);

  const toBlock = (r: Region) => translate(r, m, m);

  // ---- Cut-out lettering: the letters themselves are the part ----
  if (spec.type === "lettering") {
    const localPart = union(...placed.map((p) => p.region));
    const box = { width: spec.width, height: spec.height };
    checkFit(localPart, box, "the lettering", placed.map((p) => p.size), warnings);
    const part = toBlock(localPart);
    if (area(part) <= 0) warnings.push({ code: "NOTHING_TO_CUT", severity: "error", message: "The lettering has no letters or icons." });
    return {
      stock,
      part,
      engraved: [],
      relief: null,
      cutouts: [],
      holes: buildHoles(spec, cutTool, part, m, through, warnings),
      profile: { label: "lettering outline", region: part, depth: through },
      warnings,
    };
  }

  // ---- Sign ----
  const localPart = plateOutline(0, 0, spec.width, spec.height, spec.edge.type, spec.edge.radius);
  const part = toBlock(localPart);
  const hasRelief = placed.some((p) => p.mode === "relief");
  const inner = hasRelief && spec.frame > 0 ? offset(localPart, -spec.frame) : offset(localPart, -1);

  for (const p of placed) {
    const ref = { type: p.type, index: p.idx } as ElementRef;
    checkFit(p.region, null, p.label, [p.size], warnings, inner, ref);
    if (p.mode !== "cutout" && p.depth >= spec.thickness) {
      warnings.push({
        code: "DEPTH_EXCEEDS",
        severity: "error",
        message: `The depth of ${p.label} (${fmt(p.depth)} mm) would go through the ${fmt(spec.thickness)} mm material.`,
        suggestion: `Use at most ${fmt(spec.thickness * 0.6)} mm, or choose "cutout" mode.`,
        element: ref,
        fix: { element: ref, field: "depth", value: Math.floor(spec.thickness * 0.6 * 10) / 10 },
      });
    }
    if (p.mode !== "cutout" && p.depth > tool.cutLength) {
      warnings.push({
        code: "TOOL_TOO_SHORT",
        severity: "error",
        message: `The bit cuts up to ${fmt(tool.cutLength)} mm deep, and ${p.label} needs ${fmt(p.depth)} mm.`,
        element: ref,
        data: { needed: p.depth, cutLength: tool.cutLength, role: "main" },
      });
    }
    if (tool.type === "vbit" && p.mode !== "engrave") {
      warnings.push({
        code: "VBIT_ENGRAVE_ONLY",
        severity: "error",
        message: `A V-bit can only engrave. ${capitalize(p.label)} is in "${p.mode}" mode.`,
        suggestion: "Switch to a straight bit or set the element to engrave.",
        element: ref,
      });
    }
  }

  const engraved: CutElement[] = placed
    .filter((p) => p.mode === "engrave")
    .map((p) => ({ label: p.label, ref: { type: p.type, index: p.idx }, region: toBlock(intersection(p.region, localPart)), depth: p.depth, hatch: p.mods.hatch }));

  let relief: CutElement | null = null;
  const reliefItems = placed.filter((p) => p.mode === "relief");
  if (reliefItems.length) {
    const depths = [...new Set(reliefItems.map((p) => p.depth))];
    const depth = Math.max(...depths);
    if (depths.length > 1) {
      warnings.push({
        code: "DIFFERENT_DEPTHS",
        severity: "warning",
        message: `The relief elements ask for different depths; all of them will use ${fmt(depth)} mm, because there is only one background.`,
      });
    }
    // Without a frame, the background runs to the edge (and a little past it, so no lip is left).
    const field = spec.frame > 0 ? inner : offset(localPart, cutTool.diameter / 2 + 0.5);
    const floor = difference(field, union(...reliefItems.map((p) => p.region)));
    relief = {
      label: "the relief background",
      region: toBlock(floor),
      depth: depth,
      items: reliefItems.map((p) => ({ ref: { type: p.type, index: p.idx }, region: toBlock(p.region) })),
    };

    // An engraving that lands on the cleared background and is shallower than it simply disappears.
    for (const p of placed) {
      if (p.mode !== "engrave" || p.depth > depth) continue;
      const total = area(p.region);
      if (total <= 0) continue;
      const covered = area(intersection(p.region, floor)) / total;
      if (covered < 0.5) continue;
      const ref = { type: p.type, index: p.idx } as ElementRef;
      const newDepth = Math.round((depth + 1) * 10) / 10;
      warnings.push({
        code: "ENGRAVED_IN_FLOOR",
        severity: "warning",
        message: `${capitalize(p.label)} sits on the cleared background (${fmt(depth)} mm); engraved at ${fmt(p.depth)} mm, it will not show.`,
        suggestion: `Place it on top of a relief element, make it relief, or engrave it deeper (${fmt(newDepth)} mm).`,
        element: ref,
        fix: newDepth < spec.thickness ? { element: ref, field: "depth", value: newDepth } : undefined,
      });
    }
  }

  const cutouts: CutElement[] = placed
    .filter((p) => p.mode === "cutout")
    .map((p) => {
      const r = intersection(p.region, inner);
      const islands = r.filter((path) => pathIsHole(path)).length;
      if (islands > 0) {
        warnings.push({
          code: "LOOSE_ISLANDS",
          severity: "warning",
          message: `${capitalize(p.label)} has ${islands} island(s) (like the center of an "o") that will fall out when cut.`,
          suggestion: "Use a stencil font, or set this element to relief or engrave.",
          element: { type: p.type, index: p.idx },
        });
      }
      return { label: p.label, ref: { type: p.type, index: p.idx } as ElementRef, region: toBlock(r), depth: through };
    });

  const holes = buildHoles(spec, cutTool, part, m, through, warnings);
  const profile = spec.outerCutout ? { label: "sign outline", region: part, depth: through } : null;

  if (!engraved.length && !relief && !cutouts.length && !holes.length && !profile) {
    warnings.push({ code: "NOTHING_TO_CUT", severity: "error", message: "There is nothing to cut on this sign." });
  }

  return { stock, part, engraved, relief, cutouts, holes, profile, warnings };
}

/**
 * Applies each element's modifiers: offset, outline ring and the operations between
 * elements (subtract / mask). Elements that subtract or mask are not cut themselves.
 */
function applyModifiers<P extends { label: string; region: Region; type: string; idx: number; mods: Mods }>(placed: P[], warnings: Warning[]): P[] {
  const shaped = placed.map((p) => {
    let r = p.region;
    const d = p.mods.offset ?? 0;
    if (d) r = offset(r, d);
    const c = p.mods.outline;
    if (c && area(r) > 0) {
      const ring = difference(offset(r, c.distance + c.width), offset(r, c.distance));
      r = union(r, ring);
    }
    if (p.region.length && area(r) <= 0.001) {
      warnings.push({
        code: "ELEMENT_NOT_MACHINABLE",
        severity: "error",
        message: `${capitalize(p.label)} disappeared after being thinned by ${fmt(-d)} mm.`,
        suggestion: "Thin the element less.",
        element: { type: p.type, index: p.idx } as ElementRef,
        fix: { element: { type: p.type, index: p.idx } as ElementRef, field: "offset", value: 0 },
      });
    }
    return { ...p, region: r };
  });
  const sub = shaped.filter((p) => p.mods.operation === "subtract");
  const mask = shaped.filter((p) => p.mods.operation === "mask");
  const normal = shaped.filter((p) => (p.mods.operation ?? "normal") === "normal");
  if (!sub.length && !mask.length) return shaped;
  if (!normal.length) {
    warnings.push({ code: "NOTHING_TO_CUT", severity: "error", message: "There are only subtract or mask elements; nothing is left to cut." });
  }
  // Without a target list, the operation applies to every normal element.
  const hits = (op: P, target: P) => !op.mods.targets || op.mods.targets.some((a) => a.type === target.type && a.index === target.idx);
  return normal.map((p) => {
    let r = p.region;
    const cuts = sub.filter((s) => hits(s, p));
    if (cuts.length) r = difference(r, union(...cuts.map((s) => s.region)));
    const masks = mask.filter((s) => hits(s, p));
    if (masks.length) r = intersection(r, union(...masks.map((s) => s.region)));
    return { ...p, region: r };
  });
}

function buildHoles(spec: PlateSpec, tool: Tool, part: Region, m: number, depth: number, warnings: Warning[]): CutElement[] {
  const out: CutElement[] = [];
  spec.holes.forEach((f, i) => {
    if (f.diameter < tool.diameter - 0.01) {
      warnings.push({
        code: "HOLE_SMALLER_THAN_BIT",
        severity: "error",
        message: `Hole ${i + 1} is ${fmt(f.diameter)} mm, smaller than the ${fmt(tool.diameter, 2)} mm bit.`,
        suggestion: `Make the hole at least ${fmt(tool.diameter, 2)} mm.`,
        element: { type: "hole", index: i },
        fix: { element: { type: "hole", index: i }, field: "diameter", value: Math.ceil(tool.diameter * 10) / 10 },
      });
      return;
    }
    const r = circle(f.x + m, f.y + m, f.diameter / 2);
    checkInside(r, part, `hole ${i + 1}`, warnings, { type: "hole", index: i }, m, spec);
    out.push({ label: `hole ${i + 1}`, ref: { type: "hole", index: i }, region: r, depth: depth });
  });
  spec.slots.forEach((s, i) => {
    if (s.width < tool.diameter - 0.01) {
      warnings.push({
        code: "SLOT_SMALLER_THAN_BIT",
        severity: "error",
        message: `Slot ${i + 1} is ${fmt(s.width)} mm wide, narrower than the ${fmt(tool.diameter, 2)} mm bit.`,
        element: { type: "slot", index: i },
        fix: { element: { type: "slot", index: i }, field: "width", value: Math.ceil(tool.diameter * 10) / 10 },
      });
      return;
    }
    const r = slot(s.x + m, s.y + m, s.length, s.width, s.angle);
    checkInside(r, part, `slot ${i + 1}`, warnings, { type: "slot", index: i }, m, spec);
    out.push({ label: `slot ${i + 1}`, ref: { type: "slot", index: i }, region: r, depth: depth });
  });
  return out;
}

function checkInside(r: Region, part: Region, label: string, warnings: Warning[], ref: ElementRef, m: number, spec: PlateSpec) {
  if (area(difference(r, part)) > 0.01) {
    // Where it is and how big the part is (part coordinates, like the spec's x/y), so the UI can move it inside.
    const b = bounds(r);
    const r1 = (v: number) => Math.round(v * 100) / 100;
    warnings.push({
      code: "OUTSIDE_PART",
      severity: "error",
      message: `${capitalize(label)} goes outside the part.`,
      element: ref,
      data: { bounds: { minX: r1(b.minX - m), minY: r1(b.minY - m), maxX: r1(b.maxX - m), maxY: r1(b.maxY - m) }, part: { width: spec.width, height: spec.height } },
    });
  }
}

function checkFit(
  r: Region,
  box: { width: number; height: number } | null,
  label: string,
  sizes: number[],
  warnings: Warning[],
  inner?: Region,
  ref?: ElementRef,
) {
  const b = bounds(r);
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  let factor = 1;
  let fits = true;
  if (box) {
    fits = w <= box.width + 1e-6 && h <= box.height + 1e-6;
    factor = Math.min(box.width / w, box.height / h);
  } else if (inner) {
    fits = area(difference(r, inner)) < 0.01;
    if (!fits) {
      const ib = bounds(inner);
      factor = Math.min((ib.maxX - ib.minX) / w, (ib.maxY - ib.minY) / h);
    }
  }
  if (!fits) {
    const suggested = Math.floor(Math.min(...sizes) * Math.min(1, factor) * 0.95);
    warnings.push({
      code: "TEXT_DOES_NOT_FIT",
      severity: "error",
      message: `${capitalize(label)} does not fit in the available area of the sign.`,
      suggestion: suggested > 0 ? `Reduce the size to about ${suggested} mm or make the sign bigger.` : "Make the sign bigger.",
      data: { suggestedSize: suggested },
      element: ref,
      fix: ref && suggested > 0 && (ref.type === "text" || ref.type === "icon") ? { element: ref, field: "size", value: suggested } : ref && suggested > 0 && ref.type === "svg" ? { element: ref, field: "width", value: suggested } : undefined,
    });
  }
}

function pathIsHole(path: { x: number; y: number }[]) {
  let s = 0;
  for (let i = 0; i < path.length; i++) {
    const a = path[i];
    const b = path[(i + 1) % path.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s < 0;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
