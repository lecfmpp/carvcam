import { beforeAll, describe, expect, it } from "vitest";
import {
  compatibility,
  BIT_BY_ID,
  BITS,
  MACHINES,
  MAX_STRAIGHT_PLUNGE,
  sienciParams,
  PROJECTS,
  projectsForMachine,
  type MachineId,
} from "../src/catalog/sienci/index.js";
import { generatePlate } from "../src/generate.js";
import type { FontMap } from "../src/layout.js";
import { fonts } from "./helpers.js";

let f: FontMap;
beforeAll(async () => {
  f = await fonts();
});

const bit = (id: string) => BIT_BY_ID.get(id)!;
const codes = (r: { warnings: { code: string }[] }) => r.warnings.map((a) => a.code);

describe("Sienci catalog", () => {
  it("has complete data for every bit", () => {
    for (const fr of BITS) {
      expect(fr.diameter).toBeGreaterThan(0);
      expect(fr.cutLength).toBeGreaterThan(0);
      expect(fr.url).toMatch(/^https:\/\/sienci\.com\//);
      if (fr.type === "vbit") expect(fr.angle).toBeGreaterThan(0);
    }
  });

  it("knows what each router and spindle can hold", () => {
    expect(compatibility(bit("flat-1-8-upcut"), "makita-rt0701").status).toBe("with-accessory");
    expect(compatibility(bit("flat-1-4-upcut"), "makita-rt0701").status).toBe("compatible");
    expect(compatibility(bit("flat-1-8-upcut"), "autospin-t1").status).toBe("compatible");
    expect(compatibility(bit("vbit-60-15mm"), "spindle-2-2kw-er20").status).toBe("compatible");
  });

  it("converts the official table to mm (softwood, regular speed, 1/8″ straight)", () => {
    expect(sienciParams("1/8-straight", "mdf", "regular")).toEqual({
      feed: 2159, plunge: 1092, stepover: 1.52, slotStepdown: 4.06, pocketStepdown: 9.14, rpm: 17000,
    });
    expect(sienciParams("surfacing-22", "acrylic", "regular")).toBeUndefined();
  });
});

describe("generation with a Sienci machine", () => {
  const plate = { width: 200, height: 100, thickness: 12, texts: [{ content: "Oi", size: 30, mode: "engrave" as const, depth: 2 }] };

  it("Makita: warns about the 1/8″ collet and gives the dial position", () => {
    const r = generatePlate(plate, { fonts: f, sienci: { machine: "longmill-mk2-30x30", bit: "flat-1-8-upcut" } });
    expect(r.ok).toBe(true);
    expect(codes(r)).toContain("BIT_NEEDS_ACCESSORY");
    expect(r.manualAdjustments).toHaveLength(1);
    expect(r.manualAdjustments[0].dial).toBe(3);
    expect(r.gcode).toContain("gire o dial do Makita RT0701 para 3");
  });

  it("AutoSpin: no accessory and no dial (speed from the G-code)", () => {
    const r = generatePlate(plate, { fonts: f, sienci: { machine: "longmill-mk3-30x30", bit: "flat-1-8-upcut" } });
    expect(r.ok).toBe(true);
    expect(codes(r)).not.toContain("BIT_NEEDS_ACCESSORY");
    expect(r.manualAdjustments).toEqual([]);
    expect(r.gcode).toMatch(/^S17000 M3$/m);
  });

  it("uses the Sienci table with a capped plunge for straight descent", () => {
    const r = generatePlate(plate, { fonts: f, sienci: { machine: "longmill-mk3-30x30", bit: "flat-1-8-upcut", speed: "regular" } });
    expect(r.params.main).toMatchObject({ rpm: 17000, feed: 2159, stepdown: 4.06, plunge: MAX_STRAIGHT_PLUNGE });
    expect(r.paramsSource).toMatch(/Sienci/);
  });

  it("rejects a bit not suited to signs and a head the machine doesn't offer", () => {
    const ball = generatePlate(plate, { fonts: f, sienci: { machine: "altmill-4x4", bit: "ball-1-4" } });
    expect(ball.ok).toBe(false);
    expect(codes(ball)).toContain("BIT_NOT_SUPPORTED");
    const makitaOnAltmill = generatePlate(plate, { fonts: f, sienci: { machine: "altmill-4x4", head: "makita-rt0701", bit: "flat-1-4-upcut" } });
    expect(makitaOnAltmill.ok).toBe(false);
  });

  it("compression bit: raises the stepdown to pass the upcut section", () => {
    const r = generatePlate(
      { type: "lettering", width: 200, height: 80, thickness: 6, material: "plywood", texts: [{ content: "Oi", font: "pacifico", size: 40 }] },
      { fonts: f, sienci: { machine: "longmill-mk3-30x30", bit: "flat-1-8-compression", speed: "reduced" } },
    );
    expect(r.ok).toBe(true);
    expect(codes(r)).toContain("COMPRESSION_STEPDOWN");
    expect(r.params.main.stepdown).toBe(3.5);
  });

  it("uses the machine's real travel", () => {
    const large = PROJECTS.find((p) => p.id === "address-sign")!;
    const r = generatePlate(large.plate, { fonts: f, sienci: { machine: "longmill-mk3-30x30", bit: large.bit } });
    expect(codes(r)).toContain("PART_LARGER_THAN_MACHINE");
  });
});

describe("starter projects", () => {
  const machines = Object.keys(MACHINES) as MachineId[];

  it("each project fits at least one machine, and the small ones fit all", () => {
    for (const p of PROJECTS) {
      const fits = machines.filter((m) => projectsForMachine(m).find((x) => x.project.id === p.id)!.fits);
      expect(fits.length).toBeGreaterThan(0);
      if (p.id !== "address-sign") expect(fits).toEqual(machines);
    }
  });

  it.each(machines)("%s: every project that fits generates approved G-code, with no errors", (m) => {
    for (const pm of projectsForMachine(m)) {
      // A placa grande é lenta para gerar; basta testá-la numa máquina.
      if (!pm.fits || (pm.project.id === "address-sign" && m !== "altmill-4x4")) continue;
      const p = pm.project;
      const r = generatePlate(p.plate, { fonts: f, sienci: { machine: m, bit: p.bit, cutoutBit: p.cutoutBit, speed: p.speed } });
      expect({ project: p.id, errors: r.warnings.filter((a) => a.severity === "error") }).toEqual({ project: p.id, errors: [] });
      expect(r.verification?.ok).toBe(true);
    }
  });
});
