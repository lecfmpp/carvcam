import { describe, expect, it } from "vitest";
import { rectTargets, rulerSteps, snapPoint, snapRect, snapValue, type SnapOptions } from "./snap";

const board = { x: 0, y: 0, width: 300, height: 200 };
const opts = (o: Partial<SnapOptions> = {}): SnapOptions => ({ grid: 1, targets: rectTargets([board]), tol: 1.5, ...o });

describe("snapValue", () => {
  it("rounds to the grid step", () => {
    expect(snapValue(12.4, 1)).toBe(12);
    expect(snapValue(12.6, 1)).toBe(13);
    expect(snapValue(12.3, 0.5)).toBe(12.5);
    expect(snapValue(0.1 + 0.2, 0.1)).toBe(0.3);
    expect(snapValue(-7.4, 5)).toBe(-5);
    expect(snapValue(12.34, 0)).toBe(12.34);
  });
});

describe("snapRect", () => {
  it("snaps the corner to the grid when nothing is close", () => {
    const r = snapRect({ x: 40.3, y: 70.8, width: 20, height: 10 }, opts());
    expect(r.rect).toEqual({ x: 40, y: 71, width: 20, height: 10 });
    expect(r.guides).toEqual([]);
  });

  it("sticks an edge to the board edge and returns a guide", () => {
    const r = snapRect({ x: 1.2, y: 50.3, width: 20, height: 10 }, opts());
    expect(r.rect.x).toBe(0);
    expect(r.guides).toContainEqual({ axis: "x", at: 0 });
    // the right edge too
    const r2 = snapRect({ x: 279.1, y: 50, width: 20, height: 10 }, opts());
    expect(r2.rect.x).toBe(280);
    expect(r2.guides).toContainEqual({ axis: "x", at: 300 });
  });

  it("centers on the board center lines", () => {
    const r = snapRect({ x: 139.4, y: 94.2, width: 20, height: 10 }, opts());
    expect(r.rect.x).toBe(140);
    expect(r.rect.y).toBe(95);
    expect(r.guides).toEqual(expect.arrayContaining([{ axis: "x", at: 150 }, { axis: "y", at: 100 }]));
  });

  it("aligns with another element's edge, preferring the closest target", () => {
    const other = { x: 60.4, y: 120, width: 30, height: 30 };
    const r = snapRect({ x: 61, y: 20.2, width: 12, height: 8 }, opts({ targets: rectTargets([board, other]) }));
    expect(r.rect.x).toBe(60.4);
    expect(r.guides).toContainEqual({ axis: "x", at: 60.4 });
    expect(r.rect.y).toBe(20);
  });

  it("ignores targets beyond the tolerance", () => {
    const r = snapRect({ x: 2.6, y: 50, width: 20, height: 10 }, opts());
    expect(r.rect.x).toBe(3);
    expect(r.guides).toEqual([]);
  });

  it("never changes the size", () => {
    const r = snapRect({ x: 0.7, y: 0.7, width: 33.3, height: 12.7 }, opts({ grid: 5 }));
    expect(r.rect.width).toBe(33.3);
    expect(r.rect.height).toBe(12.7);
  });
});

describe("snapPoint", () => {
  it("snaps a resize corner to edges first, then the grid", () => {
    const p = snapPoint({ x: 301, y: 47.6 }, opts({ grid: 5 }));
    expect(p).toEqual({ x: 300, y: 50, guides: [{ axis: "x", at: 300 }] });
  });
});

describe("rulerSteps", () => {
  it("labels every 10 mm when zoomed in and coarser when zoomed out", () => {
    expect(rulerSteps(5)).toEqual({ minor: 2, major: 50, label: 10 });
    expect(rulerSteps(1)).toMatchObject({ label: 50, major: 100 });
    expect(rulerSteps(0.3).label).toBe(200);
    for (const k of [0.1, 0.5, 2, 8]) {
      const r = rulerSteps(k);
      expect(r.label % r.minor).toBe(0);
      expect(r.major % r.label).toBe(0);
    }
  });
});
