import type { GenerateResult, KeepOutZone } from "@carvcam/cam-engine";
import { describe, expect, it } from "vitest";
import { migrateToV3, type Design } from "../../state/design";
import { moveZone, newZone, nextZoneLabel, normalizeZone, rectFromDrag, resizeZone, setZoneField, zoneBounds, zoneIssues, MIN_ZONE } from "./zones";

const stock = { width: 200, height: 120 };
const B = zoneBounds(stock);

describe("zone editing", () => {
  it("labels clamps one after the highest number", () => {
    expect(nextZoneLabel([])).toBe("Clamp 1");
    expect(nextZoneLabel([{ label: "Clamp 1", x: 0, y: 0, width: 1, height: 1 }, { label: "Clamp 4", x: 0, y: 0, width: 1, height: 1 }])).toBe("Clamp 5");
    expect(nextZoneLabel([{ label: "Screw", x: 0, y: 0, width: 1, height: 1 }])).toBe("Clamp 2");
  });

  it("places new clamps on free edges, straddling the board", () => {
    const a = newZone([], stock);
    expect(a.x).toBe(-35);
    expect(a.x + a.width).toBe(5);
    expect(a.y + a.height / 2).toBe(60);
    expect(a.clearance).toBe(20);
    const b = newZone([a], stock);
    expect(b.x).toBeGreaterThan(150); // right edge
    expect(b.label).toBe("Clamp 2");
  });

  it("normalizes negative sizes and enforces a minimum", () => {
    expect(normalizeZone({ x: 10, y: 10, width: -6, height: 1 })).toEqual({ x: 4, y: 10, width: 6, height: MIN_ZONE });
  });

  it("builds a rectangle from a drag in any direction, clamped to the bounds", () => {
    expect(rectFromDrag({ x: 50, y: 40 }, { x: 10, y: 10 }, B)).toEqual({ x: 10, y: 10, width: 40, height: 30 });
    expect(rectFromDrag({ x: -500, y: 0 }, { x: 0, y: 10 }, B).x).toBe(B.xMin);
  });

  it("moves inside the bounds", () => {
    const z: KeepOutZone = { x: 0, y: 0, width: 40, height: 30 };
    expect(moveZone(z, 12.34, -5, B)).toMatchObject({ x: 12.3, y: -5 });
    expect(moveZone(z, 10000, 0, B).x).toBe(B.xMax - 40);
  });

  it("resizes from a corner, keeping the opposite corner fixed", () => {
    const z: KeepOutZone = { x: 10, y: 10, width: 40, height: 30 };
    expect(resizeZone(z, "se", 70, 0, B)).toEqual({ x: 10, y: 0, width: 60, height: 40 });
    expect(resizeZone(z, "nw", 0, 60, B)).toEqual({ x: 0, y: 10, width: 50, height: 50 });
    // Dragging past the opposite corner stops at the minimum size.
    expect(resizeZone(z, "ne", -100, -100, B)).toMatchObject({ x: 10, width: MIN_ZONE, height: MIN_ZONE });
  });

  it("reads numeric fields and ignores junk", () => {
    const z: KeepOutZone = { x: 0, y: 0, width: 40, height: 30 };
    expect(setZoneField(z, "x", "12,5").x).toBe(12.5);
    expect(setZoneField(z, "width", "1").width).toBe(MIN_ZONE);
    expect(setZoneField(z, "clearance", "abc")).toBe(z);
    expect(setZoneField(z, "clearance", "35").clearance).toBe(35);
  });
});

describe("zoneIssues", () => {
  const zones: KeepOutZone[] = [{ id: "a", label: "Clamp 1", x: 0, y: 0, width: 10, height: 10 }];
  const base = { warnings: [], verification: { ok: true, problems: [] } } as unknown as GenerateResult;

  it("is empty without zones or problems", () => {
    expect(zoneIssues(null, zones)).toEqual([]);
    expect(zoneIssues(base, [])).toEqual([]);
    expect(zoneIssues(base, zones)).toEqual([]);
  });

  it("maps overlap errors to their zone", () => {
    const r = { ...base, warnings: [{ code: "KEEP_OUT_OVERLAP", severity: "error", message: 'Keep-out zone "Clamp 1" overlaps “LUNA”', suggestion: "Move it.", data: { zone: "a", zoneIndex: 0 } }] } as unknown as GenerateResult;
    expect(zoneIssues(r, zones)).toEqual([{ code: "KEEP_OUT_OVERLAP", title: 'Keep-out zone "Clamp 1" overlaps “LUNA”', body: "Move it.", zoneIndex: 0 }]);
  });

  it("groups verifier moves through a zone into one issue", () => {
    const problems = [1, 2, 3].map((line) => ({ line, severity: "error", message: `Move passes through keep-out zone "Clamp 1" (X1 Y1 at Z-1).` }));
    const r = { ...base, verification: { ok: false, problems } } as unknown as GenerateResult;
    const out = zoneIssues(r, zones);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ code: "KEEP_OUT_PATH", zoneIndex: 0 });
    expect(out[0].title).toContain("3 moves");
  });
});

describe("design migration v3", () => {
  it("keeps old designs as they are and drops malformed zones", () => {
    const d = { name: "x", keepOut: [{ x: 1, y: 2, width: 3, height: 4 }, { x: "a" }] } as unknown as Design;
    expect(migrateToV3(d).keepOut).toEqual([{ x: 1, y: 2, width: 3, height: 4 }]);
    const old = { name: "y" } as Design;
    expect(migrateToV3(old)).toEqual({ name: "y", keepOut: undefined });
  });
});
