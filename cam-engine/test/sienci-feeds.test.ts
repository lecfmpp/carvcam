import { describe, expect, it } from "vitest";
import {
  BIT_BY_ID,
  BITS,
  compatibility,
  HEADS,
  KITS,
  kitsForBit,
  MACHINES,
  MATERIAL_GROUPS,
  sienciFeeds,
  SPEEDS,
  STARTER_SET,
  type MachineId,
  type MaterialGroup,
  type SienciFeeds,
} from "../src/catalog/sienci/index.js";
import { LEGACY_BIT_IDS } from "../src/migrate.js";

const WOODS: MaterialGroup[] = ["softwood", "hardwood"];
const machineIds = Object.keys(MACHINES) as MachineId[];

/** Every combination where the bit fits the machine's head. */
function* combinations() {
  for (const bit of BITS)
    for (const m of machineIds)
      for (const head of MACHINES[m].heads) {
        if (compatibility(bit, head).status === "incompatible") continue;
        for (const g of MATERIAL_GROUPS) for (const s of SPEEDS) yield { bit, m, head, g, s };
      }
}

const ok = (bit: string, m: MachineId, head: Parameters<typeof sienciFeeds>[2], g: MaterialGroup, s?: Parameters<typeof sienciFeeds>[4]): SienciFeeds => {
  const r = sienciFeeds(bit, m, head, g, s);
  if (r.status !== "ok") throw new Error(`${bit} ${m} ${head} ${g}: ${r.status}`);
  return r.feeds;
};

describe("complete Sienci catalog", () => {
  it("every bit has a store page, an image and a table row (official or reference)", () => {
    for (const bit of BITS) {
      expect(bit.url, bit.id).toMatch(/^https:\/\/sienci\.com\/product\//);
      expect(bit.image).toBe(`bits/${bit.id}.webp`);
      expect(bit.tableRow, bit.id).not.toBeNull();
      expect(bit.diameter).toBeGreaterThan(0);
    }
    expect(BITS.length).toBe(38);
    expect(new Set(BITS.map((b) => b.id)).size).toBe(BITS.length);
  });

  it("keeps every bit id that saved data can refer to", () => {
    for (const id of Object.values(LEGACY_BIT_IDS)) expect(BIT_BY_ID.has(id), id).toBe(true);
  });

  it("every bit in a set is in the catalog, and the Starter Set matches STARTER_SET", () => {
    expect(KITS).toHaveLength(8);
    for (const k of KITS) {
      expect(k.url).toMatch(/^https:\/\/sienci\.com\/product\//);
      for (const x of k.bits) expect(BIT_BY_ID.has(x.id), `${k.id}: ${x.id}`).toBe(true);
    }
    const starter = KITS.find((k) => k.id === "starter-end-mill-set")!;
    expect(starter.bits.map((x) => x.id).sort()).toEqual(STARTER_SET.slice().sort());
    expect(kitsForBit("vbit-90-dlc").map((k) => k.id)).toEqual(["altmill-starter-set", "altmill-sign-maker-set", "altmill-chamfer-set"]);
  });

  it("every bit has feeds on every machine × compatible head × wood × speed", () => {
    let n = 0;
    for (const { bit, m, head, g, s } of combinations()) {
      const r = sienciFeeds(bit.id, m, head, g, s);
      if (WOODS.includes(g)) expect({ id: bit.id, m, head, g, status: r.status }).toMatchObject({ status: "ok" });
      else if (r.status === "not-recommended") expect(r.reason.length).toBeGreaterThan(10);
      else expect(r.status).toBe("ok");
      n++;
    }
    expect(n).toBeGreaterThan(1000);
  });

  it("never exceeds the machine's rates or the head's RPM range, and always cites the source", () => {
    for (const { bit, m, head, g, s } of combinations()) {
      const r = sienciFeeds(bit.id, m, head, g, s);
      if (r.status !== "ok") continue;
      const x = r.feeds;
      const machine = MACHINES[m];
      const h = HEADS[head];
      expect(x.feed).toBeGreaterThan(0);
      expect(x.feed).toBeLessThanOrEqual(machine.maxFeed.xy);
      expect(x.plunge).toBeGreaterThan(0);
      expect(x.plunge).toBeLessThanOrEqual(machine.maxFeed.z);
      expect(x.rpm).toBeGreaterThanOrEqual(h.rpmMin);
      expect(x.rpm).toBeLessThanOrEqual(h.rpmMax);
      expect(x.stepover).toBeGreaterThan(0);
      expect(x.pocketStepdown).toBeGreaterThan(0);
      if (x.slotStepdown !== null) expect(x.slotStepdown).toBeGreaterThan(0);
      if (bit.cutLength) expect(x.pocketStepdown).toBeLessThanOrEqual(bit.cutLength);
      if (h.rpmControl === "manual") expect(x.dial).toBeDefined();
      else expect(x.dial).toBeUndefined();
      expect(x.sources[0].url).toBe("https://resources.sienci.com/view/cnc-feeds-speeds/");
      for (const src of x.sources) {
        expect(src.url).toMatch(/^https:\/\//);
        expect(src.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
      if (x.origin === "official") expect(x.rules).toEqual([]);
      else expect(x.rules.length).toBeGreaterThan(0);
    }
  });
});

describe("official vs estimated", () => {
  it("LongMill + Makita: the table's numbers, unchanged, and the dial setting", () => {
    const x = ok("flat-1-4-upcut", "longmill-mk2-30x30", "makita-rt0701", "hardwood", "regular");
    expect(x).toMatchObject({ origin: "official", feed: 2190, plunge: 1100, stepover: 2.85, slotStepdown: 1.9, pocketStepdown: 4.2, rpm: 12000, dial: 2 });
    expect(ok("flat-1-8-1flute", "longmill-mk3-30x30", "autospin-t1", "aluminum", "maximum")).toMatchObject({ origin: "official", feed: 670, rpm: 17000 });
  });

  it("AltMill: the LongMill table, marked estimated, nothing multiplied", () => {
    const lm = ok("flat-1-8-upcut", "longmill-mk3-30x30", "spindle-1-5kw-er20", "softwood", "maximum");
    const am = ok("flat-1-8-upcut", "altmill-4x4", "spindle-2-2kw-er20", "softwood", "maximum");
    expect(lm.origin).toBe("official");
    expect(am.origin).toBe("estimated");
    expect(am.reasons).toEqual(["machine"]);
    expect(am.sources.map((s) => s.url)).toContain("https://forum.sienci.com/t/altmill-feeds-and-speeds/14176");
    expect([am.feed, am.rpm, am.slotStepdown]).toEqual([lm.feed, lm.rpm, lm.slotStepdown]);
  });

  it("spindle can't reach 28,500 RPM: RPM at the limit and feed in the same proportion", () => {
    const x = ok("store-tapered-1-4-1-5", "longmill-mk3-30x30", "spindle-1-5kw-er20", "softwood");
    expect(x.rpm).toBe(24000);
    expect(x.feed).toBe(Math.round((2470 * 24000) / 28500 / 10) * 10);
    expect(x.reasons).toContain("head");
    expect(ok("store-tapered-1-4-1-5", "longmill-mk3-30x30", "autospin-t1", "softwood").origin).toBe("official");
  });

  it("bit not in the table: estimated by chip load and removal rate, never above the row", () => {
    const x = ok("roughing-3-8-1-1-4-dlc", "altmill-2x4", "spindle-2-2kw-er20", "softwood", "regular");
    expect(x.reasons).toEqual(["machine", "bit"]);
    expect(x.feed).toBe(2190);
    expect(x.slotStepdown).toBe(2.7); // 4.1 × 6.35 / 9.525
    expect(x.stepover).toBeCloseTo(4.28, 2); // 45% of 9.525
    const comp = ok("flat-1-4-compression", "longmill-mk2-30x30", "makita-rt0701", "softwood", "regular");
    expect(comp).toMatchObject({ origin: "estimated", feed: 2190, slotStepdown: 4.1 });
    // 1/8″ single-flute DLC downcut in plastic: the table only lists upcut there.
    expect(ok("flat-1-8-upcut-dlc", "longmill-mk3-30x30", "autospin-t1", "plastic").origin).toBe("official");
    expect(ok("flat-1-8-downcut-dlc", "longmill-mk3-30x30", "autospin-t1", "plastic").origin).toBe("estimated");
  });

  it("combinations Sienci doesn't recommend are left out, with the reason", () => {
    expect(sienciFeeds("surfacing-22mm", "longmill-mk3-30x30", "autospin-t1", "plastic").status).toBe("not-recommended");
    expect(sienciFeeds("store-tapered-1-4-1-5", "altmill-4x4", "spindle-2-2kw-er20", "aluminum").status).toBe("not-recommended");
    expect(sienciFeeds("flat-1-8-downcut", "longmill-mk3-30x30", "autospin-t1", "aluminum").status).toBe("not-recommended");
    expect(sienciFeeds("roughing-3-8-2-dlc", "longmill-mk3-30x30", "autospin-t1", "softwood").status).toBe("incompatible");
  });
});
