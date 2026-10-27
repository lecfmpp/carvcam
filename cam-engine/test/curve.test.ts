import { describe, expect, it } from "vitest";
import { area, bounds } from "../src/geometry/clip.js";
import { curve } from "../src/geometry/shapes.js";
import { generatePlate } from "../src/generate.js";

const K = 0.5523; // Bézier handle length that approximates a quarter circle
const circleNodes = (r: number) => [
  { x: r, y: 0, ix: 0, iy: -r * K, ox: 0, oy: r * K },
  { x: 0, y: r, ix: r * K, iy: 0, ox: -r * K, oy: 0 },
  { x: -r, y: 0, ix: 0, iy: r * K, ox: 0, oy: -r * K },
  { x: 0, y: -r, ix: -r * K, iy: 0, ox: r * K, oy: 0 },
];

describe("freeform curve", () => {
  it("nodes without handles form a polygon", () => {
    const r = curve(10, 10, [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }], true, 3);
    expect(area(r)).toBeCloseTo(200, 6);
    expect(bounds(r).minX).toBeCloseTo(10, 6);
  });

  it("four Béziers with handles approximate a circle", () => {
    const r = curve(0, 0, circleNodes(20), true, 3);
    expect(area(r)).toBeCloseTo(Math.PI * 400, -1);
    expect(bounds(r).maxY).toBeCloseTo(20, 2);
  });

  it("an open curve becomes a stroke with the requested thickness", () => {
    const r = curve(0, 0, [{ x: 0, y: 0 }, { x: 30, y: 0 }], false, 4);
    expect(area(r)).toBeCloseTo(30 * 4 + Math.PI * 4, 0);
  });

  it("generates G-code on a plate", () => {
    const r = generatePlate(
      { width: 120, height: 80, thickness: 12, outerCutout: false, shapes: [{ type: "curve", x: 60, y: 40, nodes: circleNodes(15), closed: true, mode: "engrave", depth: 2 }] },
      { fonts: {}, tool: { cutLength: 22 } },
    );
    expect(r.ok).toBe(true);
    expect(r.layout.engraved[0].ref).toEqual({ type: "shape", index: 0 });
  });
});
