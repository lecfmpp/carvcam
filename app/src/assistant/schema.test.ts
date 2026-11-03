import { FONT_IDS } from "@carvcam/cam-engine";
import { describe, expect, it } from "vitest";
import { HANDLED_TOOLS } from "./ops";
import { EXCLUDED, FIELD_DOCS, enginePaths, exposedPaths, fieldPaths, toApiSchema, type JsonSchema } from "./schema";
import { assistantTools } from "./tools";

/** Walks every sub-schema. */
function walk(node: unknown, visit: (n: JsonSchema, path: string) => void, path = "") {
  if (!node || typeof node !== "object") return;
  const n = node as JsonSchema;
  visit(n, path);
  for (const [k, v] of Object.entries((n.properties as Record<string, unknown>) ?? {})) walk(v, visit, `${path}.${k}`);
  if (n.items) walk(n.items, visit, `${path}[]`);
  for (const key of ["anyOf", "allOf", "oneOf"]) ((n[key] as unknown[]) ?? []).forEach((v, i) => walk(v, visit, `${path}|${i}`));
}

const isExcluded = (p: string) => Object.keys(EXCLUDED).some((e) => p === e || p.startsWith(`${e}.`) || p.startsWith(`${e}[]`));
/** "text.copies.rows" → "copies.rows"; "shape.star.points" → "points"; "board.edge.type" stays. */
const docKey = (p: string) => (p.startsWith("board.") ? p : p.startsWith("shape.") ? p.replace(/^shape\.[^.]+\./, "") : p.replace(/^[^.]+\./, "")).replace(/\[\]/g, "");

describe("tool schemas come from the engine schema", () => {
  it("exposes every engine field (or excludes it with a reason)", () => {
    const exposed = new Set(exposedPaths());
    const missing = enginePaths().filter((p) => !exposed.has(p) && !isExcluded(p));
    // If this fails, the engine gained a field: expose it through a tool (usually automatic) or add it to EXCLUDED with why.
    expect(missing).toEqual([]);
  });

  it("documents every engine field for the model", () => {
    const undocumented = [...new Set(enginePaths().filter((p) => !isExcluded(p)).map(docKey))].filter((k) => !FIELD_DOCS[k]);
    // If this fails, add a FIELD_DOCS entry: the model only uses fields it understands.
    expect(undocumented).toEqual([]);
  });

  it("has no stale exclusions or docs", () => {
    const paths = new Set(enginePaths());
    expect(Object.keys(EXCLUDED).filter((e) => !paths.has(e))).toEqual([]);
    const keys = new Set(enginePaths().map(docKey));
    expect(Object.keys(FIELD_DOCS).filter((k) => !keys.has(k))).toEqual([]);
  });

  it("exposes every font, element kind and shape type", () => {
    const tools = assistantTools();
    const add = JSON.stringify(tools.find((t) => t.name === "add_element")!.input_schema);
    for (const t of ["rectangle", "circle", "polygon", "star", "curve", "line"]) expect(add).toContain(`"const":"${t}"`);
    for (const k of ["text", "icon", "shape", "library", "hole", "slot"]) expect(add).toContain(`"const":"${k}"`);
    for (const f of FONT_IDS) expect(add).toContain(f);
    expect(add).toContain('"part"');
    const setText = tools.find((t) => t.name === "set_text")!.input_schema as JsonSchema;
    expect(((setText.properties as Record<string, JsonSchema>).font.enum as string[]).slice(1)).toEqual([...FONT_IDS]);
  });
});

describe("tool schemas follow the API's JSON Schema subset", () => {
  const FORBIDDEN = ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "minLength", "maxLength", "maxItems", "oneOf", "$schema", "multipleOf"];

  it.each(assistantTools().map((t) => [t.name, t] as const))("%s", (_n, tool) => {
    walk(tool.input_schema, (n, path) => {
      for (const k of FORBIDDEN) expect(n[k], `${path} has ${k}`).toBeUndefined();
      if (n.type === "object" || n.properties) expect(n.additionalProperties, `${path} additionalProperties`).toBe(false);
      if (n.minItems !== undefined) expect(n.minItems as number).toBeLessThanOrEqual(1);
    });
  });

  it("moves dropped constraints into the description", () => {
    const s = toApiSchema({ type: "number", exclusiveMinimum: 0, maximum: 500, description: "Size" });
    expect(s).toEqual({ type: "number", description: "Size (more than 0, max 500)" });
  });

  it("keeps strict tools within the API's strict-mode limits", () => {
    const strict = assistantTools().filter((t) => t.strict);
    let optional = 0;
    let unions = 0;
    for (const t of strict)
      walk(t.input_schema, (n) => {
        const props = Object.keys((n.properties as object) ?? {});
        const req = (n.required as string[]) ?? [];
        optional += props.filter((p) => !req.includes(p)).length;
        for (const p of props) {
          const v = (n.properties as Record<string, JsonSchema>)[p];
          if (v.anyOf || Array.isArray(v.type)) unions++;
        }
      });
    expect(strict.length).toBeLessThanOrEqual(20);
    expect(optional).toBeLessThanOrEqual(24);
    expect(unions).toBeLessThanOrEqual(16);
  });

  it("has a handler for every tool and no tool that touches the machine", () => {
    const names = assistantTools().map((t) => t.name);
    expect([...names].sort()).toEqual([...HANDLED_TOOLS].sort());
    expect(names.filter((n) => /carve|start|run|machine|send|jog|home/i.test(n))).toEqual([]);
  });

  it("generates field paths through unions and arrays", () => {
    expect(fieldPaths({ type: "object", properties: { a: { type: "array", items: { type: "object", properties: { b: { type: "number" } } } } } })).toEqual(["a", "a[].b"]);
  });
});
