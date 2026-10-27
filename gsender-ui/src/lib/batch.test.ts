import { parseCsv, templateFields, type BatchItem, type PlateSpecInput } from "@gsender-next/cam-engine";
import { describe, expect, it } from "vitest";
import { batchSummaryCsv, fillRow, mapPlaceholders, okTime, sampleCsv, toBatchRow, unusedColumns } from "./batch";

const spec: PlateSpecInput = {
  width: 200,
  height: 80,
  thickness: 12,
  texts: [
    { content: "Hello {{ Name }}", size: 20, mode: "engrave", depth: 1 },
    { content: "{{year}}", size: 10, mode: "engrave", depth: 1 },
  ],
};

describe("CSV → placeholders", () => {
  it("maps placeholders to columns ignoring case and spaces", () => {
    const { headers } = parseCsv("name;Year ;city\nAna;2026;Porto");
    const fields = templateFields(spec);
    expect(mapPlaceholders(fields, headers)).toEqual([
      { field: "Name", column: "name" },
      { field: "year", column: "Year" },
    ]);
    expect(unusedColumns(fields, headers)).toEqual(["city"]);
    expect(mapPlaceholders(["team"], headers)).toEqual([{ field: "team", column: null }]);
  });

  it("fills a row for the preview and drops texts left empty", () => {
    const s = fillRow(spec, { name: "Ana", year: "" });
    expect(s.texts?.map((t) => t.content)).toEqual(["Hello Ana"]);
    expect(spec.texts?.[0].content).toBe("Hello {{ Name }}");
  });

  it("starts an example CSV from the placeholders", () => {
    const csv = parseCsv(sampleCsv(["name", "year"]));
    expect(csv.headers).toEqual(["name", "year"]);
    expect(csv.rows.map((r) => r.name)).toEqual(["Ana", "Leo", "Mia"]);
  });
});

describe("batch results", () => {
  const item = (index: number, ok: boolean, sec: number, msg?: string): BatchItem =>
    ({
      index,
      row: { name: index === 1 ? 'Jo, "the" Bear' : `N${index}` },
      fileName: `00${index + 1}-n.nc`,
      result: { ok, warnings: msg ? [{ code: "TEXT_DOES_NOT_FIT", severity: "error", message: msg }] : [], verification: ok ? { ok: true, problems: [], stats: { estimatedTimeSec: sec } } : null },
    }) as unknown as BatchItem;

  const rows = [item(0, true, 600), item(1, false, 0, "Too long"), item(2, true, 300.4)].map(toBatchRow);

  it("keeps only what the UI needs", () => {
    expect(rows[0]).toEqual({ index: 0, row: { name: "N0" }, fileName: "001-n.nc", ok: true, message: undefined, timeSec: 600 });
    expect(rows[1]).toMatchObject({ ok: false, message: "Too long", timeSec: 0 });
    expect(okTime(rows)).toBe(900);
  });

  it("writes a summary.csv with quoting", () => {
    const csv = batchSummaryCsv(rows, ["name"]);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("file,status,machine_min,message,name");
    expect(lines[1]).toBe("001-n.nc,ok,10.0,,N0");
    expect(lines[2]).toBe(',failed,,Too long,"Jo, ""the"" Bear"');
    expect(parseCsv(csv).rows[1].name).toBe('Jo, "the" Bear');
  });
});
