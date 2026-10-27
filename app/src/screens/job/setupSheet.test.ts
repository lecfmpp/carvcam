import type { GenerateResult } from "@carvcam/cam-engine";
import { describe, expect, it } from "vitest";
import { BLANK, type Design } from "../../state/design";
import { buildSetupSheet, regionPath, setupSheetHtml } from "./setupSheet";

const square = (x: number, y: number, s: number) => [[{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }]];
const params = (feed: number) => ({ rpm: 18000, feed, plunge: 300, stepdown: 1.5, stepover: 1.2 });

const result = {
  ok: true,
  gcode: "G21",
  warnings: [],
  operations: [
    { name: "Engrave: text 1 (LUNA)", type: "engrave", tool: 1, depth: 2 },
    { name: "Profile", type: "profile", tool: 2, depth: 15.3 },
  ],
  verification: { ok: true, problems: [], stats: { estimatedTimeSec: 1500 } },
  params: { main: params(1000), cutout: params(1500) },
  tools: [
    { id: 1, name: "a", type: "straight", diameter: 1.5875, flutes: 2, cutLength: 6 },
    { id: 2, name: "b", type: "straight", diameter: 3.175, flutes: 2, cutLength: 12 },
  ],
  manualAdjustments: [
    { tool: 1, rpm: 17000, dial: 3, message: "" },
    { tool: 2, rpm: 22000, dial: 4, message: "" },
  ],
  paramsSource: "",
  layout: { stock: { width: 200, height: 120, thickness: 15 }, part: square(0, 0, 100), engraved: [{ label: "t", region: square(10, 10, 20), depth: 2 }], relief: null, cutouts: [], holes: [], profile: null, warnings: [] },
} as unknown as GenerateResult;

const design: Design = { ...BLANK, name: "Luna <3", keepOut: [{ id: "a", label: "Clamp 1", x: -20, y: 45, width: 40, height: 30, clearance: 25 }] };
const groups = [
  { label: "Engrave “LUNA”", tool: 1, raw: [0], sec: 600 },
  { label: "Cut out with 4 tabs", tool: 2, raw: [1], sec: 900 },
];

describe("setup sheet tabs", () => {
  const withTabs = { ...result, tabs: [0, 1, 2].map((i) => ({ x: 10 * i, y: 5, angle: 90, t: i / 3, outline: 0, width: 8, height: 4, kerf: 3.175 })) } as GenerateResult;
  const d: Design = { ...design, tabs: { count: 4, height: 4, width: 8, mode: "manual", positions: [0.1, 0.4, 0.7] } };
  it("shows the tabs the cut leaves, their size and how they were placed, and draws them", () => {
    const s = buildSetupSheet({ design: d, result: withTabs, groups, machine: "m", head: { name: "h", auto: true }, bitName: () => "b" });
    expect(s.tabs).toMatchObject({ count: 3, width: 8, height: 4, manual: true });
    const html = setupSheetHtml(s);
    expect(html).toContain("3 tabs · 8 mm wide × 4 mm high (placed by hand)");
    expect(html.match(/fill="#FFB020"/g)).toHaveLength(3);
  });
});

describe("setup sheet", () => {
  const sheet = buildSetupSheet({ design, result, groups, machine: "LongMill MK2 30×30", head: { name: "Makita RT0701", auto: false }, bitName: (t) => (t === 1 ? "1/16″ flat" : "1/8″ flat"), date: new Date(2026, 9, 27) });

  it("collects bits in the order they are used, with feeds and the Makita dial", () => {
    expect(sheet.bits.map((b) => [b.t, b.feed, b.dial, b.diameter])).toEqual([
      [1, 1000, 3, 1.6],
      [2, 1500, 4, 3.2],
    ]);
    expect(sheet.toolSteps[0]).toBe("Start with T1 · 1/16″ flat");
    expect(sheet.toolSteps[1]).toContain("before step 2 (Cut out with 4 tabs)");
  });

  it("lists operations with depths and the total time", () => {
    expect(sheet.ops.map((o) => [o.n, o.depth, o.min])).toEqual([
      [1, 2, 10],
      [2, 15.3, 15],
    ]);
    expect(sheet.totalMin).toBe(25);
    expect(sheet.tabs).toMatchObject({ count: 4, height: 3, width: 6, manual: false });
    expect(sheet.date).toBe("Oct 27, 2026");
  });

  it("includes the keep-out zones and a safety checklist", () => {
    expect(sheet.zones).toHaveLength(1);
    expect(sheet.checklist.join("|")).toMatch(/Dust collection.*Eye and ear protection/);
    expect(sheet.checklist[1]).toContain("(1)");
  });

  it("renders a self-contained, escaped page", () => {
    const html = setupSheetHtml(sheet);
    expect(html).toContain("<title>Setup sheet · Luna &lt;3</title>");
    expect(html).toContain("@page");
    expect(html).toContain("Clamp 1");
    expect(html).toContain("X0 Y0");
    expect(html).not.toMatch(/<script|<link/);
  });

  it("flips Y in region paths", () => {
    expect(regionPath(square(0, 0, 10), 100)).toBe("M0 100L10 100L10 90L0 90Z");
  });
});
