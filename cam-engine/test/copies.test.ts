import { beforeAll, describe, expect, it } from "vitest";
import { usableArea, fillArea, gridFits, maxFromGroup, pitch, gridSize } from "../src/cam/copies.js";
import { bounds, type Region } from "../src/geometry/clip.js";
import { generatePlate } from "../src/generate.js";
import type { FontMap } from "../src/layout.js";
import { migrateLegacySpec } from "../src/migrate.js";
import type { PlateSpecInput } from "../src/schema.js";
import { fonts } from "./helpers.js";

let f: FontMap;
beforeAll(async () => {
  f = await fonts();
});

const center = (r: Region) => {
  const b = bounds(r);
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
};
const flat18 = { id: 1, type: "straight" as const, diameter: 3.175, cutLength: 12, name: "1/8" };
const flat14 = { id: 2, type: "straight" as const, diameter: 6.35, cutLength: 20, name: "1/4" };

describe("copies grid: layout", () => {
  const base: PlateSpecInput = { width: 120, height: 100, thickness: 12, outerCutout: false, frame: 0 };

  it("expands rows × columns from the original (columns to the right, rows down)", () => {
    const spec = { ...base, shapes: [{ type: "circle" as const, x: 20, y: 80, diameter: 20, mode: "engrave" as const, copies: { rows: 2, cols: 3, dx: 30, dy: 30 } }] };
    const r = generatePlate(spec, { fonts: f, tool: flat18 });
    expect(r.ok).toBe(true);
    const g = r.layout.engraved;
    expect(g.length).toBe(6);
    expect(g.map((x) => x.copy ?? 0).sort()).toEqual([0, 1, 2, 3, 4, 5]);
    for (const x of g) {
      const k = x.copy ?? 0;
      const c = center(x.region);
      expect(c.x).toBeCloseTo(20 + 30 * (k % 3), 1);
      expect(c.y).toBeCloseTo(80 - 30 * Math.floor(k / 3), 1);
      expect(x.ref).toEqual({ type: "shape", index: 0 });
    }
  });

  it("copies follow the original (they stay linked)", () => {
    const spec = (x: number) => ({ ...base, shapes: [{ type: "circle" as const, x, y: 80, diameter: 20, mode: "engrave" as const, copies: { rows: 1, cols: 3, dx: 30, dy: 0 } }] });
    const a = generatePlate(spec(20), { fonts: f, tool: flat18 }).layout.engraved;
    const b = generatePlate(spec(25), { fonts: f, tool: flat18 }).layout.engraved;
    const byCopy = (l: typeof a) => [...l].sort((p, q) => (p.copy ?? 0) - (q.copy ?? 0));
    const [sa, sb] = [byCopy(a), byCopy(b)];
    sa.forEach((x, i) => expect(center(sb[i].region).x - center(x.region).x).toBeCloseTo(5, 3));
  });

  it("turns every other copy 180° in a checkerboard, around the group center", () => {
    // 5-point star pointing up: turned, the point is at the bottom.
    const spec = { ...base, shapes: [{ type: "star" as const, x: 20, y: 70, diameter: 30, mode: "engrave" as const, copies: { rows: 1, cols: 2, dx: 35, dy: 0, alternate: true } }] };
    const g = generatePlate(spec, { fonts: f, tool: flat18 }).layout.engraved;
    const [a, b] = [g.find((x) => !x.copy)!, g.find((x) => x.copy === 1)!];
    const ba = bounds(a.region);
    const bb = bounds(b.region);
    // Without a pivot it turns around the center of the element's box: the original's top point
    // becomes the copy's bottom point, and the copy stays on the same row.
    const cy = (ba.minY + ba.maxY) / 2;
    expect(ba.maxY - 70).toBeCloseTo(15, 1);
    expect(bb.minY).toBeCloseTo(2 * cy - ba.maxY, 3);
    expect(bb.maxY).toBeCloseTo(2 * cy - ba.minY, 3);
    expect((bb.minX + bb.maxX) / 2 - (ba.minX + ba.maxX) / 2).toBeCloseTo(35, 3);
    // With the group's pivot given, it turns around it.
    const spec2 = { ...spec, shapes: [{ ...spec.shapes[0], copies: { ...spec.shapes[0].copies, pivot: { x: 20, y: 70 } } }] };
    const c2 = generatePlate(spec2, { fonts: f, tool: flat18 }).layout.engraved.find((x) => x.copy === 1)!;
    expect(bounds(c2.region).minY).toBeCloseTo(140 - ba.maxY, 3);
  });

  it("a text can have a different name on each copy", () => {
    const spec = { ...base, width: 200, texts: [{ content: "AVA", size: 12, mode: "engrave" as const, x: 100, y: 80, copies: { rows: 3, cols: 1, dx: 0, dy: 25, texts: ["BENJAMIN", ""] } }] };
    const g = [...generatePlate(spec, { fonts: f, tool: flat18 }).layout.engraved].sort((p, q) => (p.copy ?? 0) - (q.copy ?? 0));
    expect(g.map((x) => x.label)).toEqual(["text 1 (AVA)", "text 1 (BENJAMIN)", "text 1 (AVA) · copy 3"]);
    const w = g.map((x) => bounds(x.region).maxX - bounds(x.region).minX);
    expect(w[1]).toBeGreaterThan(w[0] * 2);
    expect(w[2]).toBeCloseTo(w[0], 3);
    // Same center line (the text is centered where the original is).
    expect(center(g[1].region).x).toBeCloseTo(100, 0);
  });

  it("warns once when the copies run past the edge", () => {
    const spec = { ...base, shapes: [{ type: "circle" as const, x: 20, y: 80, diameter: 20, mode: "engrave" as const, copies: { rows: 1, cols: 5, dx: 30, dy: 0 } }] };
    const r = generatePlate(spec, { fonts: f, tool: flat18 });
    expect(r.ok).toBe(false);
    expect(r.warnings.filter((a) => a.code === "COPIES_DO_NOT_FIT")).toHaveLength(1);
    expect(r.warnings.find((a) => a.code === "COPIES_DO_NOT_FIT")?.element).toEqual({ type: "shape", index: 0 });
    expect(r.warnings.some((a) => a.code === "TEXT_DOES_NOT_FIT")).toBe(false);
  });

  it("loads a grid saved with the early Portuguese field names", () => {
    const old = { largura: 120, altura: 100, espessura: 12, recorteExterno: false, moldura: 0, formas: [{ tipo: "circulo", x: 20, y: 80, diametro: 20, modo: "peca", copias: { linhas: 2, colunas: 3, dx: 30, dy: 30, alternar: true, centro: { x: 20, y: 80 } } }] };
    const spec = migrateLegacySpec<PlateSpecInput>(old);
    expect(spec.shapes?.[0]).toMatchObject({ type: "circle", mode: "part", copies: { rows: 2, cols: 3, dx: 30, dy: 30, alternate: true, pivot: { x: 20, y: 80 } } });
    const r = generatePlate(spec, { fonts: f, tool: flat18 });
    expect(r.layout.parts).toHaveLength(6);
  });
});

describe("copies grid: G-code", () => {
  // Nine tags: a rectangle cut out as a part (with tabs) and an engraved name, 3 × 3.
  const tags: PlateSpecInput = {
    width: 230,
    height: 110,
    thickness: 6,
    outerCutout: false,
    frame: 0,
    shapes: [{ type: "rectangle", x: 40, y: 85, width: 64, height: 26, radius: 4, mode: "part", copies: { rows: 3, cols: 3, dx: 74, dy: 34, pivot: { x: 40, y: 85 } } }],
    texts: [{ content: "AVA", size: 10, mode: "engrave", depth: 1, x: 40, y: 85, copies: { rows: 3, cols: 3, dx: 74, dy: 34, pivot: { x: 40, y: 85 }, texts: ["BEN", "CY", "DEV", "ELI", "FAY", "GUS", "HAL", "IDA"] } }],
  };

  it("changes the bit once for every copy, and cuts the parts after the engravings", () => {
    const r = generatePlate(tags, { fonts: f, tool: flat18, cutoutTool: flat14 });
    expect(r.ok, JSON.stringify(r.warnings)).toBe(true);
    // T1 at the start and one change to T2.
    expect(r.gcode.match(/M6/g)).toHaveLength(2);
    const types = r.operations.map((o) => o.type);
    expect(types.filter((t) => t === "engrave")).toHaveLength(9);
    expect(types.filter((t) => t === "profile")).toHaveLength(9);
    expect(types.lastIndexOf("engrave")).toBeLessThan(types.indexOf("profile"));
    // Every part is cut along the outside, with tabs.
    expect(r.warnings.some((a) => a.code === "SMALL_PART_WITHOUT_TABS")).toBe(false);
  });

  it("goes from one copy to the next one over (not back and forth across the board)", () => {
    const r = generatePlate(tags, { fonts: f, tool: flat18, cutoutTool: flat14 });
    const L = r.layout;
    const centers = (list: typeof L.engraved, names: string[]) => names.map((n) => center(list.find((g) => n.endsWith(g.label))!.region));
    for (const [list, prefix] of [
      [L.engraved, "Engrave: "],
      [L.parts, "Part: "],
    ] as const) {
      const names = r.operations.filter((o) => o.name.startsWith(prefix)).map((o) => o.name);
      const cs = centers(list, names);
      for (let i = 1; i < cs.length; i++) {
        const d = Math.hypot(cs[i].x - cs[i - 1].x, cs[i].y - cs[i - 1].y);
        expect(d).toBeLessThanOrEqual(74 + 0.5);
      }
    }
  });

  it("parts use the job's tab settings", () => {
    const four = generatePlate(tags, { fonts: f, tool: flat18, cutoutTool: flat14, tabs: { count: 4 } });
    const none = generatePlate(tags, { fonts: f, tool: flat18, cutoutTool: flat14, tabs: { count: 0 } });
    // Tabs: the bit lifts on the last passes, so the tabbed job has more lines.
    expect(four.gcode.split("\n").length).toBeGreaterThan(none.gcode.split("\n").length);
  });
});

describe("copies grid: UI maths", () => {
  const group = { x0: 10, y0: 60, x1: 50, y1: 90 };
  const area = usableArea(200, 100, 1);

  it("pitch and grid size", () => {
    const p = pitch(group, 5, 4);
    expect(p).toEqual({ dx: 45, dy: 34 });
    expect(gridSize(group, 2, 3, p.dx, p.dy)).toEqual({ width: 130, height: 64 });
  });

  it("how many fit from the group", () => {
    const p = pitch(group, 5, 4);
    expect(maxFromGroup(group, area, p.dx, p.dy)).toEqual({ cols: 4, rows: 2 });
    expect(gridFits(group, area, 2, 4, p.dx, p.dy)).toBe(true);
    expect(gridFits(group, area, 2, 5, p.dx, p.dy)).toBe(false);
    expect(gridFits(group, area, 3, 4, p.dx, p.dy)).toBe(false);
  });

  it("filling the board centers the grid", () => {
    const p = pitch(group, 5, 5);
    const e = fillArea(group, area, p.dx, p.dy)!;
    expect(e.cols).toBe(4); // 4·40 + 3·5 = 175 ≤ 198
    expect(e.rows).toBe(2); // 2·30 + 5 = 65 ≤ 98
    const g2 = { x0: group.x0 + e.move.dx, x1: group.x1 + e.move.dx, y0: group.y0 + e.move.dy, y1: group.y1 + e.move.dy };
    expect(gridFits(g2, area, e.rows, e.cols, p.dx, p.dy)).toBe(true);
    // Same space left on both sides.
    expect(g2.x0 - area.x0).toBeCloseTo(area.x1 - (g2.x0 + 175), 6);
    expect(fillArea({ x0: 0, y0: 0, x1: 300, y1: 10 }, area, 305, 15)).toBeNull();
  });
});
