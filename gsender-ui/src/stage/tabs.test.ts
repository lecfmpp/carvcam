import type { GenerateResult } from "@gsender-next/cam-engine";
import { describe, expect, it } from "vitest";
import { BLANK, migrateToV4, type Design } from "../state/design";
import { engineTabs, tabCount } from "../engine/useEngine";
import { addPosition, evenPositions, loopDist, mmToPosition, movePosition, positionsFromResult, positionToMm, removePosition, tabLimits, tabMarks, tabMask } from "./tabs";

// A 200 × 100 outline at (10, 10) in a 220 × 120 stock; perimeter 600.
const outline = [{ x: 10, y: 10 }, { x: 210, y: 10 }, { x: 210, y: 110 }, { x: 10, y: 110 }];
const result = {
  layout: { stock: { width: 220, height: 120, thickness: 15 }, profile: { label: "sign outline", region: [outline], depth: 15.3 }, engraved: [], relief: null, cutouts: [], holes: [], part: [outline], warnings: [] },
  operations: [{ name: "Profile", type: "profile", tool: 2, depth: 15.3 }],
  tools: [{ id: 1, diameter: 1.5875 }, { id: 2, diameter: 3.175 }],
  tabs: [
    { x: 160, y: 8.4, angle: 0, t: 0.25, outline: 0, width: 6, height: 3, kerf: 3.175 },
    { x: 60, y: 111.6, angle: 180, t: 0.75, outline: 0, width: 6, height: 3, kerf: 3.175 },
  ],
} as unknown as GenerateResult;

describe("tab positions", () => {
  it("spreads evenly like the engine and wraps around the loop", () => {
    expect(evenPositions(4)).toEqual([0.125, 0.375, 0.625, 0.875]);
    expect(loopDist(0.95, 0.05)).toBeCloseTo(0.1);
    expect(movePosition([0.1, 0.5], 1, 1.2)).toEqual([0.1, 0.2]);
    expect(removePosition([0.1, 0.5, 0.7], 1)).toEqual([0.1, 0.7]);
  });

  it("adds a tab in order, but not on top of another one", () => {
    expect(addPosition([0.1, 0.5], 0.3, 0.02)).toEqual([0.1, 0.3, 0.5]);
    const same = [0.1, 0.5];
    expect(addPosition(same, 0.51, 0.02)).toBe(same);
    expect(addPosition(same, 0.09 - 1, 0.02)).toBe(same);
  });

  it("converts between positions and mm along the outline", () => {
    expect(positionToMm(0.25, 600)).toBe(150);
    expect(mmToPosition(150, 600)).toBe(0.25);
    expect(mmToPosition(750, 600)).toBe(0.25);
  });

  it("switches Auto → Manual from where the engine put the tabs", () => {
    expect(positionsFromResult(result, 4)).toEqual([0.25, 0.75]);
    expect(positionsFromResult({ ...result, tabs: [] } as GenerateResult, 3)).toEqual(evenPositions(3));
  });

  it("draws Manual tabs on the bit path, half a bit outside the edge", () => {
    const marks = tabMarks({ count: 4, height: 3, width: 8, mode: "manual", positions: [1 / 12] }, result);
    // 1/12 of 600 = 50 mm from the bottom-left corner, along the bottom edge: (60, 10) → 1.59 mm below it.
    expect(marks).toHaveLength(1);
    expect(marks[0].x).toBeCloseTo(60);
    expect(marks[0].y).toBeCloseTo(10 - 3.175 / 2);
    expect(marks[0]).toMatchObject({ angle: 0, width: 8, kerf: 3.175, index: 0 });
    // Auto: the engine's tabs as they are.
    expect(tabMarks({ count: 4, height: 3, width: 6, mode: "auto" }, result).map((m) => m.x)).toEqual([160, 60]);
    expect(tabMarks(BLANK.tabs, null)).toEqual([]);
  });

  it("limits height to 1 mm under the top and width to what holds", () => {
    expect(tabLimits(15)).toMatchObject({ maxHeight: 10, minWidth: 3 });
    expect(tabLimits(6).maxHeight).toBe(5);
    expect(tabLimits(1).maxHeight).toBe(0.5);
  });

  it("marks only the cells under a tab", () => {
    const grid = { x0: 0, y0: 0, cols: 40, rows: 20, res: 0.5 };
    const mask = tabMask(grid, [{ x: 10, y: 5, angle: 0, width: 6, kerf: 2, index: 0, outline: 0 }], 0);
    const at = (x: number, y: number) => mask[Math.round(y / 0.5) * 40 + Math.round(x / 0.5)];
    expect(at(10, 5)).toBe(1);
    expect(at(12.5, 5.5)).toBe(1);
    expect(at(14, 5)).toBe(0);
    expect(at(10, 7)).toBe(0);
    // Rotated 90°: now tall, not wide.
    const rot = tabMask(grid, [{ x: 10, y: 5, angle: 90, width: 6, kerf: 2, index: 0, outline: 0 }], 0);
    expect(rot[Math.round(7.5 / 0.5) * 40 + 20]).toBe(1);
    expect(rot[10 * 40 + Math.round(12.5 / 0.5)]).toBe(0);
  });
});

describe("tabs in the design and the engine options", () => {
  it("v3 designs get the default width and Auto, so their G-code does not change", () => {
    const old = { ...BLANK, tabs: { count: 3, height: 2.5 } } as unknown as Design;
    const d = migrateToV4(old);
    expect(d.tabs).toEqual({ count: 3, height: 2.5, width: 6, mode: "auto" });
    expect(engineTabs(d.tabs)).toEqual({ count: 3, height: 2.5, width: 6 });
    expect(migrateToV4({ ...BLANK, tabs: { count: 2, height: 3, width: 9, mode: "manual", positions: [0.2, Number.NaN] } }).tabs).toEqual({ count: 2, height: 3, width: 9, mode: "manual", positions: [0.2] });
  });

  it("Manual sends the positions (and an empty list means no tabs)", () => {
    const t = { count: 4, height: 3, width: 7, mode: "manual" as const, positions: [0.1, 0.6] };
    expect(engineTabs(t)).toEqual({ count: 4, height: 3, width: 7, positions: [0.1, 0.6] });
    expect(tabCount(t)).toBe(2);
    expect(engineTabs({ ...t, positions: undefined }).positions).toEqual([]);
    expect(tabCount({ ...t, mode: "auto" })).toBe(4);
  });
});
