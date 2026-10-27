import { beforeAll, describe, expect, it } from "vitest";
import { area, bounds, pointInRegion } from "../src/geometry/clip.js";
import { polygon, star } from "../src/geometry/shapes.js";
import { textToRegion } from "../src/geometry/text.js";
import { generatePlate } from "../src/generate.js";
import type { FontMap } from "../src/layout.js";
import type { PlateSpecInput } from "../src/schema.js";
import { fonts } from "./helpers.js";

let f: FontMap;
beforeAll(async () => {
  f = await fonts();
});

const gen = (spec: PlateSpecInput) => generatePlate(spec, { fonts: f, tool: { cutLength: 22 } });
const engraved = (r: ReturnType<typeof gen>) => r.layout.engraved;

describe("new shapes", () => {
  it("hexagon and star have the expected area", () => {
    // Hexágono regular de raio 10: 3√3/2 · r².
    expect(area(polygon(0, 0, 10, 6))).toBeCloseTo((3 * Math.sqrt(3) * 100) / 2, 3);
    const s = star(0, 0, 10, 5, 0.5);
    const b = bounds(s);
    expect(b.maxY).toBeCloseTo(10, 6);
    expect(area(s)).toBeGreaterThan(0);
    expect(area(s)).toBeLessThan(Math.PI * 100 * 0.5);
  });

  it("polygon and star become cuts on the plate", () => {
    const r = gen({
      width: 160,
      height: 100,
      thickness: 12,
      shapes: [
        { type: "polygon", x: 50, y: 50, diameter: 40, sides: 6 },
        { type: "star", x: 110, y: 50, diameter: 50, points: 5 },
      ],
    });
    expect(r.ok).toBe(true);
    expect(engraved(r).map((g) => g.ref)).toEqual([
      { type: "shape", index: 0 },
      { type: "shape", index: 1 },
    ]);
  });
});

describe("text on an arc", () => {
  it("curving up: the middle sits higher than the ends", () => {
    const straight = bounds(textToRegion(f["archivo-black"]!, "ARCO ARCO", 10));
    const arc = textToRegion(f["archivo-black"]!, "ARCO ARCO", 10, 40);
    const b = bounds(arc);
    expect(b.maxX - b.minX).toBeLessThan(straight.maxX - straight.minX);
    expect(b.maxY - b.minY).toBeGreaterThan(straight.maxY - straight.minY + 5);
    // O topo do meio está perto de y = altura das letras; as pontas descem.
    expect(b.minY).toBeLessThan(-5);
  });

  it("curving down mirrors the direction", () => {
    const b = bounds(textToRegion(f["archivo-black"]!, "ARCO ARCO", 10, -40));
    expect(b.maxY).toBeGreaterThan(14);
    expect(b.minY).toBeGreaterThan(-1);
  });
});

describe("element adjustments", () => {
  const base: PlateSpecInput = { width: 160, height: 100, thickness: 12, outerCutout: false };

  it("offset thickens the shape", () => {
    const a = engraved(gen({ ...base, shapes: [{ type: "circle", x: 80, y: 50, diameter: 20 }] }))[0];
    const b = engraved(gen({ ...base, shapes: [{ type: "circle", x: 80, y: 50, diameter: 20, offset: 5 }] }))[0];
    expect(area(a.region)).toBeCloseTo(Math.PI * 100, 0);
    expect(area(b.region)).toBeCloseTo(Math.PI * 225, 0);
  });

  it("outline adds a ring separate from the element", () => {
    const g = engraved(gen({ ...base, shapes: [{ type: "circle", x: 80, y: 50, diameter: 20, outline: { distance: 3, width: 2 } }] }))[0];
    expect(area(g.region)).toBeCloseTo(Math.PI * 100 + Math.PI * (15 * 15 - 13 * 13), 0);
    expect(pointInRegion(g.region, { x: 80 + 11.5, y: 50 })).toBe(false); // vão entre o círculo e o anel
    expect(pointInRegion(g.region, { x: 80 + 14, y: 50 })).toBe(true);
  });

  it("subtract makes a moon; mask cuts what falls outside the circle", () => {
    const moon = engraved(
      gen({
        ...base,
        shapes: [
          { type: "circle", x: 80, y: 50, diameter: 40 },
          { type: "circle", x: 92, y: 56, diameter: 36, operation: "subtract" },
        ],
      }),
    );
    expect(moon).toHaveLength(1);
    expect(pointInRegion(moon[0].region, { x: 92, y: 56 })).toBe(false);
    expect(pointInRegion(moon[0].region, { x: 64, y: 46 })).toBe(true);

    const mask = engraved(
      gen({
        ...base,
        shapes: [
          { type: "rectangle", x: 80, y: 50, width: 100, height: 10 },
          { type: "circle", x: 80, y: 50, diameter: 40, operation: "mask" },
        ],
      }),
    );
    expect(mask).toHaveLength(1);
    const b = bounds(mask[0].region);
    expect(b.maxX - b.minX).toBeLessThan(40.1);
  });

  it("subtract and mask with targets only affect the chosen elements", () => {
    const g = engraved(
      gen({
        ...base,
        shapes: [
          { type: "circle", x: 60, y: 50, diameter: 30 },
          { type: "circle", x: 100, y: 50, diameter: 30 },
          // Faixa que cobre os dois, mas só corta o segundo.
          { type: "rectangle", x: 80, y: 50, width: 100, height: 6, operation: "subtract", targets: [{ type: "shape", index: 1 }] },
        ],
      }),
    );
    expect(g).toHaveLength(2);
    expect(pointInRegion(g[0].region, { x: 60, y: 50 })).toBe(true);
    expect(pointInRegion(g[1].region, { x: 100, y: 50 })).toBe(false);

    const m = engraved(
      gen({
        ...base,
        shapes: [
          { type: "rectangle", x: 50, y: 50, width: 60, height: 10 },
          { type: "rectangle", x: 110, y: 50, width: 60, height: 10 },
          { type: "circle", x: 80, y: 50, diameter: 100, operation: "mask", targets: [] },
        ],
      }),
    );
    // Lista vazia: a máscara não afeta ninguém.
    expect(area(m[0].region)).toBeCloseTo(600, 0);
    expect(area(m[1].region)).toBeCloseTo(600, 0);
  });

  it("shallow engraving on the relief floor warns and suggests engraving deeper", () => {
    const r = gen({
      width: 160,
      height: 100,
      thickness: 12,
      texts: [{ content: "OI", size: 20, mode: "relief", depth: 3, x: 50, y: 50 }],
      shapes: [{ type: "circle", x: 120, y: 50, diameter: 20, mode: "engrave", depth: 2 }],
    });
    const a = r.warnings.find((x) => x.code === "ENGRAVED_IN_FLOOR");
    expect(a?.element).toEqual({ type: "shape", index: 0 });
    expect(a?.fix?.value).toBe(4);
  });

  it("thinning until it disappears is an error with a fix", () => {
    const r = gen({ ...base, shapes: [{ type: "circle", x: 80, y: 50, diameter: 10, offset: -6 }] });
    const a = r.warnings.find((x) => x.code === "ELEMENT_NOT_MACHINABLE");
    expect(a?.fix).toEqual({ element: { type: "shape", index: 0 }, field: "offset", value: 0 });
  });
});
