import { beforeAll, describe, expect, it } from "vitest";
import { PathBuilder } from "../src/cam/builder.js";
import { hatch, vcarve } from "../src/cam/operations.js";
import { rect } from "../src/geometry/shapes.js";
import { generatePlate } from "../src/generate.js";
import type { FontMap } from "../src/layout.js";
import { postGrbl } from "../src/post/grbl.js";
import { simulate } from "../src/sim/heightmap.js";
import { ToolSchema } from "../src/schema.js";
import { fonts } from "./helpers.js";

let f: FontMap;
beforeAll(async () => {
  f = await fonts();
});

// 90° V-bit: tan(45°) = 1, so depth = distance to the edge.
const v90 = ToolSchema.parse({ type: "vbit", angle: 90, diameter: 12.7, cutLength: 10, name: "V 90" });

function run(body: (b: PathBuilder) => void) {
  const b = new PathBuilder({ feed: 1000, plunge: 300, retractHeight: 3, safeHeight: 10 });
  body(b);
  b.safe();
  const g = postGrbl({ title: "t", stock: { width: 60, height: 30, thickness: 10 }, safeHeight: 10 }, [{ name: "v", tool: v90, rpm: 18000, moves: b.moves }]);
  return { g, hm: simulate(g, v90, { x0: 0, y0: 0, width: 60, height: 30 }, 0.1) };
}

describe("vcarve", () => {
  it("depth follows the distance to the edge and never passes the wall", () => {
    // 6 mm wide band: the bottom reaches ~3 mm in the middle.
    const { hm } = run((b) => vcarve(b, rect(10, 12, 40, 6), { halfAngle: Math.PI / 4, maxDepth: 8, stepdown: 10, direction: "conventional" }));
    expect(hm.at(30, 15)).toBeCloseTo(-3, 0);
    expect(hm.at(30, 15)).toBeLessThan(-2.7);
    // 1 mm from the edge, 1 mm deep (the cone touches the wall).
    expect(hm.at(30, 13)).toBeCloseTo(-1, 0);
    expect(Math.abs(hm.at(30, 13) + 1)).toBeLessThan(0.25);
    // Outside the band, nothing.
    expect(hm.at(30, 11.8)).toBe(0);
    expect(hm.at(30, 18.2)).toBe(0);
  });

  it("with a depth limit, the middle is flat at the limit and the flat area is reported", () => {
    let res = { flatArea: 0 };
    const { hm } = run((b) => {
      res = vcarve(b, rect(10, 10, 40, 10), { halfAngle: Math.PI / 4, maxDepth: 2, stepdown: 10, direction: "conventional" });
    });
    expect(res.flatArea).toBeGreaterThan(36 * 6 * 0.9);
    // Flat bottom cleared with the V-bit itself: ridges of up to ~0.08 mm between passes.
    for (const y of [13, 14, 15, 16, 17]) expect(Math.abs(hm.at(30, y) + 2)).toBeLessThan(0.1);
    expect(hm.at(30, 11)).toBeCloseTo(-1, 0);
  });

  it("passes: no ring goes down more than one stepdown at a time", () => {
    const { g } = run((b) => vcarve(b, rect(10, 10, 40, 10), { halfAngle: Math.PI / 4, maxDepth: 4, stepdown: 1.5, direction: "conventional" }));
    const zs = [...g.matchAll(/Z(-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
    expect(Math.min(...zs)).toBeCloseTo(-4, 3);
    // The intermediate levels (−1.333 and −2.667) show up as the limit of deep rings.
    expect(zs.some((z) => Math.abs(z + 1.3333) < 0.001)).toBe(true);
    expect(zs.some((z) => Math.abs(z + 2.6667) < 0.001)).toBe(true);
  });
});

describe("hatch", () => {
  it("engraves the outline and parallel lines, leaving material between them", () => {
    const { hm } = run((b) => hatch(b, rect(10, 5, 40, 20), { radius: 0, depth: 0.5, stepdown: 1, spacing: 3, angle: 0, direction: "conventional" }));
    // Horizontal lines at y = 6.5; 9.5; ... (starts at half the spacing).
    expect(hm.at(30, 6.5)).toBeCloseTo(-0.5, 1);
    expect(hm.at(30, 9.5)).toBeCloseTo(-0.5, 1);
    expect(hm.at(30, 8)).toBe(0);
    // Outline at the edge.
    expect(hm.at(10, 15)).toBeCloseTo(-0.5, 1);
  });
});

describe("generatePlate with a V-bit", () => {
  it("engraving becomes an approved V-carve; hatch becomes its own operation", () => {
    const r = generatePlate(
      {
        width: 160,
        height: 80,
        thickness: 12,
        outerCutout: false,
        texts: [{ content: "HI", size: 30, mode: "engrave", depth: 6 }],
        shapes: [{ type: "rectangle", x: 130, y: 40, width: 30, height: 30, mode: "engrave", depth: 0.5, hatch: { spacing: 2, angle: 45 } }],
      },
      { fonts: f, tool: { type: "vbit", angle: 60, diameter: 12.7, cutLength: 12, name: "V 60" } },
    );
    expect(r.warnings.filter((a) => a.severity === "error")).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.operations.map((o) => o.name)).toEqual(["V-carve: text 1 (HI)", "Hatch: rectangle 1"]);
    expect(r.verification?.ok).toBe(true);
  });

  it("hatch denser than the bit warns and suggests a spacing", () => {
    const r = generatePlate(
      { width: 120, height: 80, thickness: 12, outerCutout: false, shapes: [{ type: "rectangle", x: 60, y: 40, width: 40, height: 40, mode: "engrave", depth: 1, hatch: { spacing: 2, angle: 0 } }] },
      { fonts: f, tool: { diameter: 3.175, cutLength: 12 } },
    );
    const a = r.warnings.find((x) => x.code === "HATCH_TOO_DENSE");
    expect(a?.fix).toEqual({ element: { type: "shape", index: 0 }, field: "hatch.spacing", value: 6 });
  });

  it("warns when the limit leaves a flat bottom", () => {
    const r = generatePlate(
      { width: 120, height: 80, thickness: 12, outerCutout: false, shapes: [{ type: "circle", x: 60, y: 40, diameter: 30, mode: "engrave", depth: 2 }] },
      { fonts: f, tool: { type: "vbit", angle: 60, diameter: 12.7, cutLength: 12, name: "V 60" } },
    );
    const a = r.warnings.find((x) => x.code === "VCARVE_FLAT_BOTTOM");
    expect(a?.element).toEqual({ type: "shape", index: 0 });
  });
});
