import { describe, expect, it } from "vitest";
import { verifyGcode, type VerifyLimits } from "../src/verify.js";

const lim: VerifyLimits = { xMin: -5, xMax: 105, yMin: -5, yMax: 105, zMin: -10, zMax: 10, maxFeed: 3000, rpmMin: 10000, rpmMax: 30000 };
const head = "G21 G90\nG0 Z5\nS18000 M3\n";
const errors = (g: string) => verifyGcode(g, lim).problems.filter((p) => p.severity === "error").map((p) => p.message);

describe("G-code verifier", () => {
  it("accepts a simple cut and computes time and extent", () => {
    const r = verifyGcode(head + "G0 X10 Y10\nG1 Z-1 F300\nG1 X20 F1200\nG0 Z5\nM5\nM30\n", lim);
    expect(r.ok).toBe(true);
    expect(r.stats.extent.zMin).toBe(-1);
    // 1 mm de mergulho abaixo da face + 10 mm de corte lateral.
    expect(r.stats.cutLength).toBe(11);
    expect(r.stats.estimatedTimeSec).toBeGreaterThan(0);
  });

  it.each([
    ["GRBL $ command", head + "$H\n", /sistema/],
    ["inches", "G20 G90\nG0 X1\n", /G20/],
    ["incremental", "G21 G91\nG0 X1\n", /G91/],
    ["G0 into the material", head + "G0 Z-1\n", /rápido/],
    ["sideways G0 inside the material", head + "G1 Z-1 F300\nG0 X50\n", /lateral/],
    ["cutting with the spindle off", "G21 G90\nG0 Z5\nG1 Z-1 F300\n", /spindle desligado/],
    ["feed above the maximum", head + "G1 Z-1 F9000\n", /acima do máximo/],
    ["leaves the area", head + "G0 X200\n", /área permitida/],
    ["too deep", head + "G1 Z-12 F300\n", /limite/],
    ["command not on the list", head + "G28\n", /G28/],
    ["move without G21", "G90\nG0 X1\n", /G21/],
  ])("rejects %s", (_name, g, msg) => {
    expect(errors(g).some((m) => msg.test(m))).toBe(true);
  });

  it("considers the whole arc, not just the end points", () => {
    // Meia volta de raio 60 centrada em (50, 50): passa por y = 110, fora da área.
    const g = head + "G0 X-10 Y50\nG1 Z-1 F300\nG2 X110 Y50 I60 J0 F1000\n";
    expect(errors(g).some((m) => /área permitida/.test(m))).toBe(true);
  });
});
