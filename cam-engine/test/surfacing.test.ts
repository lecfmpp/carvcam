import { describe, expect, it } from "vitest";
import { simulate } from "../src/sim/heightmap.js";
import { generateSurfacing } from "../src/surfacing.js";

describe("surfacing the spoilboard", () => {
  it("sweeps the whole area at the requested depth, with Sienci table parameters", () => {
    const r = generateSurfacing({ width: 300, height: 200, depth: 0.5, sienci: { machine: "longmill-mk3-30x30", head: "autospin-t1" } });
    expect(r.ok).toBe(true);
    expect(r.verification.problems.filter((p) => p.severity === "error")).toEqual([]);
    expect(r.params.rpm).toBe(17000);
    expect(r.params.stepover).toBeCloseTo(8.89, 1);
    expect(r.passes).toBe(1);
    const hm = simulate(r.gcode, r.tool, { x0: -15, y0: -15, width: 330, height: 230 }, 1);
    for (let y = 0; y <= 200; y += 5) for (let x = 0; x <= 300; x += 5) expect(hm.at(x, y)).toBeCloseTo(-0.5, 3);
    expect(hm.at(-14, 100)).toBe(0);
  });

  it("splits deeper cuts into passes and reports the Makita dial", () => {
    const r = generateSurfacing({ width: 400, height: 300, depth: 2, sienci: { machine: "longmill-mk2-30x30", head: "makita-rt0701", speed: "reduced" } });
    expect(r.ok).toBe(true);
    expect(r.passes).toBeGreaterThan(1);
    expect(r.dial?.position).toBe(3);
    expect(r.gcode).toContain("dial");
  });

  it("rejects an area larger than the machine", () => {
    const r = generateSurfacing({ width: 2000, height: 300, depth: 0.5, sienci: { machine: "longmill-mk3-30x30" } });
    expect(r.ok).toBe(false);
  });
});
