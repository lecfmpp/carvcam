import { describe, expect, it } from "vitest";
import { F, STARTER_BITS } from "./evals/fixtures";
import { machineCtx } from "./evals/node";
import { changed, describe as describeDraft, newDraft, runTool } from "./ops";
import type { AssistantContext } from "./types";

const ctx = (design = F.heartStar(), extra: Partial<AssistantContext> = {}): AssistantContext => ({ design, machine: machineCtx(), ownedBits: STARTER_BITS, pro: false, ...extra });

function ok(d: ReturnType<typeof newDraft>, tool: string, input: Record<string, unknown>) {
  const r = runTool(d, tool, input);
  if (!r.ok) throw new Error(`${tool} failed: ${r.error}`);
  return r.output;
}
function err(d: ReturnType<typeof newDraft>, tool: string, input: Record<string, unknown>) {
  const before = JSON.stringify(d.design);
  const r = runTool(d, tool, input);
  expect(r.ok).toBe(false);
  // A rejected call never changes the draft.
  expect(JSON.stringify(d.design)).toBe(before);
  return r.ok ? "" : r.error;
}

describe("assistant operations", () => {
  it("updates one field of one element and lists the change", () => {
    const d = newDraft(ctx(F.smith()));
    ok(d, "update_element", { id: "text:0", changes: { size: 40 } });
    expect(d.design.spec.texts![0].size).toBe(40);
    expect(d.design.spec.texts![0].content).toBe("SMITH");
    expect(d.changes).toEqual(["Text 'SMITH' → size 40 mm"]);
    expect(d.before.spec.texts![0].size).toBe(30); // the original design is untouched
  });

  it("rejects invalid values with the engine's reason", () => {
    const d = newDraft(ctx(F.smith()));
    expect(err(d, "update_element", { id: "text:0", changes: { size: 900 } })).toMatch(/text:0 size/);
    expect(err(d, "update_element", { id: "text:0", changes: { font: "comic-sans" } })).toMatch(/font/);
    expect(err(d, "update_element", { id: "text:0", changes: { diameter: 5 } })).toMatch(/has no field diameter/);
    expect(err(d, "update_element", { id: "text:7", changes: { size: 5 } })).toMatch(/does not exist/);
    expect(err(d, "update_element", { id: "banana", changes: { size: 5 } })).toMatch(/not an element id/);
    expect(err(d, "set_text", { id: "text:0", content: "x".repeat(61), font: "keep", size: 0 })).toMatch(/60|too big|characters/i);
    expect(d.changes).toEqual([]);
  });

  it("null clears optional fields (automatic text position)", () => {
    const d = newDraft(ctx(F.twoLines()));
    ok(d, "update_element", { id: "text:0", changes: { x: null, y: null } });
    expect("x" in d.design.spec.texts![0]).toBe(false);
  });

  it("refuses to change a shape's type or a drawing's file", () => {
    const d = newDraft(ctx());
    expect(err(d, "update_element", { id: "shape:0", changes: { type: "circle" } })).toMatch(/remove it and add/);
  });

  it("adds every kind of element", () => {
    const d = newDraft(ctx(F.blank()));
    ok(d, "add_element", { element: { kind: "text", content: "HI", size: 20 } });
    ok(d, "add_element", { element: { kind: "icon", id: "star", x: 20, y: 20, size: 15 } });
    ok(d, "add_element", { element: { kind: "shape", type: "polygon", x: 100, y: 60, diameter: 30, sides: 6 } });
    ok(d, "add_element", { element: { kind: "library", id: "paw", x: 150, y: 60 } });
    ok(d, "add_element", { element: { kind: "hole", x: 10, y: 10, diameter: 5 } });
    ok(d, "add_element", { element: { kind: "slot", x: 100, y: 100, length: 14, width: 6 } });
    const s = d.design.spec;
    expect([s.texts!.length, s.icons!.length, s.shapes!.length, s.svgs!.length, s.holes!.length, s.slots!.length]).toEqual([1, 1, 1, 1, 1, 1]);
    expect(s.svgs![0].name).toBe("Paw");
    expect(d.changes).toHaveLength(6);
    expect(err(d, "add_element", { element: { kind: "shape", type: "hexagon", x: 1, y: 1 } })).toMatch(/Unknown shape type/);
    expect(err(d, "add_element", { element: { kind: "library", id: "unicorn", x: 1, y: 1 } })).toMatch(/list_library/);
    expect(err(d, "add_element", { element: { kind: "icon", id: "heart", x: 1, y: 1, size: 10, color: "red" } })).toMatch(/Unknown field/);
  });

  it("enforces the engine's element limits", () => {
    const d = newDraft(ctx(F.blank()));
    for (let i = 0; i < 6; i++) ok(d, "add_element", { element: { kind: "text", content: `T${i}`, size: 8 } });
    expect(err(d, "add_element", { element: { kind: "text", content: "one too many", size: 8 } })).toMatch(/texts/);
  });

  it("removes several elements and reports the shifted ids", () => {
    const d = newDraft(ctx(F.blank()));
    for (const x of [10, 20, 30]) ok(d, "add_element", { element: { kind: "hole", x, y: 10, diameter: 5 } });
    const out = ok(d, "remove_element", { ids: ["hole:0", "hole:2"] });
    expect(d.design.spec.holes).toEqual([{ x: 20, y: 10, diameter: 5 }]);
    expect(out).toMatch(/Element ids now: hole:0/);
  });

  it("moves and aligns by box center", () => {
    const d = newDraft(ctx());
    ok(d, "move_element", { id: "icon:0", x: 50, y: 150 });
    expect([d.design.spec.icons![0].x, d.design.spec.icons![0].y]).toEqual([50, 150]);
    ok(d, "align_elements", { ids: ["shape:0"], horizontal: "right", vertical: "top", to: "board", inset: 10 });
    const st = d.design.spec.shapes![0] as { x: number; y: number };
    expect(st.x).toBeCloseTo(170, 0); // 40 mm star, 10 mm from the right edge of a 200 mm sign
    expect(st.y).toBeGreaterThan(150);
  });

  it("centers a group as a whole", () => {
    const d = newDraft(ctx(F.offCenter()));
    ok(d, "align_elements", { ids: [], horizontal: "center", vertical: "keep", to: "board", inset: 0 });
    // Both were at x 70; they move together to the middle of the 240 mm sign.
    expect(d.design.spec.icons![0].x).toBeCloseTo(120, 0);
    expect(d.design.spec.texts![0].x).toBeCloseTo(120, 0);
  });

  it("sets the board, keeping fields that weren't given", () => {
    const d = newDraft(ctx(F.smith()));
    ok(d, "set_board", { width: 304.8, edge: { type: "chamfered" } });
    expect(d.design.spec.width).toBe(304.8);
    expect(d.design.spec.height).toBe(150);
    expect(d.design.spec.edge).toEqual({ type: "chamfered", radius: 10 });
    ok(d, "set_board", { material: "walnut" });
    expect([d.design.material, d.design.spec.material, d.design.spec.thickness]).toEqual(["Walnut", "hardwood", 15]);
    expect(err(d, "set_board", { inlay: { part: "pocket" } })).toMatch(/inlay wizard/);
    expect(err(d, "set_board", { texts: [] })).toMatch(/Unknown board field/);
    expect(err(d, "set_board", { width: -5 })).toMatch(/width/);
  });

  it("styles elements (all when no ids are given)", () => {
    const d = newDraft(ctx());
    ok(d, "set_style", { ids: [], style: "raised", depth: 0 });
    expect([d.design.spec.icons![0].mode, d.design.spec.shapes![0].mode]).toEqual(["relief", "relief"]);
    ok(d, "set_style", { ids: ["icon:0"], style: "part", depth: 0 });
    expect(d.design.spec.icons![0].mode).toBe("part");
    expect(err(d, "set_style", { ids: [], style: "keep", depth: 0 })).toMatch(/Nothing to change/);
  });

  it("makes copies with names and removes them", () => {
    const d = newDraft(ctx(F.blank()));
    ok(d, "add_element", { element: { kind: "shape", type: "rectangle", x: 40, y: 100, width: 60, height: 24, mode: "part" } });
    ok(d, "add_element", { element: { kind: "text", content: "Ava", size: 10, x: 40, y: 100 } });
    ok(d, "set_copies", { ids: ["shape:0", "text:0"], rows: 3, cols: 2, dx: 0, dy: 0, alternate: false, texts: ["Ben", "Cara", "Dev", "Eli", "Finn"] });
    const t = d.design.spec.texts![0];
    expect(t.copies).toMatchObject({ rows: 3, cols: 2, texts: ["Ben", "Cara", "Dev", "Eli", "Finn"] });
    expect(t.copies!.dx).toBeGreaterThan(60); // automatic spacing: group width + 6
    expect(d.design.spec.shapes![0].copies?.texts).toBeUndefined(); // names only on texts
    expect(err(d, "set_copies", { ids: ["text:0"], rows: 1, cols: 2, dx: 0, dy: 0, alternate: false, texts: ["a", "b"] })).toMatch(/2 texts for 1 copies/);
    ok(d, "set_copies", { ids: ["shape:0", "text:0"], rows: 1, cols: 1, dx: 0, dy: 0, alternate: false, texts: [] });
    expect(d.design.spec.texts![0].copies).toBeUndefined();
  });

  it("only selects bits the user owns", () => {
    const d = newDraft(ctx());
    ok(d, "select_bit", { slot: "main", bit_id: "vbit-60-15mm" });
    expect(d.design.bit).toBe("vbit-60-15mm");
    expect(err(d, "select_bit", { slot: "main", bit_id: "vbit-30-1-8" })).toMatch(/My bits/);
    expect(err(d, "select_bit", { slot: "main", bit_id: "surfacing-22mm" })).toMatch(/not a bit/);
    ok(d, "select_bit", { slot: "second", bit_id: "flat-1-4-upcut" });
    expect([d.design.bit2, d.design.useBit2]).toEqual(["flat-1-4-upcut", true]);
    ok(d, "select_bit", { slot: "second", bit_id: "" });
    expect(d.design.useBit2).toBe(false);
  });

  it("sets speed and tabs", () => {
    const d = newDraft(ctx());
    ok(d, "set_speed", { preset: "detailed" });
    ok(d, "set_tabs", { count: 6, height: 0, width: 8 });
    expect(d.design.preset).toBe("detailed");
    expect(d.design.tabs).toMatchObject({ count: 6, width: 8, mode: "auto" });
    expect(err(d, "set_tabs", { count: 4, height: 50, width: 0 })).toMatch(/lower than the board/);
  });

  it("records questions and Pro actions without changing the design", () => {
    const d = newDraft(ctx());
    ok(d, "ask_clarifying_question", { question: "Which one?", options: ["Heart", "Star"] });
    ok(d, "open_pro_feature", { feature: "inlay", ids: ["icon:0"] });
    expect(d.question).toEqual({ question: "Which one?", options: ["Heart", "Star"] });
    expect(d.action).toEqual({ feature: "inlay", elementIds: ["i:0"] });
    expect(changed(d)).toBe(false);
  });

  it("describes the design with ids, boxes and inches", () => {
    const text = describeDraft(newDraft(ctx(F.smith())));
    expect(text).toMatch(/300 × 150 mm \(11.81 × 5.91 in\)/);
    expect(text).toMatch(/- text:0 Text 'SMITH'/);
    expect(text).toMatch(/LongMill MK2 30×30/);
  });

  it("returns errors for unknown tools and bad input instead of throwing", () => {
    const d = newDraft(ctx());
    expect(runTool(d, "start_job", {})).toEqual({ ok: false, error: 'Unknown tool "start_job".' });
    expect(runTool(d, "move_element", null).ok).toBe(false);
    expect(runTool(d, "move_element", { id: "icon:0", x: "left", y: 3 }).ok).toBe(false);
  });
});
