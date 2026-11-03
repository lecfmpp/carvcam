import { beforeAll, describe, expect, it } from "vitest";
import { buildInlay, inlayNumbers } from "../src/cam/inlay.js";
import { area, bounds, difference, mirrorX, offset, pointInRegion, translate, union, type Region } from "../src/geometry/clip.js";
import { generatePlate, type GenerateOptions } from "../src/generate.js";
import type { FontMap } from "../src/layout.js";
import { migrateLegacySpec } from "../src/migrate.js";
import { ToolSchema, type PlateSpecInput } from "../src/schema.js";
import { simulate, type Heightmap } from "../src/sim/heightmap.js";
import { fonts } from "./helpers.js";

let f: FontMap;
beforeAll(async () => {
  f = await fonts();
});

// 60° V-bit, 1/2″: the cone reaches ~11 mm, plenty for every inlay in these tests.
const vbit = { id: 1, type: "vbit" as const, angle: 60, diameter: 12.7, cutLength: 12, name: "V 60" };
const flat = { id: 2, type: "straight" as const, diameter: 3.175, cutLength: 12, name: "Flat 1/8" };
const P = { depth: 3, glueGap: 0.5, boardGap: 2, plugThickness: 10 };
const RES = 0.1;

function opts(clear: boolean): Omit<GenerateOptions, "fonts"> {
  // A big stepdown: one layer only, so the simulation is quick (the final geometry is the same).
  return { tool: vbit, cutoutTool: clear ? flat : undefined, cut: { stepdown: 20 } };
}

type Ref = { type: "text" | "shape" | "icon" | "svg"; index: number };

/** Builds the base and the plug of a 60 × 60 board with one element, and simulates both cuts. */
function inlayOf(spec: PlateSpecInput, ref: Ref, clear: boolean) {
  const pre = generatePlate(spec, { fonts: f, ...opts(false) });
  const reg = pre.layout.engraved.find((g) => g.ref?.type === ref.type && g.ref.index === ref.index)!.region;
  const b = bounds(reg);
  const box = { cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, w: b.maxX - b.minX, h: b.maxY - b.minY };
  const built = buildInlay(spec, [{ ref, box }], { ...P, clear });
  const base = generatePlate(built.base, { fonts: f, ...opts(clear) });
  const plug = generatePlate(built.plug, { fonts: f, ...opts(clear) });
  const tools = [ToolSchema.parse(vbit), ToolSchema.parse(flat)];
  const hb = simulate(base.gcode, tools, { x0: 0, y0: 0, width: base.layout.stock.width, height: base.layout.stock.height }, RES);
  const hp = simulate(plug.gcode, tools, { x0: 0, y0: 0, width: plug.layout.stock.width, height: plug.layout.stock.height }, RES);
  return { built, base, plug, hb, hp, reg, box };
}

/**
 * Fit: the flipped plug goes down to depth s in the pocket. At a base point (x, y), the plug
 * reaches depth s + hp(x′, y′) and the base material starts at −hb(x, y).
 * c = s + hp + hb > 0 is interference (the plug does not go in); c < 0 is a gap.
 */
function fit(hb: Heightmap, hp: Heightmap, map: { a: number; b: number }, region: Region, glueGap = P.glueGap) {
  const n = inlayNumbers({ ...P, glueGap }, vbit);
  const s = n.plugStart;
  const bb = bounds(region);
  const out = { maxInterference: -Infinity, where: { x: 0, y: 0, base: 0 }, walls: [] as number[], floor: [] as number[], outside: [] as number[] };
  // Outside the band where the plug's wall still opens up (F·t past the design).
  // (Outer outlines only: the inside of a letter stays up on the base and is another case.)
  const near = offset(union(region.filter((p) => area([p]) > 0)), P.boardGap * n.tan + 0.3);
  for (let y = Math.round((bb.minY - 3) / RES) * RES; y <= bb.maxY + 3; y += RES) {
    for (let x = Math.round((bb.minX - 3) / RES) * RES; x <= bb.maxX + 3; x += RES) {
      const base = hb.at(x, y);
      const plug = hp.at(map.a - x, y + map.b);
      const c = s + plug + base;
      if (c > out.maxInterference) out.where = { x, y, base };
      out.maxInterference = Math.max(out.maxInterference, c);
      if (!pointInRegion(near, { x, y })) out.outside.push(c);
      else if (base < -(P.depth - 0.05)) out.floor.push(c);
      else if (-base < s - 0.3 && -base > 0.3) out.walls.push(c);
    }
  }
  return out;
}

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);

function checkFit(r: ReturnType<typeof inlayOf>) {
  expect(r.base.ok, JSON.stringify(r.base.warnings)).toBe(true);
  expect(r.plug.ok, JSON.stringify(r.plug.warnings)).toBe(true);
  const e = fit(r.hb, r.hp, r.built.map, r.reg);
  // No interference beyond the resolution: ridges between the pocket's rings (0.05 / tan 30° ≈
  // 0.09 mm), the simulation's 0.1 mm grid on a 60° wall (≈ 0.09 mm) and the arc approximation.
  expect(e.maxInterference, JSON.stringify(e.where)).toBeLessThan(0.2);
  // Tight walls: the plug touches the pocket.
  expect(e.walls.length).toBeGreaterThan(50);
  expect(Math.abs(mean(e.walls))).toBeLessThan(0.08);
  // Outside the pocket, the leftover plug board stays F above the base's surface (minus the
  // ridges of the lowered floor, which stay under F/4).
  expect(e.outside.length).toBeGreaterThan(50);
  expect(Math.max(...e.outside)).toBeLessThan(-0.7 * P.boardGap);
  return e;
}

describe("V-carve inlay: the maths", () => {
  it("plug start depth = pocket depth − glue gap", () => {
    const n = inlayNumbers({ depth: 3, glueGap: 0.5, boardGap: 2 }, { diameter: 12.7, angle: 60 });
    expect(n.plugStart).toBeCloseTo(2.5, 6);
    expect(n.plugDepth).toBeCloseTo(4.5, 6);
    expect(n.tan).toBeCloseTo(Math.tan(Math.PI / 6), 6);
    expect(n.cone).toBeCloseTo(6.35 / Math.tan(Math.PI / 6), 6);
  });

  it("builds the plug board mirrored, the size of the design plus the margin", () => {
    const spec: PlateSpecInput = { width: 120, height: 80, thickness: 12, outerCutout: false, frame: 0, icons: [{ id: "heart", x: 40, y: 50, size: 30, mode: "relief" }] };
    const m = buildInlay(spec, [{ ref: { type: "icon", index: 0 }, box: { cx: 40, cy: 50, w: 30, h: 28 } }], { ...P, clear: true });
    expect(m.plug.width).toBe(50);
    expect(m.plug.height).toBe(48);
    expect(m.plug.inlay?.part).toBe("plug");
    expect(m.plug.icons?.[0]).toMatchObject({ x: 25, y: 24, mirror: true });
    expect(m.base.icons?.[0]).toMatchObject({ mode: "engrave", depth: 3 });
    expect(m.base.inlay).toMatchObject({ part: "pocket", targets: [{ type: "icon", index: 0 }] });
    // The plug's shape is the base's, mirrored, where the map says.
    const base = generatePlate(m.base, { fonts: f, ...opts(true) });
    const plug = generatePlate(m.plug, { fonts: f, ...opts(true) });
    const rb = base.layout.engraved[0].region;
    const rp = plug.layout.engraved[0].region;
    const expected = translate(mirrorX(rb, 0), m.map.a, m.map.b);
    const diff = area(difference(union(rp), expected)) + area(difference(expected, union(rp)));
    expect(diff).toBeLessThan(0.5);
  });

  it("the square fits the pocket (V-bit only)", () => {
    const spec: PlateSpecInput = { width: 60, height: 60, thickness: 12, outerCutout: false, frame: 0, shapes: [{ type: "rectangle", x: 30, y: 30, width: 20, height: 20, mode: "engrave" }] };
    const r = inlayOf(spec, { type: "shape", index: 0 }, false);
    const e = checkFit(r);
    // Flat bottom of the pocket: the glue gap is left between the top of the plug and the bottom.
    expect(e.floor.length).toBeGreaterThan(1000);
    expect(mean(e.floor)).toBeCloseTo(-P.glueGap, 1);
    expect(r.base.gcode).not.toMatch(/M6/);

    // Control: a plug with the wrong start depth (1.5 mm too shallow) does not go in; the test sees it.
    const wrong = { ...r.built.plug, inlay: { ...r.built.plug.inlay!, glueGap: P.glueGap + 1.5 } };
    const g = generatePlate(wrong, { fonts: f, ...opts(false) });
    const hp = simulate(g.gcode, ToolSchema.parse(vbit), { x0: 0, y0: 0, width: g.layout.stock.width, height: g.layout.stock.height }, RES);
    expect(fit(r.hb, hp, r.built.map, r.reg).maxInterference).toBeGreaterThan(1);
  }, 60_000);

  it("the circle fits, with the flat bottom cleared by the flat bit and one bit change", () => {
    const spec: PlateSpecInput = { width: 60, height: 60, thickness: 12, outerCutout: false, frame: 0, shapes: [{ type: "circle", x: 30, y: 30, diameter: 20, mode: "engrave" }] };
    const r = inlayOf(spec, { type: "shape", index: 0 }, true);
    const e = checkFit(r);
    expect(mean(e.floor)).toBeCloseTo(-P.glueGap, 1);
    // T1 at the start and one change to T2.
    for (const g of [r.base.gcode, r.plug.gcode]) expect(g.match(/M6/g)?.length).toBe(2);
    expect(r.base.operations.map((o) => o.name)).toEqual(["V-carve: inlay pocket", "Clear flat bottom: inlay pocket"]);
    expect(r.plug.operations.map((o) => o.name)).toEqual(["V-carve: inlay plug", "Clear flat bottom: inlay plug"]);
  }, 60_000);

  it("a letter with an inside (A) fits", () => {
    const spec: PlateSpecInput = { width: 60, height: 60, thickness: 12, outerCutout: false, frame: 0, texts: [{ content: "A", size: 28, mode: "engrave", x: 30, y: 30 }] };
    const r = inlayOf(spec, { type: "text", index: 0 }, true);
    checkFit(r);
  }, 60_000);

  it("flags a main bit that is not a V-bit, a short cone and a thin board", () => {
    const spec: PlateSpecInput = { width: 60, height: 60, thickness: 4, outerCutout: false, frame: 0, shapes: [{ type: "circle", x: 30, y: 30, diameter: 20, mode: "engrave" }] };
    const m = buildInlay(spec, [{ ref: { type: "shape", index: 0 }, box: { cx: 30, cy: 30, w: 20, h: 20 } }], { ...P, depth: 4, clear: false, plugThickness: 4 });
    const notV = generatePlate(m.base, { fonts: f, tool: flat });
    expect(notV.warnings.map((a) => a.code)).toContain("INLAY_NEEDS_VBIT");
    const small = generatePlate(m.plug, { fonts: f, tool: { ...vbit, diameter: 3.175 } });
    const codes = small.warnings.map((a) => a.code);
    expect(codes).toContain("INLAY_BIT_TOO_SMALL");
    expect(codes).toContain("INLAY_BOARD_TOO_THIN");
    expect(small.ok).toBe(false);
  });

  it("warns when clearing is asked for but there is no flat bit", () => {
    const spec: PlateSpecInput = { width: 60, height: 60, thickness: 12, outerCutout: false, frame: 0, shapes: [{ type: "circle", x: 30, y: 30, diameter: 30, mode: "engrave" }] };
    const m = buildInlay(spec, [{ ref: { type: "shape", index: 0 }, box: { cx: 30, cy: 30, w: 30, h: 30 } }], { ...P, clear: true });
    const r = generatePlate(m.base, { fonts: f, ...opts(false) });
    expect(r.ok).toBe(true);
    expect(r.warnings.map((a) => a.code)).toContain("INLAY_NO_CLEARING");
  });

  it("loads an inlay saved with the early Portuguese field names", () => {
    const old = { largura: 60, altura: 60, espessura: 12, recorteExterno: false, moldura: 0, icones: [{ id: "coracao", x: 30, y: 30, tamanho: 30, modo: "gravado", profundidade: 4.5, espelhar: true }], inlay: { parte: "macho", profundidade: 3, folga: 0.5, folgaTopo: 2, limpeza: false } };
    const spec = migrateLegacySpec<PlateSpecInput>(old);
    expect(spec.inlay).toEqual({ part: "plug", depth: 3, glueGap: 0.5, boardGap: 2, clear: false });
    expect(spec.icons?.[0]).toMatchObject({ id: "heart", mirror: true });
    expect(generatePlate(spec, { fonts: f, ...opts(false) }).operations[0].name).toBe("V-carve: inlay plug");
  });
});

describe("example inlay (first cuts)", () => {
  it("the stored plug is what buildInlay makes from the pocket", async () => {
    const { PROJECTS } = await import("../src/catalog/sienci/projects.js");
    const pocket = PROJECTS.find((p) => p.id === "heart-inlay")!.plate;
    const stored = PROJECTS.find((p) => p.id === "heart-inlay-plug")!.plate;
    const pre = generatePlate({ ...pocket, inlay: undefined }, { fonts: f, ...opts(false) });
    const b = bounds(pre.layout.engraved[0].region);
    const i = pocket.inlay!;
    const box = { cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, w: b.maxX - b.minX, h: b.maxY - b.minY };
    const m = buildInlay({ ...pocket, inlay: undefined }, [{ ref: { type: "icon", index: 0 }, box }], {
      depth: i.depth!,
      glueGap: i.glueGap!,
      boardGap: i.boardGap!,
      clear: i.clear!,
      plugThickness: stored.thickness,
      plugMaterial: stored.material,
    });
    const summary = (s: PlateSpecInput) => ({ width: s.width, height: s.height, icons: s.icons?.map(({ x, y, mirror }) => ({ x, y, mirror })), inlay: s.inlay });
    expect(summary(m.plug)).toEqual(summary(stored));
    expect(m.base.inlay).toEqual(pocket.inlay);
  });
});
