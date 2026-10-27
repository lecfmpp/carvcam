/**
 * Cost and selling-price calculator for a sign (or a batch of identical signs).
 * All money values are in whatever currency the inputs use; results are rounded to cents.
 */
export interface CostInputs {
  /** Machine time per piece, seconds (from `verification.stats.estimatedTimeSec`). */
  timeSec: number;
  /** Pieces in the job. Default 1. */
  quantity?: number;
  /**
   * Board the parts come from. Cost share per piece =
   * boardCost × (partWidth × partHeight × (1 + wastePct/100)) / (boardWidth × boardHeight).
   * Any length unit works as long as board and part use the same one. wastePct defaults to 0.
   */
  material?: { boardCost: number; boardWidth: number; boardHeight: number; partWidth: number; partHeight: number; wastePct?: number };
  /**
   * Bits used. Wear per piece = cost × (cutTimeSec / 3600) / lifeHours, summed over the bits.
   * cutTimeSec (per piece) defaults to timeSec.
   */
  bits?: { cost: number; lifeHours: number; cutTimeSec?: number }[];
  /** Electricity + wear of the machine, per hour. Machine per piece = rate × timeSec / 3600. */
  machineRatePerHour?: number;
  /** Labor rate per hour. */
  laborRatePerHour?: number;
  /** Per job, not per piece (zeroing, clamping, cleanup); spread across the quantity. */
  setupMinutes?: number;
  /** Sanding, painting, finishing per piece. */
  finishingMinutesPerPiece?: number;
  /** Share of the machine time someone is watching the machine (and paid for it), %. Default 100. */
  attendedPct?: number;
  /** Paint, hanging hardware, packaging, per piece. */
  extrasPerPiece?: number;
  /** Markup over cost, %. Default 50. */
  marginPct?: number;
  /** Marketplace fee taken from the sale price, % (e.g. Etsy ≈ 9.5). Default 0. */
  platformFeePct?: number;
}

export interface CostBreakdown {
  perPiece: { material: number; bitWear: number; machine: number; labor: number; extras: number; total: number };
  job: { totalCost: number; totalTimeSec: number; laborMinutes: number };
  suggestedPrice: number;
  profitPerPiece: number;
  quantity: number;
}

/**
 * Formulas (q = quantity, t = timeSec per piece, all per piece unless noted):
 * - material = boardCost × partArea × (1 + wastePct/100) / boardArea (0 without `material`)
 * - bitWear  = Σ bit.cost × ((bit.cutTimeSec ?? t) / 3600) / bit.lifeHours
 * - machine  = machineRatePerHour × t / 3600
 * - labor minutes = setupMinutes / q + finishingMinutesPerPiece + (t / 60) × attendedPct/100
 * - labor    = laborRatePerHour × labor minutes / 60
 * - extras   = extrasPerPiece
 * - total    = sum of the five, each already rounded to cents (so the parts add up exactly)
 * - suggestedPrice = total × (1 + marginPct/100) / (1 − platformFeePct/100), rounded UP to the next 0.50.
 *   The fee gross-up means that after the platform takes its cut you still net total × (1 + margin).
 * - profitPerPiece = suggestedPrice × (1 − platformFeePct/100) − total
 * - job.totalCost = total × q; job.totalTimeSec = t × q;
 *   job.laborMinutes = setupMinutes + q × (finishing + attended machine minutes)
 * Missing rates count as 0; negative inputs are treated as 0; quantity is at least 1;
 * the platform fee is capped at 99%.
 */
export function estimateCost(i: CostInputs): CostBreakdown {
  const pos = (v: number | undefined, d = 0) => (v === undefined || !Number.isFinite(v) ? d : Math.max(0, v));
  const q = Math.max(1, Math.round(pos(i.quantity, 1)));
  const t = pos(i.timeSec);
  const margin = pos(i.marginPct, 50) / 100;
  const fee = Math.min(0.99, pos(i.platformFeePct) / 100);
  const attended = pos(i.attendedPct, 100) / 100;

  let material = 0;
  if (i.material) {
    const m = i.material;
    const board = pos(m.boardWidth) * pos(m.boardHeight);
    material = board > 0 ? (pos(m.boardCost) * pos(m.partWidth) * pos(m.partHeight) * (1 + pos(m.wastePct) / 100)) / board : 0;
  }
  const bitWear = (i.bits ?? []).reduce((s, b) => {
    const life = pos(b.lifeHours);
    return life > 0 ? s + (pos(b.cost) * (pos(b.cutTimeSec, t) / 3600)) / life : s;
  }, 0);
  const machine = (pos(i.machineRatePerHour) * t) / 3600;
  const laborMinPerPiece = pos(i.setupMinutes) / q + pos(i.finishingMinutesPerPiece) + (t / 60) * attended;
  const labor = (pos(i.laborRatePerHour) * laborMinPerPiece) / 60;
  const extras = pos(i.extrasPerPiece);

  const perPiece = { material: cents(material), bitWear: cents(bitWear), machine: cents(machine), labor: cents(labor), extras: cents(extras), total: 0 };
  perPiece.total = cents(perPiece.material + perPiece.bitWear + perPiece.machine + perPiece.labor + perPiece.extras);
  const raw = (perPiece.total * (1 + margin)) / (1 - fee);
  const suggestedPrice = Math.ceil(cents(raw) * 2 - 1e-9) / 2;
  return {
    perPiece,
    job: {
      totalCost: cents(perPiece.total * q),
      totalTimeSec: Math.round(t * q),
      laborMinutes: Math.round((pos(i.setupMinutes) + q * (pos(i.finishingMinutesPerPiece) + (t / 60) * attended)) * 100) / 100,
    },
    suggestedPrice,
    profitPerPiece: cents(suggestedPrice * (1 - fee) - perPiece.total),
    quantity: q,
  };
}

const cents = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
