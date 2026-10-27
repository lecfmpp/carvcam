import { beforeAll, describe, expect, it } from "vitest";
import { area, bounds, pointInRegion } from "../src/geometry/clip.js";
import { generatePlate } from "../src/generate.js";
import type { FontMap } from "../src/layout.js";
import { parseSvg, InvalidSvg } from "../src/svg.js";
import { fonts } from "./helpers.js";

let f: FontMap;
beforeAll(async () => {
  f = await fonts();
});

const size = (svg: string) => {
  const d = parseSvg(svg);
  return { ...d, b: bounds(d.region) };
};

describe("parseSvg", () => {
  it("reads mm units from the viewBox and centres the drawing", () => {
    const d = size(`<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 200 100"><rect x="20" y="10" width="40" height="20"/></svg>`);
    expect(d.width).toBeCloseTo(20, 3);
    expect(d.height).toBeCloseTo(10, 3);
    expect(d.b.minX).toBeCloseTo(-10, 3);
    expect(area(d.region)).toBeCloseTo(200, 1);
  });

  it("unitless px is 1/96 inch", () => {
    const d = size(`<svg width="96" height="96"><rect width="96" height="48"/></svg>`);
    expect(d.width).toBeCloseTo(25.4, 3);
    expect(d.height).toBeCloseTo(12.7, 3);
  });

  it("evenodd makes a hole; nonzero with the same winding does not", () => {
    const ring = (rule: string) =>
      `<svg viewBox="0 0 100 100" width="100mm" height="100mm"><path fill-rule="${rule}" d="M0 0H100V100H0Z M25 25H75V75H25Z"/></svg>`;
    expect(area(parseSvg(ring("evenodd")).region)).toBeCloseTo(10000 - 2500, 0);
    expect(area(parseSvg(ring("nonzero")).region)).toBeCloseTo(10000, 0);
    expect(pointInRegion(parseSvg(ring("evenodd")).region, { x: 0, y: 0 })).toBe(false);
  });

  it("circle, arc and curves become outlines with the right area", () => {
    const c = parseSvg(`<svg viewBox="0 0 20 20" width="20mm" height="20mm"><circle cx="10" cy="10" r="10"/></svg>`);
    expect(area(c.region)).toBeCloseTo(Math.PI * 100, 0);
    // Semicircle with a relative arc and glued-together flags.
    const a = parseSvg(`<svg viewBox="0 0 20 20" width="20mm" height="20mm"><path d="M0 10a10 10 0 01 20 0z"/></svg>`);
    expect(area(a.region)).toBeCloseTo((Math.PI * 100) / 2, 0);
    expect(a.height).toBeCloseTo(10, 1);
  });

  it("applies group transforms and Y up", () => {
    // A wide rectangle at the top of the SVG (small Y) must end up at the top of the part.
    const d = parseSvg(
      `<svg viewBox="0 0 100 100" width="100mm" height="100mm"><g transform="translate(10 0) scale(2)"><rect x="0" y="0" width="10" height="5"/></g><rect x="0" y="90" width="5" height="10"/></svg>`,
    );
    expect(d.width).toBeCloseTo(30, 3);
    expect(d.height).toBeCloseTo(100, 3);
    // The wide rectangle (20 × 10) is at the top: a point on the right side, at the top, is filled.
    expect(pointInRegion(d.region, { x: 10, y: 45 })).toBe(true);
    expect(pointInRegion(d.region, { x: 10, y: -45 })).toBe(false);
  });

  it("an unfilled stroke becomes a band as wide as the stroke", () => {
    const d = parseSvg(`<svg viewBox="0 0 100 100" width="100mm" height="100mm"><line x1="10" y1="50" x2="90" y2="50" stroke="#000" stroke-width="4"/></svg>`);
    expect(d.height).toBeCloseTo(4, 1);
    expect(d.width).toBeCloseTo(84, 1);
  });

  it("classes in <style>, and white fill subtracts", () => {
    const d = parseSvg(
      `<svg viewBox="0 0 100 100" width="100mm" height="100mm"><style>.a{fill:#222}.b{fill:#fff}</style><rect class="a" width="100" height="100"/><circle class="b" cx="50" cy="50" r="20"/></svg>`,
    );
    expect(area(d.region)).toBeCloseTo(10000 - Math.PI * 400, -1);
  });

  it("rejects a file with no cuttable shapes", () => {
    expect(() => parseSvg(`<svg viewBox="0 0 10 10"><text>hi</text></svg>`)).toThrow(InvalidSvg);
    expect(() => parseSvg(`not an svg`)).toThrow(InvalidSvg);
  });
});

describe("SVG on the plate", () => {
  const star = `<svg viewBox="0 0 100 100" width="100mm" height="100mm"><polygon points="50,5 61,38 95,38 67,59 78,92 50,72 22,92 33,59 5,38 39,38"/></svg>`;

  it("generates a plate with an imported drawing in relief and tags the reference", () => {
    const r = generatePlate(
      { width: 160, height: 120, thickness: 12, svgs: [{ content: star, name: "star", x: 80, y: 60, width: 70, mode: "relief", depth: 3 }] },
      { fonts: f, tool: { cutLength: 22 } },
    );
    expect(r.warnings.filter((a) => a.severity === "error")).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.layout?.relief?.items?.[0].ref).toEqual({ type: "svg", index: 0 });
  });

  it("drawing too large suggests a new width; a broken SVG becomes a warning", () => {
    const r = generatePlate(
      { width: 100, height: 80, thickness: 12, svgs: [{ content: star, x: 50, y: 40, width: 150 }, { content: "<svg><g/></svg>", x: 10, y: 10, width: 10 }] },
      { fonts: f, tool: { cutLength: 22 } },
    );
    const nc = r.warnings.find((a) => a.code === "TEXT_DOES_NOT_FIT");
    expect(nc?.fix?.field).toBe("width");
    expect(nc!.fix!.value).toBeLessThan(80);
    expect(r.warnings.find((a) => a.code === "INVALID_SVG")?.element).toEqual({ type: "svg", index: 1 });
  });
});
