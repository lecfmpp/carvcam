import { WARNING_CODES, type GenerateResult, type PlateSpecInput, type Warning } from "@gsender-next/cam-engine";
import { describe, expect, it } from "vitest";
import { BITS, bitById } from "../../lib/catalog";
import { buildIssues, engineErrorIssue, issueActions, MAPPED_CODES, type IssueCtx, type UiIssue } from "./issues";

/**
 * Guard against dead ends: every card that blocks the user (and every bit problem) must offer a way
 * out, and a bit the user doesn't own must come with a Sienci link tracked as "bit_suggestion".
 */

const SPEC: PlateSpecInput = {
  type: "plate",
  width: 200,
  height: 120,
  thickness: 18,
  material: "mdf",
  edge: { type: "rounded", radius: 8 },
  texts: [{ content: "Hello", font: "archivo-black", size: 30, mode: "relief", depth: 3, x: 100, y: 60 }],
  svgs: [{ content: "<svg/>", name: "logo", x: 50, y: 50, width: 30, mode: "engrave", depth: 2 }],
  holes: [{ x: 10, y: 60, diameter: 2 }],
  slots: [{ x: 100, y: 110, length: 30, width: 2, angle: 0 }],
};
const T0 = { type: "text", index: 0 } as const;

/** One synthetic warning per code, shaped like the engine sends it. */
const W: Warning[] = [
  { code: "TEXT_DOES_NOT_FIT", severity: "error", message: "x", element: T0, data: { suggestedSize: 20 }, fix: { element: T0, field: "size", value: 20 } },
  { code: "TEXT_DOES_NOT_FIT", severity: "error", message: "lettering", data: { suggestedSize: 20 } },
  { code: "ELEMENT_NOT_MACHINABLE", severity: "error", message: "x", element: T0, data: { bitDiameter: 3.175, role: "main" } },
  { code: "ELEMENT_NOT_MACHINABLE", severity: "error", message: "x", element: { type: "svg", index: 0 }, data: { bitDiameter: 3.175, role: "main" } },
  { code: "DETAIL_SMALLER_THAN_BIT", severity: "warning", message: "x", element: T0, data: { percent: 12, areaMm2: 30, bitDiameter: 3.175, role: "main" } },
  { code: "DEPTH_EXCEEDS", severity: "error", message: "x", element: T0, fix: { element: T0, field: "depth", value: 10.8 } },
  { code: "TOOL_TOO_SHORT", severity: "error", message: "x", element: T0, data: { needed: 20, cutLength: 17, role: "main" } },
  { code: "TOOL_TOO_SHORT", severity: "error", message: "cutout", data: { needed: 18.3, cutLength: 17, role: "main" } },
  { code: "HOLE_SMALLER_THAN_BIT", severity: "error", message: "x", element: { type: "hole", index: 0 }, fix: { element: { type: "hole", index: 0 }, field: "diameter", value: 3.2 } },
  { code: "SLOT_SMALLER_THAN_BIT", severity: "error", message: "x", element: { type: "slot", index: 0 }, fix: { element: { type: "slot", index: 0 }, field: "width", value: 3.2 } },
  { code: "OUTSIDE_PART", severity: "error", message: "x", element: { type: "hole", index: 0 }, data: { bounds: { minX: -2, minY: 58, maxX: 2, maxY: 62 }, part: { width: 200, height: 120 } } },
  { code: "LOOSE_ISLANDS", severity: "warning", message: "x", element: T0 },
  { code: "PART_LARGER_THAN_MACHINE", severity: "error", message: "x" },
  { code: "DIFFERENT_DEPTHS", severity: "warning", message: "x" },
  { code: "SMALL_PART_WITHOUT_TABS", severity: "warning", message: "x" },
  { code: "VBIT_ENGRAVE_ONLY", severity: "error", message: "x", element: T0 },
  { code: "FONT_UNAVAILABLE", severity: "error", message: "x", element: T0, data: { font: "pacifico" } },
  { code: "NOTHING_TO_CUT", severity: "error", message: "There is nothing to cut on this sign." },
  { code: "NOTHING_TO_CUT", severity: "error", message: "There are only subtract or mask elements; nothing is left to cut." },
  { code: "BIT_INCOMPATIBLE", severity: "error", message: "x", data: { reason: "bit", bit: "surfacing-22mm", role: "main" } },
  { code: "BIT_INCOMPATIBLE", severity: "error", message: "x", data: { reason: "head", head: "makita-rt0701" } },
  { code: "BIT_INCOMPATIBLE", severity: "error", message: "x", data: { reason: "unknown", bit: "nope", role: "cutout" } },
  { code: "BIT_NEEDS_ACCESSORY", severity: "warning", message: "x", data: { url: "https://sienci.com/product/collet/", bit: "flat-1-8-upcut", role: "main" } },
  { code: "BIT_NOT_SUPPORTED", severity: "error", message: "x", data: { bit: "ball-1-4", role: "main" } },
  { code: "NO_SIENCI_TABLE", severity: "warning", message: "x" },
  { code: "COMPRESSION_STEPDOWN", severity: "warning", message: "x" },
  { code: "INVALID_SVG", severity: "error", message: "x", element: { type: "svg", index: 0 } },
  { code: "VCARVE_FLAT_BOTTOM", severity: "warning", message: "x", element: T0, data: { flatArea: 40, limitedByBit: true, maxDepth: 3, suggestedDepth: 6 } },
  { code: "ENGRAVED_IN_FLOOR", severity: "warning", message: "x", element: T0, fix: { element: T0, field: "depth", value: 5 } },
  { code: "HATCH_TOO_DENSE", severity: "warning", message: "x", element: T0, fix: { element: T0, field: "hatch.spacing", value: 6 } },
  { code: "KEEP_OUT_OVERLAP", severity: "error", message: "x", element: T0, data: { zone: "Clamp 1", zoneIndex: 0 } },
  { code: "KEEP_OUT_TOO_TALL", severity: "error", message: "x", data: { travelHeight: 90, travelZ: 80 } },
  { code: "INVALID_SPEC", severity: "error", message: "x" },
];

/** Bit problems: the way out must include a bit (owned) or a store link (not owned). */
const BIT_CODES = new Set(["ELEMENT_NOT_MACHINABLE", "DETAIL_SMALLER_THAN_BIT", "TOOL_TOO_SHORT", "HOLE_SMALLER_THAN_BIT", "SLOT_SMALLER_THAN_BIT", "VBIT_ENGRAVE_ONLY", "BIT_NOT_SUPPORTED", "BIT_INCOMPATIBLE", "BIT_NEEDS_ACCESSORY"]);
/** Bit cards whose fix is not a bit (head not available on the machine; an outline that's simply too long for... nothing). */
const NOT_A_BIT = (w: Warning) => w.data?.reason === "head";

const result = (warnings: Warning[]): GenerateResult => ({ ok: false, warnings, verification: { ok: true, problems: [] } }) as unknown as GenerateResult;

function ctx(owned: string[], bit = "flat-1-8-upcut", spec = SPEC): IssueCtx {
  return {
    spec,
    bit: bitById(bit),
    ownedBits: owned,
    machineName: "LongMill MK2 30x30",
    machineArea: [792, 845],
    headId: "makita-rt0701",
    keepOut: [{ id: "z1", label: "Clamp 1", x: 90, y: 50, width: 30, height: 20 }],
    thicknesses: [6, 12, 15, 18],
  };
}

const ONLY_DEFAULT = ["flat-1-8-upcut"];
const ALL = BITS.map((b) => b.id);
const bitFor = (w: Warning) => (w.code === "VBIT_ENGRAVE_ONLY" ? "vbit-60-15mm" : w.code === "VCARVE_FLAT_BOTTOM" ? "vbit-30-1-8" : "flat-1-8-upcut");
const one = (w: Warning, owned: string[]): UiIssue => {
  // Small holes in an 18 mm board can't be cut by any finer bit (too short): the fix there is a bigger hole,
  // which is checked too; the bit/store guard runs on a 6 mm board, where a 1/16″ bit reaches through.
  const thin = w.code === "HOLE_SMALLER_THAN_BIT" || w.code === "SLOT_SMALLER_THAN_BIT";
  const out = buildIssues(result([w]), ctx(owned, bitFor(w), thin ? { ...SPEC, thickness: 6 } : SPEC));
  expect(out).toHaveLength(1);
  return out[0];
};

describe("no dead ends", () => {
  it("every engine warning code is mapped (add a case in issues.ts when the engine gets a new one)", () => {
    const missing = WARNING_CODES.filter((c) => !(MAPPED_CODES as readonly string[]).includes(c));
    expect(missing).toEqual([]);
    expect(new Set(W.map((w) => w.code))).toEqual(new Set(WARNING_CODES));
  });

  it("the exported code list covers every code in the engine source", () => {
    // The engine's source, read as text by Vite (tests excluded).
    const src = import.meta.glob(["../../../../cam-engine/src/**/*.ts", "!**/*.test.ts"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    const used = new Set(Object.values(src).flatMap((t) => [...t.matchAll(/code: "([A-Z_]+)"/g)].map((m) => m[1])));
    expect(used.size).toBeGreaterThan(20);
    expect([...used].filter((c) => !(WARNING_CODES as readonly string[]).includes(c))).toEqual([]);
  });

  for (const [who, owned] of [
    ["owns only the 1/8″ upcut", ONLY_DEFAULT],
    ["owns every bit", ALL],
  ] as const) {
    describe(`user ${who}`, () => {
      for (const w of W) {
        if (w.severity !== "error" && !BIT_CODES.has(w.code)) continue;
        it(`${w.code} ${w.message === "x" ? "" : `(${w.message.slice(0, 20)})`} offers a way out`, () => {
          const i = one(w, [...owned]);
          if (i.level === "error") expect(!!i.apply || i.alts.length > 0 || !!i.rec).toBe(true);
          expect(issueActions(i).length).toBeGreaterThan(0);
          if (!BIT_CODES.has(w.code) || NOT_A_BIT(w)) return;
          const acts = issueActions(i);
          const bitAct = acts.some((a) => a.kind === "bit");
          const store = acts.some((a) => a.kind === "store" && a.url.includes("utm_campaign=bit_suggestion"));
          const spec = acts.some((a) => a.kind === "spec");
          if (owned === ALL) expect(bitAct || (w.code === "BIT_NEEDS_ACCESSORY" && store) || spec, "owned bit offered").toBe(true);
          else expect(bitAct || store, "store link (bit_suggestion) offered").toBe(true);
        });
      }
    });
  }

  it("thin text with only the 1/8″ bit recommends the 1/16″ downcut, with I have it + Buy", () => {
    const i = one(W[2], ONLY_DEFAULT);
    expect(i.rec?.bit).toBe("flat-1-16-downcut");
    const own = i.rec!.actions.find((a) => a.kind === "own");
    expect(own && own.kind === "own" && own.patch).toEqual({ bit: "flat-1-16-downcut", bit2: "flat-1-8-upcut", useBit2: true });
    const buy = i.rec!.actions.find((a) => a.kind === "store");
    expect(buy && buy.kind === "store" && buy.url).toMatch(/utm_campaign=bit_suggestion.*utm_content=ELEMENT_NOT_MACHINABLE|utm_content=ELEMENT_NOT_MACHINABLE.*utm_campaign=bit_suggestion/);
    expect(i.apply?.kind).toBe("spec");
  });

  it("thin text with the 1/16″ owned switches to it in one click", () => {
    const i = one(W[2], [...ONLY_DEFAULT, "flat-1-16-upcut"]);
    expect(i.rec).toBeUndefined();
    expect(i.alts.find((a) => a.kind === "bit")).toMatchObject({ bit: "flat-1-16-upcut" });
  });

  it("too short for the cut-through recommends a longer bit for the cut-out", () => {
    const i = one(W[7], ONLY_DEFAULT);
    expect(i.rec?.cut).toBeGreaterThanOrEqual(18.3);
    expect(i.rec?.slot).toBe("cutout");
    expect(i.alts.some((a) => a.kind === "spec")).toBe(true); // or a thinner board
  });

  it("depth too deep, V-bit on raised and a hole off the board each have a one-click design fix", () => {
    expect(one(W[5], ONLY_DEFAULT).apply?.kind).toBe("spec");
    expect(one(W[15], ONLY_DEFAULT).apply).toMatchObject({ kind: "spec", label: "Engrave it instead" });
    const out = one(W[10], ONLY_DEFAULT).apply;
    expect(out?.kind === "spec" && out.spec.holes?.[0].x).toBeGreaterThanOrEqual(5);
  });

  it("engine crashes and failed safety checks always offer a way back", () => {
    expect(engineErrorIssue("boom", ctx(ONLY_DEFAULT)).alts.length).toBeGreaterThan(0);
    const e = engineErrorIssue("boom", { ...ctx(ONLY_DEFAULT), canUndo: true, hasLastGood: true });
    expect(e.alts.map((a) => a.kind)).toEqual(["undo", "restore"]);
    const r = { ok: false, warnings: [], verification: { ok: false, problems: [{ line: 3, severity: "error", message: "Rapid move (G0) into the material." }] } } as unknown as GenerateResult;
    expect(buildIssues(r, ctx(ONLY_DEFAULT))[0].alts.length).toBeGreaterThan(0);
    const ko = { ok: false, warnings: [], verification: { ok: false, problems: [{ line: 3, severity: "error", message: 'Move passes through keep-out zone "Clamp 1" (X1 Y1 at Z-1).' }] } } as unknown as GenerateResult;
    expect(buildIssues(ko, ctx(ONLY_DEFAULT))[0].apply?.kind).toBe("design");
  });
});

