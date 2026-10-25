import { describe, expect, it } from "vitest";
import { area, bounds, pointInRegion } from "../src/geometry/clip.js";
import { parseSvg } from "../src/svg.js";
import { maskFromRgba, regionToSvg, traceMask } from "../src/trace.js";

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
  it("um disco vira um contorno com a área certa", () => {
    const r = traceMask(disk(100, 100, 50, 50, 30), 100, 100);
    expect(r).toHaveLength(1);
    expect(Math.abs(area(r))).toBeCloseTo(Math.PI * 900, -2);
    const b = bounds(r);
    expect(b.maxX - b.minX).toBeGreaterThan(58);
  });

  it("anel vira contorno com furo", () => {
    const r = traceMask(disk(100, 100, 50, 50, 40, 20), 100, 100);
    expect(r).toHaveLength(2);
    expect(pointInRegion(r, { x: 50, y: 50 })).toBe(false);
    expect(pointInRegion(r, { x: 50, y: 20 })).toBe(true);
  });

  it("descarta manchas pequenas e sobrevive a pixels só pela diagonal", () => {
    const m = disk(60, 60, 30, 30, 15);
    m[2 * 60 + 2] = 1; // mancha de 1 px
    m[50 * 60 + 50] = 1;
    m[51 * 60 + 51] = 1; // dois pixels encostados pela diagonal
    const r = traceMask(m, 60, 60, { manchaMin: 6 });
    expect(r).toHaveLength(1);
  });

  it("limiar e inversão a partir de RGBA", () => {
    const rgba = new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255, 120, 120, 120, 255, 0, 0, 0, 0]);
    expect([...maskFromRgba(rgba, 4, 1)]).toEqual([1, 0, 1, 0]);
    expect([...maskFromRgba(rgba, 4, 1, 100)]).toEqual([1, 0, 0, 0]);
    expect([...maskFromRgba(rgba, 4, 1, 128, true)]).toEqual([0, 1, 0, 1]);
  });

  it("vira um SVG que o importador lê", () => {
    const r = traceMask(disk(96, 96, 48, 48, 40, 15), 96, 96);
    const d = parseSvg(regionToSvg(r, 96, 96));
    expect(d.largura).toBeCloseTo((80 * 25.4) / 96, 0);
    expect(pointInRegion(d.regiao, { x: 0, y: 0 })).toBe(false);
  });
});
