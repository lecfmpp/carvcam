import { ELEMENTS, FONT_FILES, type FontId, type PlateSpecInput } from "@carvcam/cam-engine";
import { BITS, bitById, PRESET_LABEL, type Bit } from "../lib/catalog";
import type { Design } from "../state/design";
import { FONTS, ICONS, MODE_NAME, SHAPE_NAME, type Box } from "../screens/create/elements";
import { aidString, allAids, listOf, type AId } from "./ids";
import type { AssistantContext, Check } from "./types";

/** Text for the model and the change list. All numbers in mm, rounded to 0.1. */

export const r1 = (v: number) => Math.round(v * 10) / 10;
export const inch = (mm: number) => Math.round((mm / 25.4) * 100) / 100;
const FONT_NAME = (id: unknown) => FONTS.find((f) => f.id === id)?.name ?? String(id);
const STYLE = (m: unknown) => MODE_NAME[String(m)] ?? String(m);

/** Human name of an element ("Text 'SMITH'", "Star 2", "Heart icon", "Hole 3"). */
export function labelOf(spec: PlateSpecInput, a: AId): string {
  const el = listOf(spec, a.kind)[a.index] as Record<string, unknown> | undefined;
  if (a.kind === "text") return `Text '${el?.content ?? "?"}'`;
  if (a.kind === "shape") return `${SHAPE_NAME[el?.type as keyof typeof SHAPE_NAME] ?? "Shape"} ${a.index + 1}`;
  if (a.kind === "icon") return `${ICONS.find((x) => x.id === el?.id)?.name ?? "Icon"} icon`;
  if (a.kind === "drawing") return `Drawing '${el?.name ?? a.index + 1}'`;
  return `${a.kind === "hole" ? "Hole" : "Slot"} ${a.index + 1}`;
}

const MM_FIELDS = new Set(["size", "depth", "width", "height", "diameter", "radius", "thickness", "length", "offset", "frame", "margin", "x", "y", "x2", "y2", "arc"]);

/** One field change, for the change list ("size 40 mm", "font Pacifico", "style raised"). */
export function fieldText(field: string, value: unknown): string {
  if (value === null || value === undefined) {
    if (field === "x" || field === "y") return `${field} automatic`;
    return `${field === "mode" ? "style" : field} none`;
  }
  if (field === "mode") return `style ${STYLE(value)}`;
  if (field === "font") return `font ${FONT_NAME(value)}`;
  if (field === "content") return `text '${value}'`;
  if (field === "copies" && typeof value === "object") {
    const c = value as { rows?: number; cols?: number };
    return `${(c.rows ?? 1) * (c.cols ?? 1)} copies (${c.rows ?? 1} × ${c.cols ?? 1})`;
  }
  if (field === "edge" && typeof value === "object") {
    const e = value as { type?: string; radius?: number };
    return `edge ${e.type ?? "straight"}${e.radius ? ` ${r1(e.radius)} mm` : ""}`;
  }
  if (typeof value === "number" && MM_FIELDS.has(field)) return `${field} ${r1(value)} mm`;
  if (typeof value === "boolean") return `${field} ${value ? "on" : "off"}`;
  if (typeof value === "object") return `${field} ${JSON.stringify(value)}`;
  return `${field} ${value}`;
}

export const changeLine = (label: string, fields: Record<string, unknown>) => `${label} → ${Object.entries(fields).map(([k, v]) => fieldText(k, v)).join(", ")}`;

export const bitLine = (b: Bit | undefined, id: string) =>
  b ? `${b.id} (${b.name}, ${b.profile === "v" ? `${b.angle}° V-bit` : `${r1(b.d)} mm ${b.profile}`})` : `${id} (unknown bit)`;

/** The current design as the model sees it (get_design, and the start of every turn). */
export function describeDesign(design: Design, ctx: AssistantContext, boxes: Map<string, Box>, checks: Check[]): string {
  const s = design.spec;
  const cut = s.outerCutout ?? true;
  const lines: string[] = [];
  lines.push(
    `Board: ${s.type === "lettering" ? "cut-out lettering" : "sign (plate)"} ${r1(s.width)} × ${r1(s.height)} mm (${inch(s.width)} × ${inch(s.height)} in), ${r1(s.thickness)} mm thick ${design.material}.`,
    `Edge: ${s.edge?.type ?? "straight"}${s.edge?.radius ? ` radius ${r1(s.edge.radius)} mm` : ""}. Frame: ${r1(s.frame ?? 6)} mm. Outer cutout: ${cut ? `yes, margin ${r1(s.margin ?? 10)} mm` : "no"}.${s.inlay ? ` Inlay: this board is the ${s.inlay.part} of a V-carve inlay (made by the inlay wizard; don't change it).` : ""}`,
    `Main bit: ${bitLine(bitById(design.bit), design.bit)}. Second bit (cutouts and holes): ${design.useBit2 && design.bit2 ? bitLine(bitById(design.bit2), design.bit2) : "off"}.`,
    `Speed preset: ${design.preset ? PRESET_LABEL[design.preset].title.toLowerCase() : "machine default"}. Tabs: ${design.tabs.mode === "manual" ? `${design.tabs.positions?.length ?? 0} placed by hand` : design.tabs.count}, ${r1(design.tabs.height)} mm tall, ${r1(design.tabs.width)} mm wide.`,
    `Machine: ${ctx.machine.name}, travel ${ctx.machine.travelX} × ${ctx.machine.travelY} mm. The sign plus ${cut ? "twice the margin" : "nothing"} must fit in that.`,
  );
  const ids = allAids(s);
  lines.push(ids.length ? "Elements (id: fields | box center and size in mm):" : "Elements: none.");
  for (const a of ids) {
    const el = { ...(listOf(s, a.kind)[a.index] as Record<string, unknown>) };
    if (typeof el.content === "string" && a.kind === "drawing") el.content = `<drawing file, ${el.content.length} characters>`;
    const b = boxes.get(aidString(a));
    const box = b ? ` | center (${r1(b.cx)}, ${r1(b.cy)}), ${r1(b.w)} × ${r1(b.h)}` : "";
    lines.push(`- ${aidString(a)} ${labelOf(s, a)}: ${JSON.stringify(el)}${box}`);
  }
  lines.push(checks.length ? `Engine problems now:\n${checksText(checks)}` : "Engine problems now: none.");
  return lines.join("\n");
}

export const checksText = (checks: Check[]) => checks.map((c) => `- ${c.severity.toUpperCase()} ${c.code}${c.element ? ` (${c.element})` : ""}: ${c.message}${c.suggestion ? ` Suggestion: ${c.suggestion}` : ""}`).join("\n");

export function fontsText(): string {
  return FONTS.map((f) => `- ${f.id}: ${FONT_FILES[f.id as FontId]?.name ?? f.name}. ${FONT_FILES[f.id as FontId]?.style ?? ""} (${f.tag}). Width per letter ≈ ${f.widthFactor} × size.`).join("\n");
}

export function libraryText(): string {
  const icons = ICONS.map((i) => i.id).join(", ");
  const lib = ELEMENTS.map((e) => `- ${e.id} (${e.category}): ${e.name}, suggested width ${e.width} mm${e.generate ? ", drawn at the size given (frame)" : ""}`).join("\n");
  return `Built-in icons (add_element kind "icon", field id): ${icons}.\nLibrary elements (add_element kind "library", field id):\n${lib}`;
}

const signBits = () => BITS.filter((b) => b.carvcam && !b.notForSigns && b.profile !== "surfacing");
const bitRow = (b: Bit) => `- ${b.id}: ${b.name} — ${b.profile === "v" ? `${b.angle}° V-bit` : `${r1(b.d)} mm (${b.inch}) ${b.profile}`}, cut length ${b.cut} mm. ${b.use}.`;

/** Every bit CarvCAM can carve signs with (static part of the prompt). */
export const bitCatalogText = () => signBits().map(bitRow).join("\n");

export function bitsText(owned: string[]): string {
  const ok = signBits();
  const fmt = bitRow;
  const mine = ok.filter((b) => owned.includes(b.id));
  const others = ok.filter((b) => !owned.includes(b.id));
  return `In My bits (selectable):\n${mine.map(fmt).join("\n") || "- none"}\nOther bits CarvCAM supports (the user must add them to My bits first):\n${others.map(fmt).join("\n")}`;
}
