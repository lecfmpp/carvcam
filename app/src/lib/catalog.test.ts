import { describe, expect, it } from "vitest";
import { BIT_KITS, bitFeeds, bitKind, BITS, compat, kitBitIds, kitsForFamily, MACHINES } from "./catalog";
import products from "./sienciProducts.json";
import { STORE_BITS } from "./storeBits";

describe("Sienci bit library in the UI", () => {
  it("every bit has copy, a product entry for its photo and a store link", () => {
    const ids = new Set(products.bits.map((b) => b.id));
    for (const b of BITS) {
      expect(b.inch, b.id).not.toBe("");
      expect(ids.has(b.id), b.id).toBe(true);
      expect(b.storeUrl).toMatch(/^https:\/\/sienci\.com\/product\//);
      expect(bitKind(b).length).toBeGreaterThan(3);
    }
  });

  it("store section holds the bits CarvCAM does not plan toolpaths for", () => {
    expect(STORE_BITS.map((b) => b.id).sort()).toEqual(BITS.filter((b) => !b.carvcam).map((b) => b.id).sort());
    expect(STORE_BITS.some((b) => b.id === "surfacing-22mm")).toBe(false);
    // The store cards that existed before the full library keep their ids (saved My bits and photos).
    for (const id of ["store-ball-1-8", "store-compression-1-4-dlc", "store-surfacing-1-5"]) expect(BITS.some((b) => b.id === id), id).toBe(true);
  });

  it("shows the sets each bit ships in, and the sets for each machine family", () => {
    expect(BITS.find((b) => b.id === "flat-1-8-upcut")!.kits.map((k) => k.name)).toEqual(["Starter End Mill Set", "3D Carver End Mill Set"]);
    expect(kitsForFamily("AltMill").map((k) => k.id)).toEqual(["altmill-starter-set", "altmill-pro-set", "altmill-sign-maker-set", "altmill-chamfer-set"]);
    expect(kitsForFamily("LongMill MK3").length).toBe(4);
    for (const k of BIT_KITS) expect(kitBitIds(k.id).every((id) => BITS.some((b) => b.id === id))).toBe(true);
  });

  it("badges official vs estimated feeds per machine and head", () => {
    expect(bitFeeds("flat-1-8-upcut", "longmill-mk3-30x30", "autospin-t1").badge).toBe("official");
    expect(bitFeeds("flat-1-8-upcut", "altmill-4x4", "spindle-2-2kw-er20").badge).toBe("estimated");
    expect(bitFeeds("flat-1-4-compression", "longmill-mk2-30x30", "makita-rt0701").badge).toBe("estimated");
    expect(bitFeeds("surfacing-22mm", "longmill-mk3-30x30", "autospin-t1", "plastic").badge).toBe("not-recommended");
    expect(bitFeeds("roughing-3-8-2-dlc", "longmill-mk3-30x30", "autospin-t1").badge).toBe("no-fit");
    const f = bitFeeds("flat-1-4-upcut", "longmill-mk2-30x30", "makita-rt0701", "softwood", "balanced").feeds!;
    expect([f.feed, f.rpm, f.dial]).toEqual([2190, 12000, 2]);
  });

  it("every bit has feeds in wood on every machine and head it fits", () => {
    for (const m of MACHINES)
      for (const h of m.heads)
        for (const b of BITS) {
          const r = bitFeeds(b.id, m.id, h);
          if (r.badge === "no-fit") continue;
          expect({ b: b.id, m: m.id, h, badge: r.badge }).not.toMatchObject({ badge: "not-recommended" });
          expect(r.feeds!.feed).toBeLessThanOrEqual(m.maxSpeed);
        }
  });

  it("3D bits still read as not for signs, but say when they do not fit at all", () => {
    const ball = BITS.find((b) => b.id === "ball-1-4")!;
    expect(compat(ball, "autospin-t1")).toMatchObject({ level: "no", label: "Not for signs (yet)" });
    const roughing = BITS.find((b) => b.id === "roughing-3-8-2-dlc")!;
    expect(compat(roughing, "autospin-t1")).toMatchObject({ level: "no", label: "Does not fit" });
  });
});
