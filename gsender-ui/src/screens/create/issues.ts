import type { Warning, GenerateResult, PlateSpecInput } from "@gsender-next/cam-engine";
import { BITS, type Bit } from "../../lib/catalog";
import { applyCorrection, elementName, idOf, type ElementId } from "./elements";

/** A card's action: changes the spec, switches the bit or opens the store. */
export type IssueAction =
  | { label: string; kind: "spec"; spec: PlateSpecInput }
  | { label: string; kind: "bit"; bit: string }
  | { label: string; kind: "store"; url: string };

export interface UiIssue {
  key: string;
  level: "error" | "warning" | "info";
  title: string;
  detail: string;
  suggestion?: string;
  apply?: IssueAction;
  alts: IssueAction[];
  target: ElementId | null;
  pct?: number;
}

interface Ctx {
  spec: PlateSpecInput;
  bit: Bit | undefined;
  ownedBits: string[];
  machineName: string;
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toString();

/** The finest bit the user owns, for "Use 1/16″ bit". */
function finerOwned(ctx: Ctx): Bit | undefined {
  const d = ctx.bit?.d ?? 3.175;
  return BITS.filter((b) => ctx.ownedBits.includes(b.id) && b.profile === "flat" && !b.notForSigns && b.d < d - 0.1).sort((a, b) => b.d - a.d)[0];
}
const finerInStore = (ctx: Ctx) => BITS.find((b) => b.profile === "flat" && b.d < (ctx.bit?.d ?? 3.175) - 0.1 && b.flute === "downcut");

/** Turns the engine warnings (matched by their stable code) into the English cards on the Create screen. */
export function buildIssues(result: GenerateResult | null, ctx: Ctx): UiIssue[] {
  if (!result) return [];
  const out = result.warnings.map((a, k) => toIssue(a, k, ctx));
  for (const p of result.verification?.problems ?? []) {
    if (p.severity !== "error") continue;
    out.push({ key: `v${p.line}`, level: "error", title: "The carving program failed a safety check", detail: p.message, alts: [], target: null });
  }
  return out.sort((a, b) => rank(a.level) - rank(b.level));
}
const rank = (l: UiIssue["level"]) => (l === "error" ? 0 : l === "warning" ? 1 : 2);

function toIssue(a: Warning, k: number, ctx: Ctx): UiIssue {
  const { spec } = ctx;
  const target = idOf(a.element);
  const name = elementName(spec, target);
  const q = `"${name}"`;
  const bitName = ctx.bit?.name ?? "bit";
  const level: UiIssue["level"] = a.severity === "error" ? "error" : a.code === "DIFFERENT_DEPTHS" || a.code === "COMPRESSION_STEPDOWN" ? "info" : "warning";
  const base: UiIssue = { key: `${a.code}-${k}`, level, title: a.message, detail: a.suggestion ?? "", alts: [], target };
  const fix = a.fix && a.element ? applyCorrection(spec, a.fix.element, a.fix.field, a.fix.value) : null;

  switch (a.code) {
    case "TEXT_DOES_NOT_FIT": {
      const v = a.fix?.value ?? Number(a.data?.suggestedSize ?? 0);
      const t = target?.startsWith("t:") ? spec.texts?.[Number(target.slice(2))] : undefined;
      const ratio = t && v ? t.size / v : 1.2;
      const wider = Math.ceil((spec.width * ratio) / 5) * 5;
      return {
        ...base,
        title: target ? `${q} doesn't fit on the ${spec.type === "lettering" ? "board" : "sign"}` : "The lettering doesn't fit on the board",
        detail: `It runs past the margins of the ${spec.width} × ${spec.height} mm ${spec.type === "lettering" ? "board" : "sign"}.`,
        suggestion: target?.startsWith("s:") ? (v ? `Make the drawing ${v} mm wide` : "Make the drawing smaller") : v ? `Reduce the letters to ${v} mm` : "Make the letters smaller",
        apply: fix ? { label: "Apply suggestion", kind: "spec", spec: fix } : undefined,
        alts: [{ label: `Widen ${spec.type === "lettering" ? "board" : "sign"} to ${wider} mm`, kind: "spec", spec: { ...spec, width: wider } }],
      };
    }
    case "ELEMENT_NOT_MACHINABLE": {
      const finer = finerOwned(ctx);
      const t = target?.startsWith("t:") ? spec.texts?.[Number(target.slice(2))] : undefined;
      const bigger = t ? Math.ceil(t.size * 1.6) : 0;
      const grow = t && target ? { ...spec, texts: spec.texts!.map((x, i) => (i === Number(target.slice(2)) ? { ...x, size: bigger } : x)) } : null;
      const alts: IssueAction[] = [];
      if (finer) alts.push({ label: `Use ${finer.inch} bit`, kind: "bit", bit: finer.id });
      else {
        const s = finerInStore(ctx);
        if (s) alts.push({ label: `See ${s.inch} bit in store`, kind: "store", url: s.storeUrl });
      }
      return {
        ...base,
        title: `The strokes in ${q} are thinner than the ${bitName}`,
        detail: `The bit is ${fmt(ctx.bit?.d ?? 3.17)} mm wide, so those parts would disappear.`,
        suggestion: grow ? `Increase to ${bigger} mm` : "Make it bigger or use a finer bit",
        apply: grow ? { label: "Apply suggestion", kind: "spec", spec: grow } : undefined,
        alts,
      };
    }
    case "DETAIL_SMALLER_THAN_BIT": {
      const pct = Number(a.data?.percent ?? 0);
      const finer = finerOwned(ctx);
      const store = finer ? undefined : finerInStore(ctx);
      return {
        ...base,
        pct,
        title: target ? `Some of ${q} is narrower than the bit` : "Some gaps are narrower than the bit",
        detail: `About ${fmt(pct)}% of that area stays uncut, usually inside corners and tight gaps. A quick sanding fixes it.`,
        alts: finer ? [{ label: `Use ${finer.inch} bit`, kind: "bit", bit: finer.id }] : store ? [{ label: "See in store", kind: "store", url: store.storeUrl }] : [],
      };
    }
    case "DEPTH_EXCEEDS":
      return {
        ...base,
        title: `${q} would cut all the way through`,
        detail: `It is deeper than the ${spec.thickness} mm board.`,
        suggestion: a.fix ? `Use ${a.fix.value} mm deep` : "Make it shallower",
        apply: fix ? { label: "Apply suggestion", kind: "spec", spec: fix } : undefined,
        alts: [],
      };
    case "TOOL_TOO_SHORT":
      return { ...base, title: `The ${bitName} is too short for this`, detail: `It cuts ${fmt(ctx.bit?.cut ?? 0)} mm deep at most. Use a thinner board or a longer bit.`, alts: [] };
    case "HOLE_SMALLER_THAN_BIT":
    case "SLOT_SMALLER_THAN_BIT":
      return {
        ...base,
        title: a.code === "HOLE_SMALLER_THAN_BIT" ? "The holes are smaller than the bit" : "The hanging slot is narrower than the bit",
        detail: `The ${bitName} is ${fmt(ctx.bit?.d ?? 3.17)} mm wide.`,
        suggestion: a.fix ? `Make it ${a.fix.value} mm` : undefined,
        apply: fix ? { label: "Apply suggestion", kind: "spec", spec: fix } : undefined,
        alts: [],
      };
    case "OUTSIDE_PART":
      return { ...base, title: `${q} goes past the edge of the sign`, detail: "Move it inside, or make the sign bigger.", alts: [] };
    case "LOOSE_ISLANDS":
      return { ...base, title: `The middles of letters in ${q} will fall out`, detail: "Letters like O and A have centers that come loose when cut through. Raise or engrave them instead, or keep the loose pieces.", alts: [] };
    case "PART_LARGER_THAN_MACHINE":
      return { ...base, title: `The board is bigger than your ${ctx.machineName}`, detail: "Make the sign smaller or switch to a bigger machine.", alts: [] };
    case "DIFFERENT_DEPTHS":
      return { ...base, title: "Raised elements share one background depth", detail: "The deepest raised depth is used for the whole background.", alts: [] };
    case "SMALL_PART_WITHOUT_TABS":
      return { ...base, title: "Some pieces are too small for holding tabs", detail: "They will come loose at the end. Hold them with double-sided tape.", alts: [] };
    case "VBIT_ENGRAVE_ONLY":
      return { ...base, title: "A V-bit can only engrave", detail: `${q} is raised or cut through. Use a flat bit, or switch it to engraved.`, alts: [] };
    case "BIT_NEEDS_ACCESSORY":
      return {
        ...base,
        level: "warning",
        title: `The ${bitName} needs the 1/8″ collet`,
        detail: "Your router holds 1/4″ shanks out of the box.",
        alts: typeof a.data?.url === "string" ? [{ label: "See in store", kind: "store", url: a.data.url as string }] : [],
      };
    case "BIT_NOT_SUPPORTED":
    case "BIT_INCOMPATIBLE":
      return { ...base, title: `The ${bitName} can't be used for this`, detail: "Pick another bit in the Bit menu above.", alts: [] };
    case "COMPRESSION_STEPDOWN":
      return { ...base, title: "Deeper first pass for the compression bit", detail: "The first pass goes past the up-cut part of the bit so both faces stay clean.", alts: [] };
    case "NO_SIENCI_TABLE":
      return { ...base, level: "info", title: "No official speeds for this combination", detail: "We use conservative calculated values instead.", alts: [] };
    case "NOTHING_TO_CUT":
      return { ...base, title: "Nothing to carve yet", detail: "Add text, a shape, an icon or an SVG file.", alts: [] };
    case "ENGRAVED_IN_FLOOR":
      return {
        ...base,
        title: `${q} won't show`,
        detail: `It sits on the lowered background, which is already deeper than its engraving.`,
        suggestion: a.fix ? `Engrave it ${fmt(a.fix.value)} mm deep` : "Make it raised, or move it onto a raised element",
        apply: fix ? { label: "Apply suggestion", kind: "spec", spec: fix } : undefined,
        alts: [],
      };
    case "HATCH_TOO_DENSE":
      return {
        ...base,
        title: `The lines in ${q} merge together`,
        detail: `They're closer than the ${bitName} cuts, so the whole area comes out lowered.`,
        suggestion: a.fix ? `Space the lines ${fmt(a.fix.value)} mm apart` : "Space the lines further apart",
        apply: fix ? { label: "Apply suggestion", kind: "spec", spec: fix } : undefined,
        alts: [],
      };
    case "VCARVE_FLAT_BOTTOM":
      return {
        ...base,
        title: `${q} gets a flat bottom`,
        detail: "Its widest parts would go deeper than the depth limit, so the V-bit flattens them there. That takes longer.",
        suggestion: "Raise the max depth, or make the design thinner",
        alts: [],
      };
    case "INVALID_SVG":
      return { ...base, title: `${q} can't be read`, detail: "Export it again as a plain SVG with text converted to outlines, or delete it.", alts: [] };
    default:
      return base;
  }
}
