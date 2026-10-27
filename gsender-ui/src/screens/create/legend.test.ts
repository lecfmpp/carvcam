import type { GenerateResult } from "@gsender-next/cam-engine";
import { describe, expect, it } from "vitest";
import { cornerNote, issuesNote, legendRows, stepoverNote } from "./legend";

const sq = [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]];
const layout = (p: Partial<GenerateResult["layout"]>) => ({ stock: { width: 220, height: 140, thickness: 15 }, part: sq, engraved: [], relief: null, cutouts: [], holes: [], profile: null, warnings: [], ...p });
const res = (p: Partial<GenerateResult["layout"]>, extra: object = {}) => ({ layout: layout(p), params: { main: { stepover: 1.27 } }, tabs: [], ...extra }) as unknown as GenerateResult;

describe("canvas legend", () => {
  it("a plain sign with a cut-out and tabs", () => {
    const r = res({ profile: { label: "sign outline", region: sq, depth: 15.3 } });
    expect(legendRows({ result: r, thickness: 15, tabs: 4, leftover: false })).toEqual([
      { key: "face", label: "Top of the wood, not carved" },
      { key: "through", label: "Cut all the way through" },
      { key: "tabs", label: "4 tabs keep the piece attached" },
    ]);
  });

  it("raised text with material left: no cut-through row, no tabs row without a cut-out", () => {
    const r = res({ relief: { label: "background", region: sq, depth: 3 } });
    expect(legendRows({ result: r, thickness: 15, tabs: 4, leftover: true }).map((x) => x.label)).toEqual([
      "Top of the wood, not carved",
      "Carved down 3 mm",
      "Too tight for the bit: sand or carve by hand",
    ]);
  });

  it("several depths show a range; engraving through the board counts as cut through", () => {
    const r = res({ engraved: [{ label: "a", region: sq, depth: 1.5 }, { label: "b", region: sq, depth: 4 }, { label: "c", region: sq, depth: 15 }] as never });
    const rows = legendRows({ result: r, thickness: 15, tabs: 0, leftover: false });
    expect(rows.map((x) => x.key)).toEqual(["face", "lowered", "through"]);
    expect(rows[1].label).toBe("Carved down 1.5–4 mm");
    expect(legendRows({ result: null, thickness: 15, tabs: 0, leftover: false })).toEqual([]);
  });

  it("readable notes instead of the old mono footer", () => {
    expect(cornerNote({ inch: "1/8″", d: 3.175, profile: "flat" })).toBe("1/8″ bit: inside corners come out rounded (1.6 mm radius)");
    expect(cornerNote({ inch: "60°", d: 12.7, profile: "v" })).toBeNull();
    expect(stepoverNote(res({}), 3.175)).toBe("Pockets are cleared in 1.3 mm steps (40% of the bit)");
    expect(issuesNote(0, 1)).toBe("1 thing to check");
    expect(issuesNote(2, 3)).toBe("2 problems to fix");
    expect(issuesNote(0, 0)).toBeNull();
  });
});
