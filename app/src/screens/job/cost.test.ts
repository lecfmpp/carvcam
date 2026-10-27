import { estimateCost } from "@carvcam/cam-engine";
import { describe, expect, it } from "vitest";
import { DEFAULT_SHOP_COST } from "../../state/workshop";
import { costInputs, defaultBitCost, feePct, money, num } from "./cost";

const stock = { width: 200, height: 120 };

describe("cost inputs", () => {
  it("uses the stock as the board when no board size is entered", () => {
    const i = costInputs({ timeSec: 1800, shop: DEFAULT_SHOP_COST, job: undefined, stock, bits: [{ id: "x", cutTimeSec: 1800, bit: { profile: "flat", d: 3.175, flutes: 2 } }] });
    expect(i.material).toMatchObject({ boardWidth: 200, boardHeight: 120, partWidth: 200, partHeight: 120, boardCost: 12, wastePct: 10 });
    expect(i.bits).toEqual([{ cost: 18, lifeHours: 8, cutTimeSec: 1800 }]);
    expect(i.quantity).toBe(1);
    const c = estimateCost(i);
    expect(c.perPiece.material).toBe(13.2); // 12 × 1.1
    expect(c.perPiece.bitWear).toBe(1.13); // 18 × 0.5 h / 8 h
  });

  it("charges only the share of a bigger sheet", () => {
    const i = costInputs({ timeSec: 0, shop: DEFAULT_SHOP_COST, job: { boardCost: 40, boardWidth: 400, boardHeight: 240, wastePct: 0, quantity: 1, finishingMin: 0, extras: 0 }, stock, bits: [] });
    expect(estimateCost(i).perPiece.material).toBe(10);
  });

  it("applies the platform fee presets and a quantity override", () => {
    expect(feePct({ ...DEFAULT_SHOP_COST, fee: "etsy" })).toBe(9.5);
    expect(feePct({ ...DEFAULT_SHOP_COST, fee: "custom", customFeePct: 6.5 })).toBe(6.5);
    expect(feePct(DEFAULT_SHOP_COST)).toBe(0);
    const i = costInputs({ timeSec: 60, shop: { ...DEFAULT_SHOP_COST, fee: "etsy" }, job: undefined, stock, bits: [], quantity: 12 });
    expect(i.quantity).toBe(12);
    expect(i.platformFeePct).toBe(9.5);
  });

  it("prefers the user's own bit price", () => {
    const shop = { ...DEFAULT_SHOP_COST, bits: { b1: { cost: 40, lifeHours: 20 } } };
    expect(costInputs({ timeSec: 10, shop, job: undefined, stock, bits: [{ id: "b1", cutTimeSec: 10 }] }).bits?.[0]).toMatchObject({ cost: 40, lifeHours: 20 });
    expect(defaultBitCost({ profile: "v", d: 3.175, flutes: 2 })).toEqual({ cost: 25, lifeHours: 12 });
    expect(defaultBitCost(undefined).cost).toBe(20);
  });
});

describe("formatting and parsing", () => {
  it("formats money", () => {
    expect(money(42.5)).toBe("$42.50");
    expect(money(1234.567, "€")).toBe("€1,234.57");
    expect(money(-3)).toBe("−$3.00");
  });
  it("parses numbers leniently", () => {
    expect(num("12,5", 1)).toBe(12.5);
    expect(num("", 7)).toBe(7);
    expect(num("abc", 7)).toBe(7);
    expect(num("-4", 7)).toBe(0);
    expect(num("$30", 7)).toBe(30);
  });
});
