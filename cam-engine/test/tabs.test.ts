import { beforeAll, describe, expect, it } from "vitest";
import { generatePlate, type GenerateOptions } from "../src/generate.js";
import { parseLines, toSegments } from "../src/gcode.js";
import type { FontMap } from "../src/layout.js";
import { canonicalOutline, fractionOnOutline, nearestTabFraction, pointAtFraction } from "../src/cam/tabs.js";
import { example, fonts } from "./helpers.js";

const RECT = [
  { x: 0, y: 0 },
  { x: 0, y: 100 },
  { x: 200, y: 100 },
  { x: 200, y: 0 },
]; // clockwise on purpose

describe("tab position math", () => {
  it("starts at the lowest-left point and runs counter-clockwise", () => {
    const c = canonicalOutline(RECT);
    expect(c[0]).toEqual({ x: 0, y: 0 });
    expect(c[1]).toEqual({ x: 200, y: 0 });
    // Perimeter 600: 1/3 = (200, 0) corner, 0.5 = (200, 100).
    expect(pointAtFraction(c, 1 / 6).x).toBeCloseTo(100, 9);
    expect(pointAtFraction(c, 0.5)).toMatchObject({ x: 200, y: 100 });
    // Outward normal on the bottom edge points down.
    const p = pointAtFraction(c, 0.1);
    expect(p.nx).toBeCloseTo(0);
    expect(p.ny).toBeCloseTo(-1);
    expect(pointAtFraction(c, 1.25)).toMatchObject(pointAtFraction(c, 0.25));
  });

  it("fraction ↔ point round-trips and ignores where the vertex list starts", () => {
    const rotated = [RECT[2], RECT[3], RECT[0], RECT[1]];
    for (const t of [0, 0.07, 0.33, 0.5, 0.91]) {
      const pt = pointAtFraction(canonicalOutline(RECT), t);
      expect(fractionOnOutline(canonicalOutline(rotated), pt).t).toBeCloseTo(t, 6);
    }
    const near = nearestTabFraction([canonicalOutline(RECT)], { x: 50, y: -4 });
    expect(near).toMatchObject({ outline: 0 });
    expect(near!.t).toBeCloseTo(50 / 600, 6);
    expect(near!.dist).toBeCloseTo(4, 6);
  });
});

describe("holding tabs in the G-code", () => {
  let f: FontMap;
  const sign = { type: "plate", width: 200, height: 100, thickness: 15, material: "mdf", texts: [{ content: "Hi", font: "archivo-black", size: 30, mode: "engrave", depth: 1.5 }], edge: { type: "straight" } } as const;
  const tool = { id: 1, name: "1/8", diameter: 3.175, flutes: 2, cutLength: 22 };
  const r = tool.diameter / 2;
  const gen = (tabs?: GenerateOptions["tabs"], spec: object = sign) => generatePlate(spec as never, { fonts: f, tool, tabs });

  /** Stretches of the profile cut where the bit rides at the tab top (one per tab). */
  function tabRuns(gcode: string, tabTop: number) {
    const segs = toSegments(parseLines(gcode), { x: 0, y: 0, z: 10 });
    const runs: { len: number; mid: { x: number; y: number } }[] = [];
    let cur: { len: number; a: { x: number; y: number }; b: { x: number; y: number } } | null = null;
    for (const g of segs) {
      const flat = !g.rapid && Math.abs(g.from.z - tabTop) < 1e-3 && Math.abs(g.to.z - tabTop) < 1e-3;
      const len = Math.hypot(g.to.x - g.from.x, g.to.y - g.from.y);
      if (flat && len > 0) {
        if (cur) {
          cur.len += len;
          cur.b = g.to;
        } else cur = { len, a: g.from, b: g.to };
      } else if (cur && (len > 0 || g.rapid || Math.abs(g.to.z - tabTop) > 1e-3)) {
        runs.push({ len: cur.len, mid: { x: (cur.a.x + cur.b.x) / 2, y: (cur.a.y + cur.b.y) / 2 } });
        cur = null;
      }
    }
    return runs;
  }

  beforeAll(async () => {
    f = await fonts();
  });

  it("without positions the output is exactly the same as before the option existed", () => {
    const a = gen({ count: 4, width: 6, height: 3 });
    expect(gen({ count: 4, width: 6, height: 3, positions: undefined }).gcode).toBe(a.gcode);
    expect(gen(undefined).gcode).toBe(a.gcode);
    // Even spacing: (i + 0.5) / count of the bit path.
    expect(a.tabs).toHaveLength(4);
    expect(a.tabs.every((t) => t.width === 6 && t.height === 3 && t.kerf === 3.175)).toBe(true);
  });

  it("the width sets the length of wood left along the edge", () => {
    for (const width of [4, 6, 12]) {
      const res = gen({ count: 3, width, height: 4 });
      const runs = tabRuns(res.gcode, -(15 - 4));
      // The bit stays up for the tab plus its own diameter, on every pass that would cut lower.
      expect(runs.length).toBeGreaterThanOrEqual(3);
      for (const run of runs) expect(run.len).toBeCloseTo(width + 2 * r, 1);
      expect(res.warnings.some((w) => w.code === "TAB_TOO_NARROW")).toBe(false);
    }
  });

  it("puts manual tabs where they are asked for", () => {
    const positions = [0.1, 0.45, 0.8];
    const res = gen({ positions, width: 8, height: 4 });
    expect(res.ok).toBe(true);
    expect(res.tabs).toHaveLength(3);
    const outline = canonicalOutline(res.layout.profile!.region[0]);
    for (const t of positions) {
      const want = pointAtFraction(outline, t);
      // On the bit path: one radius outside the edge.
      const hit = res.tabs.find((p) => Math.hypot(p.x - (want.x + want.nx * r), p.y - (want.y + want.ny * r)) < 0.3);
      expect(hit, `tab at ${t}`).toBeTruthy();
      expect(hit!.t).toBeCloseTo(t, 2);
    }
    // And the G-code leaves wood exactly there.
    const runs = tabRuns(res.gcode, -(15 - 4));
    for (const t of positions) {
      const want = pointAtFraction(outline, t);
      expect(runs.some((run) => Math.hypot(run.mid.x - (want.x + want.nx * r), run.mid.y - (want.y + want.ny * r)) < 0.5)).toBe(true);
    }
  });

  it("handles a tab on the path start and drops tabs that would overlap", () => {
    const res = gen({ positions: [0, 0.001, 0.5], width: 6, height: 3 });
    expect(res.ok).toBe(true);
    expect(res.tabs).toHaveLength(2);
    // The plunge never lands inside a tab: every tab run sits between full-depth cuts.
    const runs = tabRuns(res.gcode, -12);
    for (const run of runs) expect(run.len).toBeCloseTo(6 + 2 * r, 1);
  });

  it("an empty position list means no tabs (and the usual warning stays silent)", () => {
    const res = gen({ positions: [], width: 6, height: 3 });
    expect(res.tabs).toEqual([]);
    expect(tabRuns(res.gcode, -12)).toEqual([]);
  });

  it("warns about tabs that are too narrow to hold", () => {
    const w = gen({ count: 4, width: 2, height: 3 }).warnings.find((x) => x.code === "TAB_TOO_NARROW");
    expect(w).toMatchObject({ severity: "warning", data: { width: 2, suggestedWidth: 6 } });
    expect(gen({ count: 0, width: 2 }).warnings.some((x) => x.code === "TAB_TOO_NARROW")).toBe(false);
  });

  it("applies the same positions to every outline of cut-out lettering", () => {
    const ex = example("pacifico-lettering");
    const spec = { ...ex.plate, texts: [{ content: "HI", font: "archivo-black", size: 60 }] };
    const auto = generatePlate(spec, { fonts: f, tool: ex.tool });
    const manual = generatePlate(spec, { fonts: f, tool: ex.tool, tabs: { positions: [0.25, 0.75] } });
    expect(manual.ok).toBe(true);
    expect(new Set(manual.tabs.map((t) => t.outline)).size).toBeGreaterThan(1);
    for (const t of manual.tabs) expect([0.25, 0.75].some((p) => Math.abs(p - t.t) < 0.03)).toBe(true);
    expect(manual.gcode).not.toBe(auto.gcode);
  });
});
