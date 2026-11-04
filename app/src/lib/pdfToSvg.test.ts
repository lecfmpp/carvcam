// PDF import: a vector PDF printed by Chromium (100 × 100 mm page: a 40 mm square, a 20 mm square
// turned 45°, a 30 mm circle, a 30 mm square outline with a 2 mm stroke and a line of text).
import { describe, expect, it } from "vitest";
import { parseSvg } from "@carvcam/cam-engine";
import { operatorListToSvg } from "./pdfToSvg";
import { SHAPES_PDF } from "./__fixtures__/shapesPdf";

const area = (p: { x: number; y: number }[]) => {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j].x + p[i].x) * (p[j].y - p[i].y);
  return a / 2;
};

describe("PDF import", () => {
  it("rebuilds the vector drawing with transforms, clipping and stroke widths", async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const data = Uint8Array.from(atob(SHAPES_PDF), (c) => c.charCodeAt(0));
    const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
    const page = await doc.getPage(1);
    const ops = await page.getOperatorList();
    const r = operatorListToSvg(pdfjs.OPS as never, ops.fnArray, ops.argsArray as unknown[][], page.view);
    const d = parseSvg(r.svg);
    const total = Math.abs(d.region.reduce((s, p) => s + area(p), 0));
    // 1600 + 400 + 706.9 + (32² − 28²) = 2946.9 mm²
    expect(total).toBeGreaterThan(2900);
    expect(total).toBeLessThan(2990);
    expect(d.width).toBeCloseTo(81, 0);
    expect(d.height).toBeCloseTo(85.2, 0);
    expect(r.texts).toBeGreaterThan(0);
    await doc.destroy();
  });
});
