import { beforeAll, describe, expect, it } from "vitest";
import { generatePlate } from "../src/generate.js";
import type { FontMap } from "../src/layout.js";
import { parseLines, toSegments } from "../src/gcode.js";
import { verifyGcode, type VerifyLimits } from "../src/verify.js";
import type { KeepOutZone } from "../src/keepout.js";
import { example, fonts } from "./helpers.js";

const lim: VerifyLimits = { xMin: -5, xMax: 105, yMin: -5, yMax: 105, zMin: -10, zMax: 30, maxFeed: 3000, rpmMin: 10000, rpmMax: 30000 };
const head = "G21 G90\nG0 Z5\nS18000 M3\n";
const clamp: KeepOutZone = { label: "Clamp 1", x: 45, y: 45, width: 10, height: 10 };
const keepOutErrors = (g: string, zones: KeepOutZone[], toolRadius = 0) =>
  verifyGcode(g, { ...lim, keepOut: zones, toolRadius }).problems.filter((p) => /keep-out/.test(p.message));

describe("keep-out zones in the verifier", () => {
  it("catches a long rapid that crosses a small clamp between its end points", () => {
    const e = keepOutErrors(head + "G0 X0 Y50\nG0 X100 Y50\n", [clamp]);
    expect(e).toHaveLength(1);
    expect(e[0].message).toMatch(/Move passes through keep-out zone "Clamp 1" \(X45 Y50 at Z5\)/);
    expect(e[0].line).toBe(5);
  });

  it("catches a cut inside a zone", () => {
    expect(keepOutErrors(head + "G0 X50 Y50\nG1 Z-1 F300\nG1 X52 F1000\n", [clamp]).length).toBeGreaterThan(0);
  });

  it("grows the zone by the bit radius", () => {
    const g = head + "G0 X0 Y43\nG0 X100 Y43\n"; // 2 mm below the clamp
    expect(keepOutErrors(g, [clamp], 0)).toHaveLength(0);
    expect(keepOutErrors(g, [clamp], 3)).toHaveLength(1);
  });

  it("allows moves above the obstacle's clearance", () => {
    expect(keepOutErrors("G21 G90\nG0 Z25\nG0 X0 Y50\nG0 X100 Y50\n", [clamp])).toHaveLength(0);
    expect(keepOutErrors(head + "G0 X0 Y50\nG0 X100 Y50\n", [{ ...clamp, clearance: 4 }])).toHaveLength(0);
  });

  it("checks the whole arc, not only its end points", () => {
    // Half circle of radius 20 around (50, 30): it passes through (50, 50), inside the clamp.
    const g = head + "G0 X30 Y30\nG2 X70 Y30 I20 J0 F1000\n";
    expect(keepOutErrors(g, [clamp])).toHaveLength(1);
    // The same arc the other way (G3) goes down through y = 10 and misses it.
    expect(keepOutErrors(head + "G0 X30 Y30\nG3 X70 Y30 I20 J0 F1000\n", [clamp])).toHaveLength(0);
  });

  it("reports one error per zone per line", () => {
    const other: KeepOutZone = { id: "c2", x: 70, y: 45, width: 5, height: 10 };
    const e = keepOutErrors(head + "G0 X0 Y50\nG0 X100 Y50\n", [clamp, other]);
    expect(e.map((p) => p.message.match(/"(.*?)"/)![1])).toEqual(["Clamp 1", "c2"]);
  });
});

describe("keep-out zones in generatePlate", () => {
  let f: FontMap;
  beforeAll(async () => {
    f = await fonts();
  });
  const ex = example("anas-house");
  const gen = (keepOut?: KeepOutZone[], machine?: object) => generatePlate(ex.plate, { fonts: f, tool: ex.tool, keepOut, machine });

  it("a clamp outside the design passes, with travel raised above it", () => {
    // Stock is 220 × 120 (10 mm margin); the corner clamp sits in the margin, clear of the outline cut.
    const r = gen([{ label: "Corner clamp", x: 0, y: 0, width: 5, height: 5, clearance: 15 }]);
    expect(r.warnings.filter((w) => w.severity === "error")).toEqual([]);
    expect(r.ok).toBe(true);
    const segs = toSegments(parseLines(r.gcode), { x: 0, y: 0, z: 17 });
    for (const s of segs) if (s.rapid && (s.from.x !== s.to.x || s.from.y !== s.to.y)) expect(s.to.z).toBeGreaterThanOrEqual(17);
    expect(r.gcode).toContain("G0 Z17\n");
    expect(r.gcode).toMatch(/; Keep-out zones: 1; travel height raised to 17 mm/);
  });

  it("raises safe and retract height for a tall clamp (default clearance 20 → 22 mm)", () => {
    const r = gen([{ x: 0, y: 115, width: 5, height: 5 }]);
    expect(r.ok).toBe(true);
    const zs = new Set(toSegments(parseLines(r.gcode), { x: 0, y: 0, z: 22 }).filter((s) => s.rapid && s.to.z > 0).map((s) => s.to.z));
    // Only the travel height and the 0.5 mm rapid-down point; no 3 mm retracts or 10 mm safe moves.
    expect([...zs].sort((a, b) => a - b)).toEqual([0.5, 22]);
  });

  it("flags a clamp over the design with KEEP_OUT_OVERLAP and returns no G-code", () => {
    const r = gen([{ label: "Middle clamp", x: 100, y: 55, width: 10, height: 10 }]);
    const w = r.warnings.find((a) => a.code === "KEEP_OUT_OVERLAP");
    expect(w?.severity).toBe("error");
    expect(w?.message).toMatch(/"Middle clamp"/);
    expect(w?.suggestion).toBe("Move the clamp or the design so they don't overlap.");
    expect(r.ok).toBe(false);
    expect(r.gcode).toBe("");
  });

  it("points at the element under the clamp", () => {
    const r = generatePlate(
      { width: 200, height: 100, thickness: 15, outerCutout: false, texts: [{ content: "HI", size: 30, mode: "engrave", depth: 1, x: 100, y: 50 }] },
      { fonts: f, tool: { cutLength: 22 }, keepOut: [{ label: "Clamp", x: 95, y: 40, width: 10, height: 20 }] },
    );
    expect(r.warnings.find((a) => a.code === "KEEP_OUT_OVERLAP")?.element).toEqual({ type: "text", index: 0 });
  });

  it("the outline cut counts too (it runs one bit diameter outside the part)", () => {
    // The part spans 10..210 × 10..110; a clamp 1 mm outside its left edge is hit by the profile cut.
    const r = gen([{ label: "Edge clamp", x: 4, y: 50, width: 5, height: 10 }]);
    expect(r.warnings.find((a) => a.code === "KEEP_OUT_OVERLAP")?.message).toMatch(/outline cut/);
  });

  it("errors when the clamp is too tall for the Z travel", () => {
    const r = gen([{ x: 0, y: 0, width: 5, height: 5, clearance: 50 }]);
    expect(r.warnings.some((a) => a.code === "KEEP_OUT_TOO_TALL" && a.severity === "error")).toBe(true);
    expect(r.ok).toBe(false);
  });

  it("the verifier catches a job generated without the zone", () => {
    const r = gen();
    expect(r.ok).toBe(true);
    // A clamp in the middle of the sign, used as if it had been forgotten in the CAM.
    const v = verifyGcode(r.gcode, { ...lim, xMin: -10, xMax: 240, yMin: -10, yMax: 140, zMin: -16, zMax: 10.001, keepOut: [{ x: 100, y: 55, width: 10, height: 10 }], toolRadius: 1.5875 });
    expect(v.ok).toBe(false);
    expect(v.problems.some((p) => /keep-out zone "zone 1"/.test(p.message))).toBe(true);
  });

  it("no zones (or an empty list) gives byte-identical G-code", () => {
    expect(gen([]).gcode).toBe(gen().gcode);
  });
});
