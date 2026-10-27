import { describe, expect, it } from "vitest";
import { estimateCost } from "../src/cost.js";

describe("estimateCost", () => {
  it("worked example: 10 signs, 30 min each, Etsy fee", () => {
    const c = estimateCost({
      timeSec: 1800,
      quantity: 10,
      // 300 × 200 part from a 600 × 1200 board costing 40, +10% waste: 40 × 66000 / 720000 = 3.6667
      material: { boardCost: 40, boardWidth: 600, boardHeight: 1200, partWidth: 300, partHeight: 200, wastePct: 10 },
      // 30 bit lasting 10 h, 0.5 h used: 1.50
      bits: [{ cost: 30, lifeHours: 10 }],
      machineRatePerHour: 2, // 0.5 h → 1.00
      laborRatePerHour: 20, // 30/10 setup + 5 finishing + 30 machine = 38 min → 12.6667
      setupMinutes: 30,
      finishingMinutesPerPiece: 5,
      extrasPerPiece: 2.5,
      marginPct: 50,
      platformFeePct: 9.5,
    });
    expect(c.perPiece).toEqual({ material: 3.67, bitWear: 1.5, machine: 1, labor: 12.67, extras: 2.5, total: 21.34 });
    // 21.34 × 1.5 / 0.905 = 35.37 → rounded up to 35.50
    expect(c.suggestedPrice).toBe(35.5);
    // 35.50 × 0.905 − 21.34 = 10.7875
    expect(c.profitPerPiece).toBe(10.79);
    expect(c.job).toEqual({ totalCost: 213.4, totalTimeSec: 18000, laborMinutes: 380 });
    expect(c.quantity).toBe(10);
  });

  it("the fee gross-up nets the margin after fees", () => {
    const noFee = estimateCost({ timeSec: 0, extrasPerPiece: 10 });
    expect(noFee.suggestedPrice).toBe(15); // default 50% margin
    const fee = estimateCost({ timeSec: 0, extrasPerPiece: 10, platformFeePct: 20 });
    expect(fee.suggestedPrice).toBe(19); // 15 / 0.8 = 18.75 → 19.00
    expect(fee.suggestedPrice * 0.8).toBeGreaterThanOrEqual(15);
  });

  it("defaults: one piece, attended machine time, explicit bit cut time and partial attendance", () => {
    const c = estimateCost({ timeSec: 3600, laborRatePerHour: 30, attendedPct: 25, bits: [{ cost: 20, lifeHours: 5, cutTimeSec: 1800 }] });
    expect(c.quantity).toBe(1);
    expect(c.perPiece.labor).toBe(7.5);
    expect(c.perPiece.bitWear).toBe(2);
    expect(c.job.laborMinutes).toBe(15);
  });
});
