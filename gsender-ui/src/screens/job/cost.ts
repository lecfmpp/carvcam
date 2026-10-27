import type { CostInputs } from "@gsender-next/cam-engine";
import type { Bit } from "../../lib/catalog";
import { DEFAULT_JOB_COST, type JobCost } from "../../state/design";
import type { ShopCost } from "../../state/workshop";

/** Cost & price calculator glue (pure, tested): UI inputs → engine `estimateCost` inputs. */

export const FEE_PRESETS: Record<ShopCost["fee"], { label: string; pct?: number }> = {
  none: { label: "None", pct: 0 },
  etsy: { label: "Etsy 9.5%", pct: 9.5 },
  custom: { label: "Custom" },
};

export const feePct = (shop: ShopCost) => (shop.fee === "custom" ? shop.customFeePct : (FEE_PRESETS[shop.fee].pct ?? 0));

/** Typical street price and life of a bit by type, when the user hasn't entered their own. */
export function defaultBitCost(bit: Pick<Bit, "profile" | "d" | "flutes"> | undefined): { cost: number; lifeHours: number } {
  if (!bit) return { cost: 20, lifeHours: 8 };
  if (bit.profile === "compression") return { cost: 35, lifeHours: 20 };
  if (bit.profile === "v") return { cost: 25, lifeHours: 12 };
  if (bit.profile === "surfacing") return { cost: 60, lifeHours: 40 };
  if (bit.profile === "ball") return { cost: 22, lifeHours: 10 };
  if (bit.d < 2) return { cost: 15, lifeHours: 4 };
  if (bit.d < 4) return { cost: bit.flutes === 1 ? 22 : 18, lifeHours: 8 };
  return { cost: 25, lifeHours: 15 };
}

export function bitCost(shop: ShopCost, id: string, bit: Pick<Bit, "profile" | "d" | "flutes"> | undefined) {
  return shop.bits[id] ?? defaultBitCost(bit);
}

export function jobCostOf(job: JobCost | undefined): JobCost {
  return { ...DEFAULT_JOB_COST, ...job };
}

/**
 * Inputs for one job. The part is the stock the sign uses; the board defaults to that same size
 * (one board per sign) unless the user enters the size of the sheet they buy.
 * `bits`: each bit used with its own cutting time (s, per piece).
 */
export function costInputs(p: {
  timeSec: number;
  shop: ShopCost;
  job: JobCost | undefined;
  stock: { width: number; height: number };
  bits: { id: string; cutTimeSec: number; bit?: Pick<Bit, "profile" | "d" | "flutes"> }[];
  quantity?: number;
}): CostInputs {
  const job = jobCostOf(p.job);
  return {
    timeSec: p.timeSec,
    quantity: p.quantity ?? job.quantity,
    material: {
      boardCost: job.boardCost,
      boardWidth: job.boardWidth ?? p.stock.width,
      boardHeight: job.boardHeight ?? p.stock.height,
      partWidth: p.stock.width,
      partHeight: p.stock.height,
      wastePct: job.wastePct,
    },
    bits: p.bits.map((b) => ({ ...bitCost(p.shop, b.id, b.bit), cutTimeSec: b.cutTimeSec })),
    machineRatePerHour: p.shop.machineRate,
    laborRatePerHour: p.shop.laborRate,
    setupMinutes: p.shop.setupMin,
    finishingMinutesPerPiece: job.finishingMin,
    extrasPerPiece: job.extras,
    marginPct: p.shop.marginPct,
    platformFeePct: feePct(p.shop),
  };
}

/** "$12.50" (or "€12.50"…): the currency symbol in front, two decimals. */
export function money(v: number, currency = "$") {
  const n = (Math.round(v * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 ? `−${currency}${n.replace("-", "")}` : `${currency}${n}`;
}

/** Parses a number field: "" or junk keeps the previous value; negatives become 0. */
export function num(raw: string, prev: number, opts: { min?: number; max?: number } = {}) {
  const clean = raw.replace(",", ".").replace(/[^\d.\-]/g, "");
  const v = Number(clean);
  if (!/\d/.test(clean) || !Number.isFinite(v)) return prev;
  return Math.max(opts.min ?? 0, Math.min(opts.max ?? Infinity, v));
}
