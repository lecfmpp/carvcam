import type { GenerateResult, KeepOutZone, PlateSpecInput, Warning } from "@carvcam/cam-engine";
import { BITS, compat, type Bit, type HeadId } from "../../lib/catalog";
import { sienciLink } from "../../lib/referral";
import { bitImage } from "../../lib/storeBits";
import type { Design } from "../../state/design";
import { addElement, applyCorrection, deleteElement, elementName, elementOf, idOf, margin, patchElement, type ElementId } from "./elements";

/** Which bit an issue is about: the main one, or the one that cuts out (second bit, or the main one when there is none). */
export type Slot = "main" | "cutout";

/** Places an action can take the user to when nothing can be fixed in one click. */
export type GoTo = "select" | "bits" | "clamps" | "workshop" | "tabs" | "create" | "reload";

/**
 * A card's action. Every blocking card offers at least one (see issues.test.ts):
 * - spec: apply a corrected design;
 * - bit: switch to a bit the user owns (`patch` says which slot changes);
 * - own: "I have it": add the bit to My bits and switch to it;
 * - store: open the Sienci store (UTM + affiliate code already in the URL);
 * - design: change a Prepare choice (second bit, clamps…);
 * - go: take the user to the place to fix it;
 * - undo / restore: step back to the previous or the last working design.
 */
export type IssueAction =
  | { label: string; kind: "spec"; spec: PlateSpecInput }
  | { label: string; kind: "bit"; bit: string; slot: Slot; patch: Partial<Design> }
  | { label: string; kind: "own"; bit: string; slot: Slot; patch: Partial<Design> }
  | { label: string; kind: "store"; url: string }
  | { label: string; kind: "design"; patch: Partial<Design> }
  | { label: string; kind: "go"; to: GoTo; target?: ElementId; zone?: number }
  | { label: string; kind: "undo" }
  | { label: string; kind: "restore" };

/** A Sienci bit the user doesn't own that solves the problem (shown as a small card inside the issue). */
export interface BitRec {
  bit: string;
  name: string;
  inch: string;
  profile: Bit["profile"];
  d: number;
  cut: number;
  image?: string;
  /** Why this bit fixes it, one short sentence. */
  why: string;
  slot: Slot;
  /** "I have it" and "Buy at Sienci". */
  actions: IssueAction[];
}

export interface UiIssue {
  key: string;
  code: string;
  level: "error" | "warning" | "info";
  title: string;
  detail: string;
  suggestion?: string;
  apply?: IssueAction;
  alts: IssueAction[];
  rec?: BitRec;
  target: ElementId | null;
  pct?: number;
}

export interface IssueCtx {
  spec: PlateSpecInput;
  /** Main bit. */
  bit: Bit | undefined;
  /** Second bit (cutouts and holes), when it is enabled. */
  bit2?: Bit;
  useBit2?: boolean;
  ownedBits: string[];
  machineName: string;
  /** Work area [X, Y] in mm. */
  machineArea?: [number, number];
  headId?: HeadId;
  keepOut?: KeepOutZone[];
  /** Board thicknesses sold for the current material (mm). */
  thicknesses?: number[];
  canUndo?: boolean;
  hasLastGood?: boolean;
  /** Holding tabs as set in Prepare (for the tab cards' one-click fixes). */
  tabs?: Design["tabs"];
}

/** Every action on a card, including the ones in the bit recommendation. */
export const issueActions = (i: UiIssue): IssueAction[] => [...(i.apply ? [i.apply] : []), ...i.alts, ...(i.rec?.actions ?? [])];

const fmt = (n: number) => (Math.round(n * 10) / 10).toString();
const floor1 = (n: number) => Math.floor(n * 10) / 10;

// ------------------------------------------------------------------ bits

const usable = (ctx: IssueCtx, b: Bit) => !b.notForSigns && b.profile !== "surfacing" && (!ctx.headId || compat(b, ctx.headId).level !== "no");
const isFlat = (b: Bit) => b.profile === "flat" || b.profile === "compression";

/** The bit doing the work in that slot right now. */
const bitIn = (ctx: IssueCtx, slot: Slot) => (slot === "cutout" && ctx.useBit2 && ctx.bit2 ? ctx.bit2 : ctx.bit);

/** The design has something that is not cut through (engraving or relief). */
const hasDetail = (spec: PlateSpecInput) => [...(spec.texts ?? []), ...(spec.icons ?? []), ...(spec.shapes ?? []), ...(spec.svgs ?? [])].some((e) => (e.mode ?? "relief") !== "cutout");
/** The design cuts something through (outline, lettering, stencil or holes). */
const hasCut = (spec: PlateSpecInput) =>
  spec.type === "lettering" || (spec.outerCutout ?? true) || !!spec.holes?.length || !!spec.slots?.length || [...(spec.texts ?? []), ...(spec.icons ?? []), ...(spec.shapes ?? []), ...(spec.svgs ?? [])].some((e) => e.mode === "cutout");

/** The slot to change for a cut-through problem: a second bit when the main one also does the detail. */
const cutSlot = (ctx: IssueCtx): Slot => (ctx.useBit2 || hasDetail(ctx.spec) ? "cutout" : "main");

/** What changes in the design when `b` goes into `slot`. */
export function bitPatch(ctx: IssueCtx, b: Bit, slot: Slot): Partial<Design> {
  const main = ctx.bit?.id;
  if (slot === "cutout") return b.id === main ? { useBit2: false } : { bit2: b.id, useBit2: true };
  // A finer or shorter main bit keeps the current one for the cut-out, so that still works.
  if (main && main !== b.id && !ctx.useBit2 && hasCut(ctx.spec) && (b.d < (ctx.bit?.d ?? 0) - 0.1 || b.cut < (ctx.bit?.cut ?? 0)) && ctx.bit && isFlat(ctx.bit))
    return { bit: b.id, bit2: main, useBit2: true };
  if (ctx.useBit2 && ctx.bit2?.id === b.id) return { bit: b.id, useBit2: false };
  return { bit: b.id };
}

function bitLabel(ctx: IssueCtx, b: Bit, slot: Slot, patch: Partial<Design>) {
  if (slot === "cutout" && patch.bit2) return `Cut out with the ${b.name}`;
  if (patch.useBit2 && patch.bit2 && ctx.bit) return b.inch === ctx.bit.inch ? `Use the ${b.name}, keep the ${ctx.bit.inch} ${ctx.bit.flute} to cut out` : `Use ${b.inch} for details, ${ctx.bit.inch} to cut out`;
  return `Use the ${b.name}`;
}

/**
 * The way out through a bit: the best bit the user owns (one click), or the Sienci bit to buy
 * (recommendation card with "I have it" and "Buy at Sienci").
 */
function offerBit(ctx: IssueCtx, code: string, slot: Slot, ok: (b: Bit) => boolean, rank: (a: Bit, b: Bit) => number, why: string): { alts: IssueAction[]; rec?: BitRec } {
  const cur = bitIn(ctx, slot);
  const owned = BITS.filter((b) => ctx.ownedBits.includes(b.id) && b.id !== cur?.id && usable(ctx, b) && ok(b)).sort(rank)[0];
  if (owned) {
    const patch = bitPatch(ctx, owned, slot);
    return { alts: [{ kind: "bit", bit: owned.id, slot, patch, label: bitLabel(ctx, owned, slot, patch) }] };
  }
  const buy = BITS.filter((b) => b.id !== cur?.id && usable(ctx, b) && ok(b) && b.storeUrl).sort(rank)[0];
  if (!buy) return { alts: [] };
  const patch = bitPatch(ctx, buy, slot);
  return {
    alts: [],
    rec: {
      bit: buy.id,
      name: buy.name,
      inch: buy.inch,
      profile: buy.profile,
      d: buy.d,
      cut: buy.cut,
      image: bitImage(buy.id),
      why,
      slot,
      actions: [
        { kind: "own", bit: buy.id, slot, patch, label: "I have it" },
        { kind: "store", url: sienciLink(buy.storeUrl, "bit_suggestion", code), label: `Buy ${buy.inch} ${shortKind(buy)} at Sienci` },
      ],
    },
  };
}

const shortKind = (b: Bit) => (b.profile === "v" ? `${b.angle ?? ""}° V-bit` : b.profile === "compression" ? "compression" : b.flute === "single flute" ? "single flute" : b.flute);

const byDownThenSize = (a: Bit, b: Bit) => (a.flute === "downcut" ? 0 : 1) - (b.flute === "downcut" ? 0 : 1) || b.d - a.d;
const closestTo = (d: number) => (a: Bit, b: Bit) => Math.abs(a.d - d) - Math.abs(b.d - d) || (a.flute === "upcut" ? 0 : 1) - (b.flute === "upcut" ? 0 : 1);

/** A finer flat bit (thin strokes, tight gaps, small holes). */
function finerBit(ctx: IssueCtx, code: string, slot: Slot, below: number, why: string) {
  const cutting = slot === "cutout" || (slot === "main" && !hasDetail(ctx.spec));
  const need = ctx.spec.thickness + 0.3;
  return offerBit(
    ctx,
    code,
    slot,
    (b) => isFlat(b) && b.d < below - 0.1 && (!cutting || b.cut >= need || slot === "main"),
    // Finest first for engraving (downcut keeps the top face clean); for cutting, the biggest that fits.
    cutting ? (a, b) => b.d - a.d : (a, b) => a.d - b.d || byDownThenSize(a, b),
    why,
  );
}

// ------------------------------------------------------------------ issues

/** Turns the engine warnings (matched by their stable code) into the English cards on the Create screen. */
export function buildIssues(result: GenerateResult | null, ctx: IssueCtx): UiIssue[] {
  if (!result) return [];
  const out = result.warnings.map((a, k) => toIssue(a, k, ctx));
  let keepOutShown = false;
  for (const p of result.verification?.problems ?? []) {
    if (p.severity !== "error") continue;
    // Moves through a clamp: one card is enough (the zones are edited in Position).
    if (/keep-out zone/i.test(p.message)) {
      if (keepOutShown || result.warnings.some((w) => w.code === "KEEP_OUT_OVERLAP")) continue;
      keepOutShown = true;
      const name = /keep-out zone "([^"]+)"/.exec(p.message)?.[1];
      const zi = (ctx.keepOut ?? []).findIndex((z, i) => (z.label || z.id || `zone ${i + 1}`) === name);
      const move = zi >= 0 ? clearZone(ctx, zi) : null;
      out.push({
        key: `v${p.line}`,
        code: "KEEP_OUT_PATH",
        level: "error",
        title: `The bit would pass through ${name ? `"${name}"` : "a clamp"}`,
        detail: "Move the clamp away from the toolpath, or set its real height so the bit travels over it.",
        apply: move ?? undefined,
        alts: [{ kind: "go", to: "clamps", zone: zi >= 0 ? zi : undefined, label: "Edit clamps" }],
        target: null,
      });
      continue;
    }
    out.push(
      withWayOut(
        {
          key: `v${p.line}`,
          code: "VERIFY",
          level: "error",
          title: "The carving program failed a safety check",
          detail: `${p.message} This is on us, not you: step back to a version that worked, or change the last thing you edited.`,
          alts: [],
          target: null,
        },
        ctx,
      ),
    );
  }
  return out.sort((a, b) => rank(a.level) - rank(b.level));
}
const rank = (l: UiIssue["level"]) => (l === "error" ? 0 : l === "warning" ? 1 : 2);

/** The card for an engine crash ("Something went wrong"): always offers a way back. */
export function engineErrorIssue(message: string, ctx: IssueCtx): UiIssue {
  return withWayOut(
    {
      key: "engine-error",
      code: "ENGINE_ERROR",
      level: "error",
      title: "Your last change broke the check",
      detail: `The preview shows the last version that worked. (${message})`,
      alts: [],
      target: null,
    },
    ctx,
    true,
  );
}

/** Adds "Undo last change" / "Back to the last working design" (and a last resort) to a card. */
function withWayOut(i: UiIssue, ctx: IssueCtx, always = false): UiIssue {
  if (!always && (i.apply || i.alts.length || i.rec)) return i;
  const alts = [...i.alts];
  if (ctx.canUndo) alts.push({ kind: "undo", label: "Undo last change" });
  if (ctx.hasLastGood) alts.push({ kind: "restore", label: "Back to the last working design" });
  if (i.target) alts.push({ kind: "go", to: "select", target: i.target, label: "Show me" });
  if (!alts.length) alts.push({ kind: "go", to: "reload", label: "Reload CarvCAM" });
  return { ...i, alts };
}

function toIssue(a: Warning, k: number, ctx: IssueCtx): UiIssue {
  const issue = mapWarning(a, k, ctx);
  // The last line of defense: an error card never comes out without a way out.
  return issue.level === "error" ? withWayOut(issue, ctx) : issue;
}

/** Codes this file maps on purpose (issues.test.ts fails when the engine adds one that isn't here). */
export const MAPPED_CODES = [
  "TEXT_DOES_NOT_FIT",
  "ELEMENT_NOT_MACHINABLE",
  "DETAIL_SMALLER_THAN_BIT",
  "DEPTH_EXCEEDS",
  "TOOL_TOO_SHORT",
  "HOLE_SMALLER_THAN_BIT",
  "SLOT_SMALLER_THAN_BIT",
  "OUTSIDE_PART",
  "LOOSE_ISLANDS",
  "PART_LARGER_THAN_MACHINE",
  "DIFFERENT_DEPTHS",
  "SMALL_PART_WITHOUT_TABS",
  "TAB_TOO_NARROW",
  "VBIT_ENGRAVE_ONLY",
  "BIT_NEEDS_ACCESSORY",
  "BIT_NOT_SUPPORTED",
  "BIT_INCOMPATIBLE",
  "COMPRESSION_STEPDOWN",
  "NO_SIENCI_TABLE",
  "NOTHING_TO_CUT",
  "ENGRAVED_IN_FLOOR",
  "HATCH_TOO_DENSE",
  "VCARVE_FLAT_BOTTOM",
  "INVALID_SVG",
  "KEEP_OUT_OVERLAP",
  "KEEP_OUT_TOO_TALL",
  "INVALID_SPEC",
  "FONT_UNAVAILABLE",
] as const;

function mapWarning(a: Warning, k: number, ctx: IssueCtx): UiIssue {
  const { spec } = ctx;
  const target = idOf(a.element);
  const name = elementName(spec, target);
  const q = `"${name}"`;
  const bitName = ctx.bit?.name ?? "bit";
  const level: UiIssue["level"] = a.severity === "error" ? "error" : a.code === "DIFFERENT_DEPTHS" || a.code === "COMPRESSION_STEPDOWN" ? "info" : "warning";
  const base: UiIssue = { key: `${a.code}-${k}`, code: a.code, level, title: a.message, detail: a.suggestion ?? "", alts: [], target };
  const fix = a.fix && a.element ? applyCorrection(spec, a.fix.element, a.fix.field, a.fix.value) : null;
  const role: Slot = a.data?.role === "cutout" ? "cutout" : "main";
  const select: IssueAction | null = target ? { kind: "go", to: "select", target, label: `Select ${name.length > 18 ? "it" : q}` } : null;
  const el = target ? (elementOf(spec, target) as Record<string, unknown> | null) : null;

  switch (a.code) {
    case "TEXT_DOES_NOT_FIT": {
      const v = a.fix?.value ?? Number(a.data?.suggestedSize ?? 0);
      const t = target?.startsWith("t:") ? spec.texts?.[Number(target.slice(2))] : undefined;
      const ratio = t && v ? t.size / v : 1.2;
      const board = spec.type === "lettering" ? "board" : "sign";
      const wider = Math.ceil((spec.width * ratio) / 5) * 5;
      const fitsMachine = !ctx.machineArea || wider + 2 * margin(spec) <= ctx.machineArea[0];
      const alts: IssueAction[] = fitsMachine ? [{ label: `Widen ${board} to ${wider} mm`, kind: "spec", spec: { ...spec, width: wider } }] : [];
      // The whole lettering (no single element): shrink every text by the same factor.
      let all: PlateSpecInput | null = null;
      if (!fix && v > 0 && spec.texts?.length) {
        const min = Math.min(...spec.texts.map((x) => x.size));
        const f = v / min;
        if (f < 1) all = { ...spec, texts: spec.texts.map((x) => ({ ...x, size: Math.max(3, Math.floor(x.size * f)) })) };
      }
      return {
        ...base,
        title: target ? `${q} doesn't fit on the ${board}` : `The lettering doesn't fit on the ${board}`,
        detail: `It runs past the margins of the ${spec.width} × ${spec.height} mm ${board}.`,
        suggestion: target?.startsWith("s:") ? (v ? `Make the drawing ${v} mm wide` : "Make the drawing smaller") : v ? `Reduce the letters to ${v} mm` : "Make the letters smaller",
        apply: fix ? { label: "Apply suggestion", kind: "spec", spec: fix } : all ? { label: "Shrink the lettering to fit", kind: "spec", spec: all } : undefined,
        alts: alts.length || !select ? alts : [select],
      };
    }
    case "ELEMENT_NOT_MACHINABLE": {
      const cur = bitIn(ctx, role);
      // Thinned away by an offset: the engine knows the fix.
      if (fix) return { ...base, title: `${q} disappears after thinning`, detail: "The offset removes it completely.", suggestion: "Thin it less", apply: { label: "Remove the thinning", kind: "spec", spec: fix }, alts: select ? [select] : [] };
      const grown = grow(spec, target, 1.6);
      const offer = finerBit(ctx, a.code, role, cur?.d ?? 3.175, `It's ${fmt(cur?.d ?? 3.175)} mm → ${fmt(1.5875)} mm wide, so it fits into strokes the current bit can't.`);
      return {
        ...base,
        title: `The strokes in ${q} are thinner than the ${cur?.name ?? bitName}`,
        detail: `The bit is ${fmt(cur?.d ?? 3.17)} mm wide, so those parts would disappear.`,
        suggestion: grown ? `Make it bigger, or carve it with a finer bit` : "Use a finer bit or a bolder font",
        apply: grown ? { label: grown.label, kind: "spec", spec: grown.spec } : undefined,
        alts: offer.alts,
        rec: offer.rec,
      };
    }
    case "DETAIL_SMALLER_THAN_BIT": {
      const pct = Number(a.data?.percent ?? 0);
      const cur = bitIn(ctx, role);
      const offer = finerBit(ctx, a.code, role, cur?.d ?? 3.175, "Half the width of a 1/8″ bit, so it gets into tight corners and gaps.");
      return {
        ...base,
        pct,
        title: target ? `Some of ${q} is narrower than the bit` : "Some gaps are narrower than the bit",
        detail: `About ${fmt(pct)}% of that area stays uncut, usually inside corners and tight gaps. A quick sanding fixes it.`,
        alts: offer.alts,
        rec: offer.rec,
      };
    }
    case "DEPTH_EXCEEDS": {
      const deep = floor1(spec.thickness - 1);
      const alts: IssueAction[] = [];
      if (target && deep > (a.fix?.value ?? 0) + 0.2) alts.push({ label: `Carve ${fmt(deep)} mm deep (board − 1 mm)`, kind: "spec", spec: patchElement(spec, target, { depth: deep }) });
      if (target && spec.type !== "lettering") alts.push({ label: "Cut it out instead", kind: "spec", spec: patchElement(spec, target, { mode: "cutout" }) });
      return {
        ...base,
        title: `${q} would cut all the way through`,
        detail: `It is deeper than the ${spec.thickness} mm board.`,
        suggestion: a.fix ? `Use ${a.fix.value} mm deep` : "Make it shallower",
        apply: fix ? { label: "Apply suggestion", kind: "spec", spec: fix } : undefined,
        alts,
      };
    }
    case "TOOL_TOO_SHORT": {
      const needed = Number(a.data?.needed ?? spec.thickness + 0.3);
      const cutLen = Number(a.data?.cutLength ?? bitIn(ctx, role)?.cut ?? 0);
      if (target) {
        // An element deeper than the flutes: carve it as deep as the bit allows, or use a longer bit.
        const cur = ctx.bit;
        const offer = offerBit(ctx, a.code, "main", (b) => b.cut >= needed && (cur?.profile === "v" ? b.profile === "v" : isFlat(b)), closestTo(cur?.d ?? 3.175), `Its flutes are longer, so it reaches ${fmt(needed)} mm.`);
        return {
          ...base,
          title: `${q} is deeper than the ${bitName} can reach`,
          detail: `The flutes cut ${fmt(cutLen)} mm deep at most; ${q} needs ${fmt(needed)} mm.`,
          apply: cutLen > 0.5 ? { label: `Carve it ${fmt(floor1(cutLen))} mm deep`, kind: "spec", spec: patchElement(spec, target, { depth: floor1(cutLen) }) } : undefined,
          alts: offer.alts,
          rec: offer.rec,
        };
      }
      // Cutting through a board thicker than the cut-out bit's flutes.
      const slot = a.data?.role === "cutout" ? "cutout" : cutSlot(ctx);
      const cur = bitIn(ctx, slot);
      const offer = offerBit(ctx, a.code, slot, (b) => isFlat(b) && b.cut >= needed, closestTo(cur?.d ?? 3.175), `Its ${fmt((BITS.find((b) => isFlat(b) && b.cut >= needed) ?? { cut: 25.4 }).cut)} mm flutes cut through the ${spec.thickness} mm board in one go.`);
      const thinner = (ctx.thicknesses ?? []).filter((t) => t + 0.3 <= cutLen).sort((x, y) => y - x)[0];
      return {
        ...base,
        title: `The ${cur?.name ?? bitName} is too short to cut through`,
        detail: `It cuts ${fmt(cutLen)} mm deep at most; the board is ${spec.thickness} mm.`,
        alts: [...offer.alts, ...(thinner ? [{ label: `Use a ${thinner} mm board`, kind: "spec" as const, spec: { ...spec, thickness: thinner } }] : [])],
        rec: offer.rec,
      };
    }
    case "HOLE_SMALLER_THAN_BIT":
    case "SLOT_SMALLER_THAN_BIT": {
      const hole = a.code === "HOLE_SMALLER_THAN_BIT";
      const slot = cutSlot(ctx);
      const cur = bitIn(ctx, slot);
      const d = cur?.d ?? 3.175;
      const size = Math.round((d + 0.5) * 10) / 10;
      const ref = a.fix?.element ?? a.element;
      const bigger = ref ? applyCorrection(spec, ref, hole ? "diameter" : "width", size) : null;
      const cur0 = ref ? (hole ? spec.holes?.[ref.index]?.diameter : spec.slots?.[ref.index]?.width) : undefined;
      const offer = cur0 ? finerBit(ctx, a.code, slot, cur0, `Thinner than the ${hole ? "hole" : "slot"}, so it can cut it.`) : { alts: [] as IssueAction[] };
      return {
        ...base,
        title: hole ? "The holes are smaller than the bit" : "The hanging slot is narrower than the bit",
        detail: `The ${cur?.name ?? bitName} is ${fmt(d)} mm wide.`,
        suggestion: `Make it ${fmt(size)} mm`,
        apply: bigger ? { label: `Make it ${fmt(size)} mm`, kind: "spec", spec: bigger } : undefined,
        alts: offer.alts,
        rec: offer.rec,
      };
    }
    case "OUTSIDE_PART": {
      const moved = moveInside(spec, a);
      return {
        ...base,
        title: `${q} goes past the edge of the sign`,
        detail: "Part of it is outside the board, so it can't be cut.",
        apply: moved ? { label: "Move it inside", kind: "spec", spec: moved } : undefined,
        alts: select ? [select] : [],
      };
    }
    case "LOOSE_ISLANDS": {
      const depth = Math.min(Number(el?.depth ?? 2) || 2, floor1(spec.thickness * 0.4));
      return {
        ...base,
        title: `The middles of letters in ${q} will fall out`,
        detail: "Letters like O and A have centers that come loose when cut through. Keep the pieces to glue back, or engrave instead.",
        apply: target && spec.type !== "lettering" ? { label: `Engrave it ${fmt(depth)} mm deep instead`, kind: "spec", spec: patchElement(spec, target, { mode: "engrave", depth }) } : undefined,
        alts: target && spec.type !== "lettering" ? [{ label: "Make it raised instead", kind: "spec", spec: patchElement(spec, target, { mode: "relief", depth }) }] : [],
      };
    }
    case "PART_LARGER_THAN_MACHINE": {
      const m = margin(spec);
      const area = ctx.machineArea;
      const w = area ? Math.min(spec.width, Math.floor((area[0] - 2 * m) / 5) * 5) : spec.width;
      const h = area ? Math.min(spec.height, Math.floor((area[1] - 2 * m) / 5) * 5) : spec.height;
      return {
        ...base,
        title: `The board is bigger than your ${ctx.machineName}`,
        detail: area ? `Your machine cuts up to ${area[0]} × ${area[1]} mm.` : "Make the sign smaller or switch to a bigger machine.",
        apply: area && w > 20 && h > 20 && (w < spec.width || h < spec.height) ? { label: `Make it ${w} × ${h} mm`, kind: "spec", spec: { ...spec, width: w, height: h } } : undefined,
        alts: [{ kind: "go", to: "workshop", label: "Switch machine" }],
      };
    }
    case "DIFFERENT_DEPTHS": {
      const raised = (xs: { mode?: string; depth?: number }[] | undefined) => (xs ?? []).filter((x) => (x.mode ?? "relief") === "relief").map((x) => x.depth ?? 0);
      const max = Math.max(0, ...raised(spec.texts), ...raised(spec.icons));
      const set = <T extends { mode?: string; depth?: number }>(xs: T[] | undefined) => xs?.map((x) => ((x.mode ?? "relief") === "relief" ? { ...x, depth: max } : x));
      return {
        ...base,
        title: "Raised elements share one background depth",
        detail: "The deepest raised depth is used for the whole background.",
        apply: max > 0 ? { label: `Set all raised to ${fmt(max)} mm`, kind: "spec", spec: { ...spec, texts: set(spec.texts), icons: set(spec.icons) } } : undefined,
        alts: [],
      };
    }
    case "SMALL_PART_WITHOUT_TABS":
      return {
        ...base,
        title: "Some pieces are too small for holding tabs",
        detail: "They come loose at the end of the cut. Put double-sided tape under them before you start.",
        alts: [{ kind: "go", to: "tabs", label: "Check holding tabs" }],
      };
    case "TAB_TOO_NARROW": {
      const width = Number(a.data?.suggestedWidth) || 6;
      return {
        ...base,
        title: "The holding tabs are too thin to hold",
        detail: `At ${fmt(Number(a.data?.width) || 0)} mm they can snap during the last pass and let the piece shift into the bit.`,
        apply: ctx.tabs ? { kind: "design", label: `Make them ${fmt(width)} mm wide`, patch: { tabs: { ...ctx.tabs, width } } } : undefined,
        alts: [{ kind: "go", to: "tabs", label: "Edit holding tabs" }],
      };
    }
    case "VBIT_ENGRAVE_ONLY": {
      const mode = String(el?.mode ?? "relief");
      const depth = Math.min(Number(el?.depth ?? 2) || 2, floor1(spec.thickness * 0.4));
      const offer = offerBit(ctx, a.code, "main", (b) => b.profile === "flat", closestTo(3.175), `A flat bit can clear the background for raised work and cut through.`);
      return {
        ...base,
        title: `A V-bit can only engrave`,
        detail: `${q} is ${mode === "cutout" ? "cut through" : "raised"}. Engrave it, or carve with a flat bit.`,
        apply: target ? { label: "Engrave it instead", kind: "spec", spec: patchElement(spec, target, { mode: "engrave", depth }) } : undefined,
        alts: offer.alts,
        rec: offer.rec,
      };
    }
    case "BIT_NEEDS_ACCESSORY": {
      const slot: Slot = role;
      const cur = BITS.find((b) => b.id === a.data?.bit) ?? bitIn(ctx, slot);
      const fitsHead = (b: Bit) => !ctx.headId || compat(b, ctx.headId).level === "fits";
      const own = BITS.filter((b) => ctx.ownedBits.includes(b.id) && b.id !== cur?.id && usable(ctx, b) && fitsHead(b) && b.profile === cur?.profile).sort(closestTo(cur?.d ?? 6.35))[0];
      const alts: IssueAction[] = [];
      if (typeof a.data?.url === "string") alts.push({ label: "Get the 1/8″ collet at Sienci", kind: "store", url: sienciLink(a.data.url as string, "bit_suggestion", a.code) });
      if (own) {
        const patch = bitPatch(ctx, own, slot);
        alts.push({ kind: "bit", bit: own.id, slot, patch, label: `Use the ${own.name} (fits as is)` });
      }
      return { ...base, level: "warning", title: `The ${cur?.name ?? bitName} needs the 1/8″ collet`, detail: "Your router holds 1/4″ shanks out of the box. Skip this if you already have the collet.", alts };
    }
    case "BIT_NOT_SUPPORTED":
    case "BIT_INCOMPATIBLE": {
      if (a.data?.reason === "head")
        return { ...base, title: "This router isn't an option for your machine", detail: "Pick the router or spindle you actually use in your workshop.", alts: [{ kind: "go", to: "workshop", label: "Change router" }] };
      const slot: Slot = role;
      const cur = BITS.find((b) => b.id === a.data?.bit) ?? bitIn(ctx, slot);
      const offer = offerBit(ctx, a.code, slot, (b) => (slot === "cutout" ? isFlat(b) && b.cut >= ctx.spec.thickness + 0.3 : b.profile === "flat"), closestTo(3.175), "The everyday sign bit: letters, raised work and cut-outs.");
      return {
        ...base,
        title: `The ${cur?.name ?? "selected bit"} can't be used for this`,
        detail: a.code === "BIT_NOT_SUPPORTED" ? "CarvCAM doesn't plan sign toolpaths for it yet." : a.message,
        alts: [...offer.alts, { kind: "go", to: "bits", label: "Pick another bit" }],
        rec: offer.rec,
      };
    }
    case "COMPRESSION_STEPDOWN":
      return { ...base, title: "Deeper first pass for the compression bit", detail: "The first pass goes past the up-cut part of the bit so both faces stay clean.", alts: [] };
    case "NO_SIENCI_TABLE":
      return { ...base, level: "info", title: "No official speeds for this combination", detail: "We use conservative calculated values instead.", alts: [] };
    case "NOTHING_TO_CUT": {
      const only = /subtract or mask/.test(a.message);
      const [withText] = addElement(spec, "text", spec.width / 2, spec.height / 2);
      return {
        ...base,
        title: only ? "Everything left only subtracts or masks" : "Nothing to carve yet",
        detail: only ? "Set one element back to normal so there is something to cut." : "Add text, a shape, an icon or an SVG file.",
        apply: only ? undefined : { label: "Add a text", kind: "spec", spec: withText },
        alts: only ? [{ kind: "go", to: "select", target: (spec.texts?.length ? "t:0" : spec.shapes?.length ? "f:0" : spec.icons?.length ? "i:0" : "s:0") as ElementId, label: "Edit the elements" }] : [],
      };
    }
    case "ENGRAVED_IN_FLOOR":
      return {
        ...base,
        title: `${q} won't show`,
        detail: `It sits on the lowered background, which is already deeper than its engraving.`,
        suggestion: a.fix ? `Engrave it ${fmt(a.fix.value)} mm deep` : "Make it raised, or move it onto a raised element",
        apply: fix ? { label: "Apply suggestion", kind: "spec", spec: fix } : undefined,
        alts: target ? [{ label: "Make it raised", kind: "spec", spec: patchElement(spec, target, { mode: "relief" }) }] : [],
      };
    case "HATCH_TOO_DENSE":
      return {
        ...base,
        title: `The lines in ${q} merge together`,
        detail: `They're closer than the ${bitName} cuts, so the whole area comes out lowered.`,
        suggestion: a.fix ? `Space the lines ${fmt(a.fix.value)} mm apart` : "Space the lines further apart",
        apply: fix ? { label: "Apply suggestion", kind: "spec", spec: fix } : undefined,
        alts: target ? [{ label: "Engrave it solid", kind: "spec", spec: patchElement(spec, target, { hatch: undefined }) }] : [],
      };
    case "VCARVE_FLAT_BOTTOM": {
      const byBit = a.data?.limitedByBit === true;
      const sug = Number(a.data?.suggestedDepth ?? 0);
      const cur = ctx.bit;
      const offer = byBit ? offerBit(ctx, a.code, "main", (b) => b.profile === "v" && b.d > (cur?.d ?? 0) + 0.5, (x, y) => x.d - y.d || (y.angle ?? 0) - (x.angle ?? 0), "A wider V-bit reaches deeper, so wide strokes keep their sharp V.") : { alts: [] as IssueAction[] };
      return {
        ...base,
        title: `${q} gets a flat bottom`,
        detail: "Its widest parts would go deeper than the depth limit, so the V-bit flattens them there. That takes longer.",
        suggestion: byBit ? "Use a larger V-bit, or make the design thinner" : "Raise the max depth, or make the design thinner",
        apply: !byBit && target && sug > Number(el?.depth ?? 0) ? { label: `Allow ${fmt(sug)} mm deep`, kind: "spec", spec: patchElement(spec, target, { depth: sug }) } : undefined,
        alts: offer.alts,
        rec: offer.rec,
      };
    }
    case "INVALID_SVG":
      return {
        ...base,
        title: `${q} can't be read`,
        detail: "Export it again as a plain SVG with text converted to outlines.",
        apply: target ? { label: "Delete it", kind: "spec", spec: deleteElement(spec, target) } : undefined,
        alts: select ? [select] : [],
      };
    case "KEEP_OUT_OVERLAP": {
      const zi = typeof a.data?.zoneIndex === "number" ? (a.data.zoneIndex as number) : -1;
      const z = ctx.keepOut?.[zi];
      const move = zi >= 0 ? clearZone(ctx, zi) : null;
      return {
        ...base,
        title: `${z?.label ? `"${z.label}"` : "A clamp"} is in the bit's way`,
        detail: `It overlaps ${target ? q : "the cut"}. Move the clamp, or move the design.`,
        apply: move ?? undefined,
        alts: [{ kind: "go", to: "clamps", zone: zi >= 0 ? zi : undefined, label: "Edit clamps" }, ...(select ? [select] : [])],
      };
    }
    case "KEEP_OUT_TOO_TALL":
      return {
        ...base,
        title: "A clamp is taller than the bit can clear",
        detail: "Your machine can't lift the bit high enough over it. Use a lower clamp or screws, then set its height.",
        alts: [{ kind: "go", to: "clamps", label: "Edit clamp heights" }],
      };
    case "INVALID_SPEC":
      return { ...base, title: "Some values aren't valid", detail: a.message, alts: select ? [select] : [] };
    case "FONT_UNAVAILABLE": {
      const t = target ? (elementOf(spec, target) as { font?: string } | null) : null;
      return {
        ...base,
        title: "A font didn't load",
        detail: "Usually a network hiccup. Reload, or switch that text to another font.",
        apply: target && t?.font !== "archivo-black" ? { label: "Use Archivo Black", kind: "spec", spec: patchElement(spec, target, { font: "archivo-black" }) } : undefined,
        alts: [{ kind: "go", to: "reload", label: "Reload CarvCAM" }],
      };
    }
    default:
      return base;
  }
}

/** A bigger version of a text, icon or drawing (strokes grow with it). */
function grow(spec: PlateSpecInput, id: ElementId | null, k: number): { spec: PlateSpecInput; label: string } | null {
  if (!id) return null;
  const el = elementOf(spec, id) as Record<string, unknown> | null;
  if (!el) return null;
  for (const f of ["size", "width", "diameter"]) {
    const v = el[f];
    if (typeof v === "number" && v > 0) {
      const nv = Math.ceil(v * k);
      return { spec: patchElement(spec, id, { [f]: nv }), label: `Make it ${nv} mm` };
    }
  }
  return null;
}

/** OUTSIDE_PART: shifts a hole or slot back inside the board (the engine sends its bounds). */
function moveInside(spec: PlateSpecInput, a: Warning): PlateSpecInput | null {
  const b = a.data?.bounds as { minX: number; minY: number; maxX: number; maxY: number } | undefined;
  const ref = a.element;
  if (!b || !ref || (ref.type !== "hole" && ref.type !== "slot")) return null;
  const W = spec.width;
  const H = spec.height;
  const edge = spec.edge as { type?: string; radius?: number } | undefined;
  const inset = 3 + (edge?.type === "rounded" ? (edge.radius ?? 0) * 0.3 : 0);
  if (b.maxX - b.minX > W - 2 * inset || b.maxY - b.minY > H - 2 * inset) return null;
  const dx = b.minX < inset ? inset - b.minX : b.maxX > W - inset ? W - inset - b.maxX : 0;
  const dy = b.minY < inset ? inset - b.minY : b.maxY > H - inset ? H - inset - b.maxY : 0;
  if (!dx && !dy) return null;
  const r = (v: number) => Math.round(v * 10) / 10;
  const s = structuredClone(spec);
  const list = ref.type === "hole" ? s.holes : s.slots;
  const it = list?.[ref.index];
  if (!it) return null;
  it.x = r(it.x + dx);
  it.y = r(it.y + dy);
  return s;
}

/** KEEP_OUT: the zone moved just off the nearest board edge (then the user moves the real clamp to match). */
function clearZone(ctx: IssueCtx, zi: number): IssueAction | null {
  const zones = ctx.keepOut ?? [];
  const z = zones[zi];
  if (!z) return null;
  const m = margin(ctx.spec);
  const W = ctx.spec.width + 2 * m;
  const H = ctx.spec.height + 2 * m;
  const pad = Math.max(ctx.bit?.d ?? 3.175, ctx.bit2?.d ?? 0) / 2 + 1.5;
  const r = (v: number) => Math.round(v * 10) / 10;
  const opts = [
    { x: r(-z.width - pad), y: z.y },
    { x: r(W + pad), y: z.y },
    { x: z.x, y: r(-z.height - pad) },
    { x: z.x, y: r(H + pad) },
  ].sort((p, q) => Math.hypot(p.x - z.x, p.y - z.y) - Math.hypot(q.x - z.x, q.y - z.y));
  const best = opts[0];
  const next = zones.map((x, i) => (i === zi ? { ...x, x: best.x, y: best.y } : x));
  return { kind: "design", patch: { keepOut: next }, label: `Move ${z.label ? `"${z.label}"` : "the clamp"} off the board` };
}
