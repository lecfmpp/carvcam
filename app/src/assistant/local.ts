import type { PlateSpecInput } from "@carvcam/cam-engine";
import { MATERIALS } from "../lib/catalog";
import { changed, newDraft, runTool } from "./ops";
import { newChecks } from "./verify";
import type { AssistantContext, AssistantProvider, AssistantReply, TraceEntry, Verifier } from "./types";


/**
 * Offline assistant: understands common, simple requests in English without a key or a network.
 * It turns each request into the SAME tool calls Claude would make (ops.ts), so its edits get the
 * same validation, change list and single undo step. Anything it doesn't understand, it says so.
 */

export interface LocalPlan {
  calls: { tool: string; input: Record<string, unknown> }[];
  /** Reply when the calls succeed. */
  text: string;
}

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const toMm = (v: string, unit: string | undefined) => {
  const n = parseFloat(v.replace(",", "."));
  const u = (unit ?? "mm").toLowerCase();
  if (u.startsWith("in") || u === '"' || u === "″") return Math.round(n * 25.4 * 10) / 10;
  if (u === "cm") return n * 10;
  if (u.startsWith("f")) return Math.round(n * 304.8 * 10) / 10;
  return n;
};
const UNIT = String.raw`\s*(mm|cm|in(?:ch(?:es)?)?|"|″|ft|feet|foot)?`;

const ICON_WORDS: [RegExp, string][] = [
  [/\bheart\b/, "heart"],
  [/\bstar\b/, "star"],
  [/\b(house|home)\b/, "house"],
  [/\bleaf\b/, "leaf"],
];

/** Turns a message into tool calls, or null when it isn't understood. Pure (tests call it directly). */
export function plan(message: string, ctx: AssistantContext): LocalPlan | { text: string } | null {
  const low = message.toLowerCase().trim();
  const spec: PlateSpecInput = ctx.design.spec;
  const texts = spec.texts ?? [];
  const textIds = texts.map((_, i) => `text:${i}`);
  const sign = spec.type !== "lettering";

  if (/\b(start|run|begin)\b.*\b(carv|cut|job|machine|router)|\b(carve|cut) (it|this) (now|out)?\s*$|^carve\b|^go\b/.test(low))
    return { text: "I can't start the machine: carving always starts with you. Press Next to Prepare, then Position and Carve." };
  if (/\binlay\b/.test(low)) return { calls: [{ tool: "open_pro_feature", input: { feature: "inlay", ids: [] } }], text: ctx.pro ? "Opening the inlay wizard for this design." : "Inlays are a Pro feature: the inlay wizard shows a preview and the upgrade." };
  if (/\bbatch\b|\bcsv\b/.test(low)) return { calls: [{ tool: "open_pro_feature", input: { feature: "batch", ids: [] } }], text: "Batch carving is in Prepare (Pro)." };
  if (/\b(cost|quote|price)\b/.test(low)) return { calls: [{ tool: "open_pro_feature", input: { feature: "cost", ids: [] } }], text: "Job cost and quotes are in Prepare (Pro)." };
  if (/\b(lion|dog|cat|horse|bowl|statue|portrait|photo|3d)\b/.test(low) && !ICON_WORDS.some(([re]) => re.test(low)))
    return { text: "The app makes flat signs and lettering, so 3D carvings aren't possible. I can add a heart, star, house or leaf, or a library element like a paw." };

  // Board size: "12 by 8 inches", "300 x 200 mm"
  const size = new RegExp(`${NUM}${UNIT}\\s*(?:x|×|by)\\s*${NUM}${UNIT}`).exec(low);
  if (size && /\b(sign|board|make|size|plaque)\b/.test(low)) {
    const unit = size[4] ?? size[2];
    const w = toMm(size[1], size[2] ?? unit);
    const h = toMm(size[3], unit);
    const inches = /in|"|″/.test(unit ?? "");
    return { calls: [{ tool: "set_board", input: { width: w, height: h } }], text: `The ${sign ? "sign" : "board"} is now ${w} × ${h} mm${inches ? ` (${size[1]} × ${size[3]} in)` : ""}.` };
  }

  // Text content: change the text to "…"
  const quoted = /["“”‘’]([^"“”‘’]{1,60})["“”‘’]/.exec(message)?.[1];
  if (quoted && /\b(text|say|says|read|write|name|change)\b/.test(low)) {
    if (texts.length === 1) return { calls: [{ tool: "set_text", input: { id: "text:0", content: quoted.trim(), font: "keep", size: 0 } }], text: `The text now says "${quoted.trim()}".` };
    if (!texts.length)
      return {
        calls: [{ tool: "add_element", input: { element: { kind: "text", content: quoted.trim(), size: Math.max(10, Math.round(spec.height / 5)), mode: sign ? "relief" : "cutout", depth: 3 } } }],
        text: `Added the text "${quoted.trim()}".`,
      };
    return null; // several texts: which one? Claude asks; offline we don't guess.
  }

  // Depth: "engrave … 3 mm deep"
  const deep = new RegExp(`${NUM}${UNIT}\\s*deep`).exec(low);
  const style = /engrav/.test(low) ? "engraved" : /\braise/.test(low) ? "raised" : /cut (all the way )?through|stencil/.test(low) ? "cut_through" : /\bpart\b|cut (it )?out as/.test(low) ? "part" : null;
  if ((style || deep) && texts.length + (spec.icons?.length ?? 0) + (spec.shapes?.length ?? 0) + (spec.svgs?.length ?? 0) > 0) {
    const depth = deep ? toMm(deep[1], deep[2]) : 0;
    const ids = /\b(text|letters|words|number)\b/.test(low) ? textIds : [];
    const what = ids.length ? "The text" : "Everything";
    const say = { raised: "raised", engraved: "engraved", cut_through: "cut all the way through", part: "cut out as loose parts" } as const;
    return {
      calls: [{ tool: "set_style", input: { ids, style: style ?? "keep", depth } }],
      text: `${what} is now ${style ? say[style as keyof typeof say] : "carved"}${depth ? ` ${depth} mm deep` : ""}.`,
    };
  }

  // Fonts
  const font = /\b(script|cursive|handwrit)/.test(low) ? "pacifico" : /\b(condensed|narrow)\b/.test(low) ? "bebas-neue" : /\b(bold|bolder|thick|thicker|heavier|block)\b/.test(low) ? "archivo-black" : null;
  if (font && texts.length && /\b(font|letters|text|script|cursive|bold|condensed|thicker)\b/.test(low)) {
    const names = { pacifico: "Pacifico, a script where the letters join", "bebas-neue": "Bebas Neue, a condensed font", "archivo-black": "Archivo Black, the boldest and easiest to carve" };
    return { calls: textIds.map((id) => ({ tool: "set_text", input: { id, content: "", font, size: 0 } })), text: `Switched to ${names[font]}.` };
  }

  // Bigger / smaller text
  if (/\b(bigger|larger|smaller|shorter|tiny)\b/.test(low) && texts.length && !/\b(sign|board)\b/.test(low)) {
    const f = /\b(bigger|larger)\b/.test(low) ? 1.2 : 1 / 1.2;
    const calls = texts.map((t, i) => ({ tool: "set_text", input: { id: `text:${i}`, content: "", font: "keep", size: Math.max(6, Math.round(t.size * f)) } }));
    return { calls, text: `Made the letters ${f > 1 ? "bigger" : "smaller"} (${calls[0].input.size} mm).` };
  }

  // Icons
  const icon = ICON_WORDS.find(([re]) => re.test(low));
  if (icon && /\b(add|put|place|with)\b/.test(low)) {
    return { calls: [{ tool: "add_element", input: { element: { kind: "icon", id: icon[1], x: spec.width - 22, y: 22, size: 18, mode: "engrave", depth: 2 } } }], text: `Added a ${icon[1]} in the lower-right corner, engraved 2 mm deep.` };
  }

  // Holes: "a mounting hole in each corner", "two holes"
  if (/\b(hole|holes|screw|mount)/.test(low)) {
    const d = 5;
    const i = 12;
    const corners = /\b(each|every|four|4|all)\b.*\bcorner/.test(low);
    const pts = corners
      ? [
          [i, i],
          [spec.width - i, i],
          [i, spec.height - i],
          [spec.width - i, spec.height - i],
        ]
      : [
          [i + 2, spec.height - i - 2],
          [spec.width - i - 2, spec.height - i - 2],
        ];
    return { calls: pts.map(([x, y]) => ({ tool: "add_element", input: { element: { kind: "hole", x, y, diameter: d } } })), text: `Added ${pts.length} ${d} mm mounting holes ${corners ? "in the corners" : "near the top corners"}.` };
  }
  if (/\b(hang|slot|keyhole)/.test(low)) return { calls: [{ tool: "add_element", input: { element: { kind: "slot", x: spec.width / 2, y: spec.height - 14, length: 14, width: 6, angle: 0 } } }], text: "Added a hanging slot at the top center." };

  // Edge and frame
  if (/chamfer/.test(low)) return { calls: [{ tool: "set_board", input: { edge: { type: "chamfered", radius: spec.edge?.radius || 8 } } }], text: "The edge is now chamfered." };
  if (/\bround(ed)?\b.*\b(edge|corner)|\b(edge|corner)s?\b.*\bround/.test(low)) return { calls: [{ tool: "set_board", input: { edge: { type: "rounded", radius: spec.edge?.radius || 10 } } }], text: "The corners are now rounded." };
  if (/\b(straight|square)\b.*\b(edge|corner)/.test(low)) return { calls: [{ tool: "set_board", input: { edge: { type: "straight", radius: 0 } } }], text: "The edge is now straight." };
  if (/\bframe\b/.test(low)) {
    const off = /\b(no|remove|without)\b/.test(low);
    return { calls: [{ tool: "set_board", input: { frame: off ? 0 : 6 } }], text: off ? "Removed the raised frame." : "Added a 6 mm raised frame around the edge." };
  }

  // Material
  const mat = MATERIALS.find((m) => new RegExp(`\\b${m.id.toLowerCase().split(" ")[0]}\\b`).test(low));
  if (mat && /\b(use|make it|switch|change|material|wood|in)\b/.test(low)) return { calls: [{ tool: "set_board", input: { material: mat.id } }], text: `The board is now ${mat.id}.` };

  // Center everything
  if (/\bcent(er|re)\b/.test(low) && /\b(everything|all|design|it)\b/.test(low)) return { calls: [{ tool: "align_elements", input: { ids: [], horizontal: "center", vertical: "center", to: "board", inset: 0 } }], text: "Centered everything on the sign." };

  // Lettering vs sign
  if (/cut.?out lettering|\blettering\b/.test(low) && sign) return { calls: [{ tool: "set_board", input: { type: "lettering" } }], text: "Switched to cut-out lettering." };

  return null;
}

/** Runs a plan through the same operations Claude uses. */
export async function runLocal(message: string, ctx: AssistantContext, verify?: Verifier): Promise<AssistantReply> {
  const p = plan(message, ctx);
  if (!p) return { text: 'The offline assistant only understands simple requests, like "make the sign 12 by 8 inches", "engrave the text 3 mm deep", "add a heart" or "add a mounting hole in each corner". Connect Claude for anything else.', changes: [], remaining: [], provider: "local" };
  if (!("calls" in p)) return { text: p.text, changes: [], remaining: [], provider: "local" };
  const base = verify ? await verify(ctx.design, ctx) : null;
  const draft = newDraft(ctx, base?.checks ?? [], base?.result ?? null);
  const trace: TraceEntry[] = [];
  for (const c of p.calls) {
    const out = runTool(draft, c.tool, c.input);
    trace.push({ tool: c.tool, input: c.input, ok: out.ok, output: out.ok ? out.output : out.error });
    if (!out.ok) return { text: `I couldn't do that: ${out.error}`, changes: [], remaining: [], provider: "local", trace };
  }
  const did = changed(draft);
  let remaining = draft.checks;
  if (did && verify) remaining = newChecks(base?.checks ?? [], (await verify(draft.design, ctx)).checks);
  return { text: p.text, ...(did ? { design: draft.design } : {}), changes: did ? draft.changes : [], ...(draft.action ? { action: draft.action } : {}), remaining: did ? remaining : [], provider: "local", trace };
}

export function makeLocalAssistant(verify?: Verifier): AssistantProvider {
  return { kind: "local", name: "Built-in (offline)", send: (m, ctx) => runLocal(m, ctx, verify), reset() {} };
}
