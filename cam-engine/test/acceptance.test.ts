import { beforeAll, describe, expect, it } from "vitest";
import { difference, offset } from "../src/geometry/clip.js";
import { generatePlate, type GenerateResult } from "../src/generate.js";
import type { FontMap } from "../src/layout.js";
import { simulate, type Heightmap } from "../src/sim/heightmap.js";
import { ToolSchema } from "../src/schema.js";
import { example, fonts, samplePoints } from "./helpers.js";

/**
 * Critério de "pronto" da v1: "placa 20×10 cm, MDF 15 mm, 'Casa da Ana' em relevo de 3 mm,
 * borda arredondada, 2 furos" gera um G-code que passa no verificador e, simulado, produz a peça certa.
 */
describe("acceptance: Casa da Ana plate", () => {
  let f: FontMap;
  let res: GenerateResult;
  let hm: Heightmap;
  const ex = example("anas-house");
  const tool = ToolSchema.parse(ex.tool);
  const r = tool.diameter / 2;

  beforeAll(async () => {
    f = await fonts();
    res = generatePlate(ex.plate, { fonts: f, tool: ex.tool });
    hm = simulate(res.gcode, tool, { x0: -5, y0: -5, width: 230, height: 130 }, 0.25);
  });

  it("generates G-code that passes the verifier, with no errors", () => {
    expect(res.warnings.filter((a) => a.severity === "error")).toEqual([]);
    expect(res.verification?.problems.filter((p) => p.severity === "error")).toEqual([]);
    expect(res.ok).toBe(true);
    expect(res.operations.map((o) => o.type)).toEqual(["relief", "hole", "hole", "profile"]);
  });

  it("leaves the letters and the frame intact (no stray cuts)", () => {
    const { part, relief } = res.layout;
    const inner = offset(part, -6);
    const letters = difference(inner, relief!.region);
    const frame = difference(part, inner);
    // 0,4 mm de folga para a discretização da simulação.
    for (const p of samplePoints(offset(letters, -0.4), 0.5)) expect(hm.at(p.x, p.y)).toBeGreaterThan(-0.01);
    for (const p of samplePoints(offset(frame, -0.4), 1)) expect(hm.at(p.x, p.y)).toBeGreaterThan(-0.01);
  });

  it("lowers the relief floor exactly 3 mm where the bit reaches", () => {
    const floor = res.layout.relief!.region;
    const holes = offset(res.layout.holes.flatMap((f) => f.region), 0.5);
    const reachable = difference(offset(offset(offset(floor, -r), r), -0.4), holes);
    const pts = samplePoints(reachable, 1);
    expect(pts.length).toBeGreaterThan(5000);
    for (const p of pts) expect(hm.at(p.x, p.y)).toBeCloseTo(-3, 2);
  });

  it("drills through the material and cuts out the outline with tabs", () => {
    for (const [x, y] of [[25, 95], [195, 95]]) expect(hm.at(x, y)).toBeLessThanOrEqual(-15);
    // Caminho do centro da fresa no recorte: através do material, exceto nas 4 abas.
    const ring = difference(offset(res.layout.part, r + 0.3), offset(res.layout.part, r - 0.3));
    const pts = samplePoints(ring, 0.5);
    const cutThrough = pts.filter((p) => hm.at(p.x, p.y) <= -15).length / pts.length;
    // Abas de 3 mm: a fresa sobe até Z-12 num material de 15 mm.
    const onTab = pts.filter((p) => Math.abs(hm.at(p.x, p.y) - -12) < 0.05).length;
    expect(cutThrough).toBeGreaterThan(0.8);
    expect(cutThrough).toBeLessThan(0.99);
    expect(onTab).toBeGreaterThan(20);
  });

  it("does not touch material outside the part beyond the cutout width", () => {
    const outside = difference(
      [[{ x: -5, y: -5 }, { x: 225, y: -5 }, { x: 225, y: 125 }, { x: -5, y: 125 }]],
      offset(res.layout.part, 2 * r + 0.4),
    );
    for (const p of samplePoints(outside, 2)) expect(hm.at(p.x, p.y)).toBe(0);
  });

  it("stays within a reasonable time", () => {
    expect(res.verification!.stats.estimatedTimeSec).toBeLessThan(40 * 60);
    expect(res.verification!.stats.lines).toBeLessThan(40000);
  });
});
