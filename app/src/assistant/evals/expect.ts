import type { Box } from "../../screens/create/elements";
import type { Design } from "../../state/design";
import type { AssistantReply, Check } from "../types";

/** What an assertion sees after a case ran. */
export interface Outcome {
  reply: AssistantReply;
  before: Design;
  /** The design after the turn (= before when nothing was applied). */
  after: Design;
  /** Engine checks before and after (the warning panel's list). */
  beforeChecks: Check[];
  afterChecks: Check[];
  /** Element boxes after the turn by assistant id ("text:0"), from the engine layout. */
  boxes: Map<string, Box>;
}

/** Returns null when the assertion holds, or why it doesn't. */
export type Assertion = { name: string; check(o: Outcome): string | null };

// ------------------------------------------------------------------ helpers

export function get(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), obj);
}

/** Flattens to leaf paths ("spec.texts.0.size" → 30). undefined and missing are the same. */
export function flatten(obj: unknown, prefix = "", out: Record<string, unknown> = {}): Record<string, unknown> {
  if (obj === null || typeof obj !== "object") {
    if (obj !== undefined) out[prefix] = obj;
    return out;
  }
  const entries = Object.entries(obj as Record<string, unknown>);
  if (!entries.length && prefix) out[prefix] = Array.isArray(obj) ? "[]" : "{}";
  for (const [k, v] of entries) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

/** Paths whose value differs between two designs (ignores the name). */
export function changedPaths(a: Design, b: Design): string[] {
  const fa = flatten({ ...a, name: undefined });
  const fb = flatten({ ...b, name: undefined });
  const keys = new Set([...Object.keys(fa), ...Object.keys(fb)]);
  return [...keys].filter((k) => JSON.stringify(fa[k]) !== JSON.stringify(fb[k])).sort();
}

const near = (v: unknown, want: number, tol: number) => typeof v === "number" && Math.abs(v - want) <= tol;

// ------------------------------------------------------------------ assertions

const A = (name: string, check: Assertion["check"]): Assertion => ({ name, check });

/** Only these paths (prefixes; "*" matches one segment) may change. The core "nothing else" rule. */
export const onlyChanged = (...allowed: string[]) =>
  A(`only changed: ${allowed.join(", ")}`, (o) => {
    const res = allowed.map((p) => new RegExp(`^${p.replace(/\./g, "\\.").replace(/\*/g, "[^.]+")}(\\.|$)`));
    const bad = changedPaths(o.before, o.after).filter((p) => !res.some((r) => r.test(p)));
    return bad.length ? `also changed ${bad.slice(0, 8).join(", ")}${bad.length > 8 ? "…" : ""}` : null;
  });

export const unchanged = () => A("design unchanged", (o) => (changedPaths(o.before, o.after).length ? `changed ${changedPaths(o.before, o.after).slice(0, 6).join(", ")}` : null));

export const changedSomething = () => A("design changed", (o) => (o.reply.design ? null : "nothing was applied"));

export const equals = (path: string, want: unknown) => A(`${path} = ${JSON.stringify(want)}`, (o) => (JSON.stringify(get(o.after, path)) === JSON.stringify(want) ? null : `${path} is ${JSON.stringify(get(o.after, path))}`));

export const approx = (path: string, want: number, tol = 0.5) => A(`${path} ≈ ${want} ± ${tol}`, (o) => (near(get(o.after, path), want, tol) ? null : `${path} is ${JSON.stringify(get(o.after, path))}`));

export const that = (name: string, fn: (o: Outcome) => boolean | string) =>
  A(name, (o) => {
    try {
      const r = fn(o);
      return r === true ? null : r === false ? "not true" : r;
    } catch (e) {
      return `threw ${e instanceof Error ? e.message : String(e)}`;
    }
  });

export const asks = () => A("asks a clarifying question", (o) => (o.reply.question ? null : "no question asked"));
export const noQuestion = () => A("does not ask", (o) => (o.reply.question ? `asked "${o.reply.question.question}"` : null));

export const opensPro = (feature: "inlay" | "batch" | "cost") => A(`opens ${feature}`, (o) => (o.reply.action?.feature === feature ? null : `action is ${JSON.stringify(o.reply.action)}`));
export const noAction = () => A("opens nothing", (o) => (o.reply.action ? `opened ${o.reply.action.feature}` : null));

export const replyMatches = (re: RegExp) => A(`reply matches ${re}`, (o) => (re.test(o.reply.text) ? null : `reply: "${o.reply.text}"`));

/** The reply is short (the one-sentence rule, with some slack). */
export const shortReply = (max = 260) => A(`reply ≤ ${max} chars`, (o) => (o.reply.text.length <= max ? null : `${o.reply.text.length} chars`));

const errKey = (c: Check) => `${c.code}|${c.element ?? ""}`;
/** No engine error after the turn that wasn't there before. */
export const noNewErrors = () =>
  A("no new engine errors", (o) => {
    const had = new Set(o.beforeChecks.filter((c) => c.severity === "error").map(errKey));
    const fresh = o.afterChecks.filter((c) => c.severity === "error" && !had.has(errKey(c)));
    return fresh.length ? fresh.map((c) => `${c.code}: ${c.message}`).join("; ") : null;
  });
export const noCheck = (code: string) => A(`no ${code}`, (o) => (o.afterChecks.some((c) => c.code === code) ? `${code} still reported` : null));

/** Box of an element after the turn. */
export const boxOf = (o: Outcome, id: string): Box => {
  const b = o.boxes.get(id);
  if (!b) throw new Error(`no element ${id}`);
  return b;
};

/** Every element box is inside the sign. */
export const insideBoard = (tol = 0.5) =>
  A("elements inside the sign", (o) => {
    const W = o.after.spec.width;
    const H = o.after.spec.height;
    const out = [...o.boxes.entries()].filter(([, b]) => b.cx - b.w / 2 < -tol || b.cx + b.w / 2 > W + tol || b.cy - b.h / 2 < -tol || b.cy + b.h / 2 > H + tol);
    return out.length ? `outside: ${out.map(([id]) => id).join(", ")}` : null;
  });
