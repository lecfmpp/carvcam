import { beforeAll, describe, expect, it } from "vitest";
import { fillTemplate, generateBatch, parseCsv, slug, templateFields } from "../src/batch.js";
import type { FontMap } from "../src/layout.js";
import type { PlateSpecInput } from "../src/schema.js";
import { fonts } from "./helpers.js";

describe("parseCsv", () => {
  it("reads quotes, escaped quotes, commas and newlines inside quotes, CRLF", () => {
    const r = parseCsv('name,line2\r\n"Smith, Ana","She said ""hi""\r\nsecond line"\r\nBob,\r\n');
    expect(r.headers).toEqual(["name", "line2"]);
    expect(r.rows).toEqual([
      { name: "Smith, Ana", line2: 'She said "hi"\r\nsecond line' },
      { name: "Bob", line2: "" },
    ]);
  });

  it("strips the BOM, trims header names and skips empty rows", () => {
    const r = parseCsv("﻿ Name , City\n\nAna,Lisbon\n,\n\nBob,Porto");
    expect(r.headers).toEqual(["Name", "City"]);
    expect(r.rows).toEqual([
      { Name: "Ana", City: "Lisbon" },
      { Name: "Bob", City: "Porto" },
    ]);
  });

  it("detects semicolon and tab delimiters", () => {
    expect(parseCsv('name;price\n"A;B";1,50\n').rows).toEqual([{ name: "A;B", price: "1,50" }]);
    expect(parseCsv("name\tcity\nAna\tRio\n").rows).toEqual([{ name: "Ana", city: "Rio" }]);
  });

  it("fills missing fields and handles an empty input", () => {
    expect(parseCsv("a,b,c\n1").rows).toEqual([{ a: "1", b: "", c: "" }]);
    expect(parseCsv("")).toEqual({ headers: [], rows: [] });
  });
});

const template: PlateSpecInput = {
  width: 200,
  height: 80,
  thickness: 12,
  outerCutout: false,
  texts: [
    { content: "{{Name}}", size: 20, mode: "engrave", depth: 1 },
    { content: "Est. {{ year }} · {{name}}", size: 10, mode: "engrave", depth: 1 },
  ],
};

describe("templates", () => {
  it("lists unique fields, case-insensitive, as first written", () => {
    expect(templateFields(template)).toEqual(["Name", "year"]);
    expect(templateFields({ ...template, title: "Sign for {{Client}}" } as PlateSpecInput)).toEqual(["Client", "Name", "year"]);
  });

  it("fills every text, unknown fields become empty, the input is not mutated", () => {
    const before = JSON.stringify(template);
    const s = fillTemplate(template, { NAME: " Ana ", other: "x" });
    expect(s.texts!.map((t) => t.content)).toEqual(["Ana", "Est.  · Ana"]);
    expect(JSON.stringify(template)).toBe(before);
    const named = fillTemplate({ ...template, name: "{{name}} sign" } as PlateSpecInput, { name: "Bo" }) as unknown as { name: string };
    expect(named.name).toBe("Bo sign");
  });

  it("slugs file names to safe ASCII", () => {
    expect(slug("José Luís — O'Neil")).toBe("jose-luis-o-neil");
    expect(slug("!!!")).toBe("sign");
    expect(slug("a".repeat(60)).length).toBe(40);
  });
});

describe("generateBatch", () => {
  let f: FontMap;
  beforeAll(async () => {
    f = await fonts();
  });

  it("generates one file per row; a name that does not fit fails alone", () => {
    const rows = [
      { name: "Ana", year: "2020" },
      { name: "Bartholomew Montgomery-Smith", year: "1999" },
      { name: "José", year: "2024" },
    ];
    const progress: [number, number][] = [];
    const b = generateBatch(template, rows, { fonts: f, tool: { cutLength: 22 }, onProgress: (d, t) => progress.push([d, t]) });
    expect(b.items.map((i) => i.fileName)).toEqual(["001-ana.nc", "002-bartholomew-montgomery-smith.nc", "003-jose.nc"]);
    expect(b.items.map((i) => i.result.ok)).toEqual([true, false, true]);
    expect(b.ok).toBe(2);
    expect(b.failed).toBe(1);
    expect(b.items[1].result.warnings.some((w) => w.code === "TEXT_DOES_NOT_FIT")).toBe(true);
    expect(b.items[1].result.gcode).toBe("");
    expect(b.items[0].result.gcode).not.toBe(b.items[2].result.gcode);
    expect(b.totalTimeSec).toBe(b.items[0].result.verification!.stats.estimatedTimeSec + b.items[2].result.verification!.stats.estimatedTimeSec);
    expect(progress).toEqual([[1, 3], [2, 3], [3, 3]]);
  });

  it("uses fileNameField, fails a row over 60 characters without throwing, drops texts left empty", () => {
    const rows = [
      { name: "Ana", year: "", id: "A-17" },
      { name: "x".repeat(61), year: "1", id: "B 2" },
    ];
    const t: PlateSpecInput = { ...template, texts: [template.texts![0], { content: "{{year}}", size: 10, mode: "engrave", depth: 1 }] };
    const b = generateBatch(t, rows, { fonts: f, tool: { cutLength: 22 }, fileNameField: "ID", title: "Sign {{name}}" });
    expect(b.items.map((i) => i.fileName)).toEqual(["001-a-17.nc", "002-b-2.nc"]);
    expect(b.items[0].result.ok).toBe(true);
    expect(b.items[0].result.gcode.startsWith("; Sign Ana\n")).toBe(true);
    const w = b.items[1].result.warnings[0];
    expect(w.code).toBe("TEXT_DOES_NOT_FIT");
    expect(w.element).toEqual({ type: "text", index: 0 });
    expect(b.items[1].result.ok).toBe(false);
  });
});
