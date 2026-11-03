import type { GenerateResult, PlateSpecInput } from "@carvcam/cam-engine";
import { describe, expect, it } from "vitest";
import { groupOps } from "../job/jobUtil";
import { copyCount, detachCopies, listElements, setCopies, type Box, type ElementId } from "./elements";

const SPEC: PlateSpecInput = {
  type: "plate",
  width: 200,
  height: 120,
  thickness: 6,
  material: "plywood",
  outerCutout: false,
  texts: [{ content: "AVA", font: "archivo-black", size: 10, mode: "engrave", depth: 1, x: 40, y: 100 }],
  shapes: [{ type: "star", x: 40, y: 60, diameter: 20, points: 5, inner: 0.45, rotation: 0, mode: "part", depth: 2 }],
};
const boxes = new Map<ElementId, Box>([
  ["t:0", { cx: 40, cy: 100, w: 30, h: 11 }],
  ["f:0", { cx: 40, cy: 60, w: 20, h: 19 }],
]);
const grid = { rows: 2, cols: 3, dx: 40, dy: 30, alternate: false, pivot: { x: 40, y: 60 } };

describe("copies grid in the editor", () => {
  it("sets the grid on each element; per-copy names stay on texts", () => {
    const s = setCopies(SPEC, ["t:0", "f:0"], { ...grid, texts: ["BEN", "CY"] });
    expect(s.texts?.[0].copies).toMatchObject({ rows: 2, cols: 3, texts: ["BEN", "CY"] });
    expect(s.shapes?.[0].copies?.texts).toBeUndefined();
    expect(copyCount(s.shapes?.[0].copies)).toBe(6);
    expect(listElements(s).find((r) => r.id === "f:0")?.sub).toMatch(/cut out part · ×6$/);
    // A 1 × 1 grid removes the copies.
    expect(setCopies(s, ["f:0"], { ...grid, rows: 1, cols: 1 }).shapes?.[0].copies).toBeUndefined();
  });

  it("separates copies into their own elements, names and turns included", () => {
    const s = setCopies(SPEC, ["t:0", "f:0"], { ...grid, alternate: false, texts: ["BEN", "", "DEV"] });
    const out = detachCopies(s, ["t:0"], boxes);
    if ("error" in out) throw new Error(out.error);
    expect(out.texts?.map((t) => [t.content, t.x, t.y])).toEqual([
      ["AVA", 40, 100],
      ["BEN", 80, 100],
      ["AVA", 120, 100],
      ["DEV", 40, 70],
      ["AVA", 80, 70],
      ["AVA", 120, 70],
    ]);
    expect(out.texts?.[0].copies).toBeUndefined();

    const turned = detachCopies(setCopies(SPEC, ["f:0"], { ...grid, rows: 1, cols: 2, alternate: true }), ["f:0"], boxes);
    if ("error" in turned) throw new Error(turned.error);
    expect(turned.shapes?.[1]).toMatchObject({ x: 80, y: 60, rotation: -180 });
  });

  it("refuses to separate past the spec's limits or turned texts", () => {
    const tooMany = detachCopies(setCopies(SPEC, ["t:0"], { ...grid, rows: 3 }), ["t:0"], boxes);
    expect("error" in tooMany && tooMany.error).toMatch(/up to 6 texts/);
    const turnedText = detachCopies(setCopies(SPEC, ["t:0"], { ...grid, rows: 1, alternate: true }), ["t:0"], boxes);
    expect("error" in turnedText && turnedText.error).toMatch(/can't be separated/);
  });
});

describe("Prepare step names", () => {
  const op = (name: string, type: string, tool: number, depth = 3) => ({ name, type, tool, depth });
  const result = (operations: ReturnType<typeof op>[]) => ({ gcode: "", operations, verification: null }) as unknown as GenerateResult;

  it("names the inlay steps and merges the grid parts into one step", () => {
    const g = groupOps(
      result([
        op("V-carve: inlay pocket", "engrave", 1),
        op("Engrave: text 1 (AVA)", "engrave", 1, 1),
        op("Clear flat bottom: inlay pocket", "engrave", 2),
        op("Part: rectangle 1", "profile", 2, 6.3),
        op("Part: rectangle 1 · copy 2", "profile", 2, 6.3),
        op("Profile: sign outline", "profile", 2, 6.3),
      ]),
      4,
      false,
    );
    expect(g.map((x) => x.label)).toEqual(["V-carve the inlay pocket · 3 mm", "Engrave “AVA”", "Clear the flat bottom of the pocket", "Cut out 2 parts with tabs", "Cut out with 4 tabs"]);
    expect(groupOps(result([op("V-carve: inlay plug", "engrave", 1, 4.5), op("Clear flat bottom: inlay plug", "engrave", 2, 4.5)]), 0, false).map((x) => x.label)).toEqual([
      "V-carve the inlay plug · 4.5 mm",
      "Clear the flat bottom of the plug",
    ]);
  });
});
