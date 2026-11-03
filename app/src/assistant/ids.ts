import type { ElementRef, PlateSpecInput } from "@carvcam/cam-engine";
import type { ElementId } from "../screens/create/elements";

/**
 * Element ids as the model sees them: "text:0", "shape:2", "icon:1", "drawing:0", "hole:3", "slot:0"
 * (kind + index within that kind's list). The Create screen uses short ids ("t:0", "f:2"…) and
 * groups holes and slots; these helpers convert between the two.
 */
export type AKind = "text" | "shape" | "icon" | "drawing" | "hole" | "slot";
export interface AId {
  kind: AKind;
  index: number;
}

const ALIASES: Record<string, AKind> = { text: "text", t: "text", shape: "shape", f: "shape", icon: "icon", i: "icon", drawing: "drawing", svg: "drawing", s: "drawing", hole: "hole", slot: "slot" };
const LIST: Record<AKind, keyof PlateSpecInput> = { text: "texts", shape: "shapes", icon: "icons", drawing: "svgs", hole: "holes", slot: "slots" };
const APP: Partial<Record<AKind, string>> = { text: "t", shape: "f", icon: "i", drawing: "s" };

export function parseAid(id: string): AId | null {
  const m = /^\s*([a-z]+)\s*[:#]\s*(\d+)\s*$/i.exec(id);
  if (!m) return null;
  const kind = ALIASES[m[1].toLowerCase()];
  return kind ? { kind, index: Number(m[2]) } : null;
}

export const aidString = (a: AId) => `${a.kind}:${a.index}`;
export const listKey = (k: AKind) => LIST[k];

/** Create-screen id, or null for holes and slots (one group there). */
export const appIdOf = (a: AId): ElementId | null => (APP[a.kind] ? (`${APP[a.kind]}:${a.index}` as ElementId) : null);

export function aidOfApp(id: string): string | null {
  const a = parseAid(id);
  return a ? aidString(a) : null;
}

export function aidOfRef(ref: ElementRef | undefined): string | undefined {
  if (!ref) return undefined;
  const kind: AKind = ref.type === "svg" ? "drawing" : (ref.type as AKind);
  return `${kind}:${ref.index}`;
}

export function listOf(spec: PlateSpecInput, kind: AKind): Record<string, unknown>[] {
  return ((spec[LIST[kind]] as unknown[] | undefined) ?? []) as Record<string, unknown>[];
}

export function exists(spec: PlateSpecInput, a: AId) {
  return a.index >= 0 && a.index < listOf(spec, a.kind).length;
}

/** Every element id in the design, in panel order. */
export function allAids(spec: PlateSpecInput, kinds: AKind[] = ["text", "shape", "icon", "drawing", "hole", "slot"]): AId[] {
  return kinds.flatMap((kind) => listOf(spec, kind).map((_, index) => ({ kind, index })));
}
