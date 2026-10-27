import { describe, expect, it } from "vitest";
import { area } from "../src/geometry/clip.js";
import { ELEMENTS } from "../src/catalog/elements.js";
import { generatePlate } from "../src/generate.js";
import { parseSvg } from "../src/svg.js";

describe("element library", () => {
  it("frames generated at the plate size cut without losing strokes", () => {
    for (const el of ELEMENTS.filter((e) => e.generate)) {
      for (const [W, H] of [[120, 80], [300, 150]]) {
        const w = W - 16;
        const h = H - 16;
        const r = generatePlate(
          { width: W, height: H, thickness: 12, outerCutout: false, svgs: [{ content: el.generate!(w, h), x: W / 2, y: H / 2, width: w, mode: "engrave", depth: 1.5 }] },
          { fonts: {}, tool: { diameter: 3.175, cutLength: 12 } },
        );
        expect(r.ok, `${el.id} ${W}x${H}`).toBe(true);
        const det = r.warnings.find((a) => a.code === "DETAIL_SMALLER_THAN_BIT");
        expect(Number(det?.data?.percent ?? 0), `${el.id} ${W}x${H}`).toBeLessThan(2);
      }
    }
  });

  it("has unique ids and at least 25 elements", () => {
    expect(ELEMENTS.length).toBeGreaterThanOrEqual(25);
    expect(new Set(ELEMENTS.map((e) => e.id)).size).toBe(ELEMENTS.length);
  });

  for (const el of ELEMENTS) {
    it(`${el.id}: parses, has area and generates approved engraving G-code`, () => {
      const d = parseSvg(el.svg);
      expect(area(d.region)).toBeGreaterThan(0);
      const W = Math.max(80, el.width + 30);
      const H = Math.max(60, (el.width * d.height) / d.width + 30);
      const r = generatePlate(
        { width: W, height: H, thickness: 12, outerCutout: false, svgs: [{ content: el.svg, name: el.name, x: W / 2, y: H / 2, width: el.width, mode: "engrave", depth: 1.5 }] },
        { fonts: {}, tool: { diameter: 3.175, cutLength: 12 } },
      );
      expect(r.warnings.filter((a) => a.severity === "error")).toEqual([]);
      expect(r.ok).toBe(true);
      // Only sharp corners may be left uncut: no stroke thinner than the bit.
      const det = r.warnings.find((a) => a.code === "DETAIL_SMALLER_THAN_BIT");
      expect(Number(det?.data?.percent ?? 0)).toBeLessThan(2);
    });
  }
});
