import { beforeAll, describe, expect, it } from "vitest";
import { PathBuilder } from "../src/cam/builder.js";
import { pocket } from "../src/cam/operations.js";
import { rect } from "../src/geometry/shapes.js";
import { generatePlate } from "../src/generate.js";
import type { FontMap } from "../src/layout.js";
import { postGrbl } from "../src/post/grbl.js";
import { simulate } from "../src/sim/heightmap.js";
import { PlateSpecSchema, ToolSchema, type PlateSpecInput } from "../src/schema.js";
import { example, fonts } from "./helpers.js";

let f: FontMap;
beforeAll(async () => {
  f = await fonts();
});

const longTool = { cutLength: 22 };
const codes = (spec: PlateSpecInput, extra = {}) => generatePlate(spec, { fonts: f, tool: longTool, ...extra }).warnings.map((a) => a.code);
const base: PlateSpecInput = { width: 200, height: 100, thickness: 15 };

describe("pocket", () => {
  it("clears a whole square at the requested depth without passing the wall", () => {
    const tool = ToolSchema.parse({});
    const b = new PathBuilder({ feed: 1000, plunge: 300, retractHeight: 3, safeHeight: 10 });
    pocket(b, rect(10, 10, 20, 20), { radius: tool.diameter / 2, stepover: 1.2, depth: 2, stepdown: 1, direction: "conventional" });
    b.safe();
    const g = postGrbl({ title: "t", stock: { width: 40, height: 40, thickness: 5 }, safeHeight: 10 }, [{ name: "p", tool: tool, rpm: 18000, moves: b.moves }]);
    const hm = simulate(g, tool, { x0: 0, y0: 0, width: 40, height: 40 }, 0.2);
    for (let y = 11; y <= 29; y += 0.5) for (let x = 11; x <= 29; x += 0.5) expect(hm.at(x, y)).toBeCloseTo(-2, 3);
    for (const [x, y] of [[9.7, 20], [30.3, 20], [20, 9.7], [20, 30.3]]) expect(hm.at(x, y)).toBe(0);
  });
});

describe("spec", () => {
  it("applies the defaults", () => {
    const s = PlateSpecSchema.parse(base);
    expect(s.material).toBe("mdf");
    expect(s.outerCutout).toBe(true);
    expect(s.edge.type).toBe("straight");
  });
  it("rejects invalid sizes", () => {
    expect(() => PlateSpecSchema.parse({ ...base, width: -1 })).toThrow();
    expect(() => PlateSpecSchema.parse({ ...base, texts: [{ content: "", size: 10 }] })).toThrow();
  });
});

describe("manufacturability checks", () => {
  it("text too large", () => {
    expect(codes({ ...base, texts: [{ content: "Casa da Ana", size: 40 }] })).toContain("TEXT_DOES_NOT_FIT");
  });
  it("depth that would go through the material", () => {
    expect(codes({ ...base, texts: [{ content: "A", size: 30, mode: "engrave", depth: 16 }] })).toContain("DEPTH_EXCEEDS");
  });
  it("hole smaller than the bit", () => {
    expect(codes({ ...base, holes: [{ x: 20, y: 20, diameter: 2 }] })).toContain("HOLE_SMALLER_THAN_BIT");
  });
  it("hole outside the part", () => {
    expect(codes({ ...base, holes: [{ x: 199, y: 50, diameter: 6 }] })).toContain("OUTSIDE_PART");
  });
  it("text with strokes thinner than the bit", () => {
    expect(codes({ ...base, texts: [{ content: "ana", size: 6, mode: "engrave", depth: 1 }] })).toContain("ELEMENT_NOT_MACHINABLE");
  });
  it("counters that come loose in a cutout", () => {
    expect(codes({ ...base, texts: [{ content: "OA", size: 40, mode: "cutout" }] })).toContain("LOOSE_ISLANDS");
  });
  it("bit too short for the cutout", () => {
    const c = generatePlate({ ...base }, { fonts: f }).warnings.map((a) => a.code);
    expect(c).toContain("TOOL_TOO_SHORT");
  });
  it("V-bit only engraves", () => {
    expect(codes({ ...base, texts: [{ content: "A", size: 30, mode: "relief" }] }, { tool: { type: "vbit", angle: 60, cutLength: 22 } })).toContain("VBIT_ENGRAVE_ONLY");
  });
  it("part larger than the machine", () => {
    expect(codes({ ...base, width: 900 })).toContain("PART_LARGER_THAN_MACHINE");
  });
  it("returns no G-code when there is an error", () => {
    const r = generatePlate({ ...base, holes: [{ x: 20, y: 20, diameter: 1 }] }, { fonts: f, tool: longTool });
    expect(r.ok).toBe(false);
    expect(r.gcode).toBe("");
  });
});

describe("examples", () => {
  it("script lettering: cuts out joined letters and the counters", () => {
    const ex = example("pacifico-lettering");
    const r = generatePlate(ex.plate, { fonts: f, tool: ex.tool, machine: ex.machine });
    expect(r.ok).toBe(true);
    expect(r.operations).toHaveLength(1);
    // Letras ligadas viram poucas peças (o pingo do "i" e o hífen ficam soltos), com vários miolos.
    const outers = r.layout.part.filter((p) => area1(p) > 0).length;
    const counters = r.layout.part.filter((p) => area1(p) < 0).length;
    expect(outers).toBeLessThan("Bem-vindos".length);
    expect(counters).toBeGreaterThanOrEqual(4);
  });

  it("two bits: M6 tool change between engraving and cutout", () => {
    const ex = example("engraved-icons-plate");
    const r = generatePlate(ex.plate, { fonts: f, tool: ex.tool, cutoutTool: ex.cutoutTool });
    expect(r.ok).toBe(true);
    const lines = r.gcode.split("\n");
    expect(lines.filter((l) => /^T\d M6$/.test(l))).toEqual(["T1 M6", "T2 M6"]);
    expect(lines.indexOf("T2 M6")).toBeGreaterThan(lines.findIndex((l) => l.includes("Gravação")));
  });

  it("G-code only uses allowed commands and never G0 below Z0", () => {
    const ex = example("anas-house");
    const g = generatePlate(ex.plate, { fonts: f, tool: ex.tool }).gcode;
    let rapid = false;
    for (const raw of g.split("\n")) {
      const l = raw.replace(/;.*/, "").trim();
      if (!l) continue;
      expect(l).toMatch(/^([GMTSFXYZP]-?[\d.]+\s?)+$/);
      if (/G0\b/.test(l)) rapid = true;
      if (/G1\b/.test(l)) rapid = false;
      const z = /Z(-?[\d.]+)/.exec(l);
      if (rapid && z) expect(Number(z[1])).toBeGreaterThanOrEqual(0);
    }
  });
});

function area1(p: { x: number; y: number }[]) {
  let s = 0;
  for (let i = 0; i < p.length; i++) s += p[i].x * p[(i + 1) % p.length].y - p[(i + 1) % p.length].x * p[i].y;
  return s / 2;
}

describe("shapes and element references", () => {
  it("generates rectangle, circle and line", () => {
    const r = generatePlate(
      {
        ...base,
        shapes: [
          { type: "rectangle", x: 50, y: 50, width: 40, height: 20, radius: 4, mode: "engrave", depth: 2 },
          { type: "circle", x: 120, y: 50, diameter: 30, mode: "relief", depth: 3 },
          { type: "line", x: 20, y: 15, x2: 180, y2: 15, thickness: 4, mode: "engrave", depth: 1 },
        ],
      },
      { fonts: f, tool: longTool },
    );
    expect(r.warnings.filter((a) => a.severity === "error")).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.operations.map((o) => o.type)).toEqual(["engrave", "engrave", "relief", "profile"]);
  });

  it("links the warning to the element and offers the fix", () => {
    const r = generatePlate({ ...base, texts: [{ content: "Casa da Ana", size: 40 }] }, { fonts: f, tool: longTool });
    const a = r.warnings.find((x) => x.code === "TEXT_DOES_NOT_FIT")!;
    expect(a.element).toEqual({ type: "text", index: 0 });
    expect(a.fix?.field).toBe("size");
    expect(a.fix!.value).toBeLessThan(40);
    const ok = generatePlate({ ...base, texts: [{ content: "Casa da Ana", size: a.fix!.value }] }, { fonts: f, tool: longTool });
    expect(ok.warnings.map((x) => x.code)).not.toContain("TEXT_DOES_NOT_FIT");
  });

  it("points at the relief element that leaves leftover material", () => {
    const r = generatePlate(
      { ...base, texts: [{ content: "Casa da Ana", size: 16, mode: "relief" }] },
      { fonts: f, tool: longTool },
    );
    const a = r.warnings.find((x) => x.code === "DETAIL_SMALLER_THAN_BIT");
    expect(a?.element).toEqual({ type: "text", index: 0 });
  });
});
