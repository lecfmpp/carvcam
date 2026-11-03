import { describe, expect, it } from "vitest";
import { area, bounds, pointInRegion } from "../src/geometry/clip.js";
import { parseSvg } from "../src/svg.js";
import { maskFromRgba, polishMask, regionToSvg, traceMask } from "../src/trace.js";

function disk(w: number, h: number, cx: number, cy: number, r: number, hole = 0) {
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      m[y * w + x] = d <= r && d >= hole ? 1 : 0;
    }
  return m;
}

describe("traceMask", () => {
  it("a disc becomes an outline with the right area", () => {
    const r = traceMask(disk(100, 100, 50, 50, 30), 100, 100);
    expect(r).toHaveLength(1);
    expect(Math.abs(area(r))).toBeCloseTo(Math.PI * 900, -2);
    const b = bounds(r);
    expect(b.maxX - b.minX).toBeGreaterThan(58);
  });

  it("a ring becomes an outline with a hole", () => {
    const r = traceMask(disk(100, 100, 50, 50, 40, 20), 100, 100);
    expect(r).toHaveLength(2);
    expect(pointInRegion(r, { x: 50, y: 50 })).toBe(false);
    expect(pointInRegion(r, { x: 50, y: 20 })).toBe(true);
  });

  it("drops small blobs and survives diagonal-only pixels", () => {
    const m = disk(60, 60, 30, 30, 15);
    m[2 * 60 + 2] = 1; // 1 px speck
    m[50 * 60 + 50] = 1;
    m[51 * 60 + 51] = 1; // two pixels touching diagonally
    const r = traceMask(m, 60, 60, { minBlob: 6 });
    expect(r).toHaveLength(1);
  });

  it("threshold and inversion from RGBA", () => {
    const rgba = new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255, 120, 120, 120, 255, 0, 0, 0, 0]);
    expect([...maskFromRgba(rgba, 4, 1)]).toEqual([1, 0, 1, 0]);
    expect([...maskFromRgba(rgba, 4, 1, 100)]).toEqual([1, 0, 0, 0]);
    expect([...maskFromRgba(rgba, 4, 1, 128, true)]).toEqual([0, 1, 0, 1]);
  });

  it("becomes an SVG the importer can read", () => {
    const r = traceMask(disk(96, 96, 48, 48, 40, 15), 96, 96);
    const d = parseSvg(regionToSvg(r, 96, 96));
    expect(d.width).toBeCloseTo((80 * 25.4) / 96, 0);
    expect(pointInRegion(d.region, { x: 0, y: 0 })).toBe(false);
  });
});

describe("polishMask", () => {
  const W = 120;
  const count = (m: Uint8Array) => m.reduce((a, v) => a + v, 0);
  const rowWidth = (m: Uint8Array, y: number, x0: number, x1: number) => {
    let n = 0;
    for (let x = x0; x < x1; x++) n += m[y * W + x];
    return n;
  };

  it("closes a crack that splits a shape in two", () => {
    const m = disk(W, W, 60, 60, 40);
    for (let y = 0; y < W; y++) m[y * W + 60] = 0; // 1 px crack, top to bottom
    expect(traceMask(m, W, W)).toHaveLength(2);
    const p = polishMask(m, W, W, { radius: 2 });
    expect(traceMask(p, W, W)).toHaveLength(1);
  });

  it("fills pinholes but keeps real holes", () => {
    const m = disk(W, W, 60, 60, 50, 20); // ring: the 20 px hole is real
    m[60 * W + 85] = 0; // pinhole in the ring
    m[61 * W + 85] = 0;
    const p = polishMask(m, W, W, { radius: 2 });
    expect(p[60 * W + 85]).toBe(1);
    expect(p[60 * W + 60]).toBe(0);
  });

  it("smooths a jagged edge without changing the size much", () => {
    const m = disk(W, W, 60, 60, 40);
    // Notches and bumps along the edge, every few degrees.
    for (let a = 0; a < 360; a += 9) {
      const r = a % 18 ? 37 : 43;
      const x = Math.round(60 + r * Math.cos((a * Math.PI) / 180));
      const y = Math.round(60 + r * Math.sin((a * Math.PI) / 180));
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) m[(y + dy) * W + x + dx] = a % 18 ? 0 : 1;
    }
    const p = polishMask(m, W, W, { radius: 3 });
    const edges = (q: Uint8Array) => {
      let n = 0;
      for (let i = 0; i < q.length - 1; i++) if ((i + 1) % W && q[i] !== q[i + 1]) n++;
      return n;
    };
    expect(edges(p)).toBeLessThan(edges(m));
    expect(Math.abs(count(p) - Math.PI * 1600) / (Math.PI * 1600)).toBeLessThan(0.08);
  });

  it("evens out stroke thickness when asked", () => {
    const m = new Uint8Array(W * W);
    for (let y = 10; y < 110; y++) {
      for (let x = 20; x < 26; x++) m[y * W + x] = 1; // 6 px stroke
      for (let x = 50; x < 60; x++) m[y * W + x] = 1; // 10 px stroke
      for (let x = 80; x < 88; x++) m[y * W + x] = 1; // 8 px stroke
    }
    const p = polishMask(m, W, W, { radius: 1, even: true });
    const ws = [rowWidth(p, 60, 10, 40), rowWidth(p, 60, 40, 70), rowWidth(p, 60, 70, 100)];
    expect(Math.max(...ws) - Math.min(...ws)).toBeLessThanOrEqual(2);
    // Without "even", the strokes keep their own widths.
    const q = polishMask(m, W, W, { radius: 1 });
    expect(rowWidth(q, 60, 40, 70) - rowWidth(q, 60, 10, 40)).toBeGreaterThanOrEqual(3);
  });
});
