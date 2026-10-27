import { estimateCost, type CostBreakdown } from "@gsender-next/cam-engine";
import { ChevronDown, ChevronUp, Copy } from "lucide-react";
import { useMemo, useState } from "react";
import { ProBadge, useProGate } from "../../account/ProGate";
import { Seg } from "../../components/ui";
import { bitById } from "../../lib/catalog";
import { useDesign } from "../../state/design";
import { toast } from "../../state/ui";
import { useWorkshop, type ShopCost } from "../../state/workshop";
import { bitCost, costInputs, FEE_PRESETS, jobCostOf, money, num } from "./cost";
import type { JobCtx } from "./Job";
import { bitNameFor, fmtMin } from "./jobUtil";
import { NumField } from "./KeepOutPanel";

/** Sample numbers shown (blurred) to free users, so they see what the panel gives them. */
const SAMPLE: CostBreakdown = {
  perPiece: { material: 6.4, bitWear: 0.42, machine: 0.71, labor: 18.75, extras: 2, total: 28.28 },
  job: { totalCost: 28.28, totalTimeSec: 1680, laborMinutes: 45 },
  suggestedPrice: 42.5,
  profitPerPiece: 14.22,
  quantity: 1,
};

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`Copied ${text}`);
  } catch {
    toast(text);
  }
}

/** Per-piece breakdown + job total + suggested price. */
function Breakdown({ c, cur, onCopy }: { c: CostBreakdown; cur: string; onCopy?(): void }) {
  const rows: [string, number][] = [
    ["Material", c.perPiece.material],
    ["Bit wear", c.perPiece.bitWear],
    ["Machine time", c.perPiece.machine],
    ["Labor", c.perPiece.labor],
    ["Extras", c.perPiece.extras],
  ];
  return (
    <div className="cost-out">
      <div className="cost-price">
        <span className="cost-price__k">Suggested price {c.quantity > 1 ? "per piece" : ""}</span>
        <span className="cost-price__v mono">{money(c.suggestedPrice, cur)}</span>
        {onCopy ? (
          <button className="btn btn--outline btn--sm" onClick={onCopy} style={{ gap: 6 }}>
            <Copy size={14} strokeWidth={1.75} />
            Copy
          </button>
        ) : null}
      </div>
      <div className="cost-rows">
        {rows.map(([k, v]) => (
          <div key={k} className="cost-row">
            <span>{k}</span>
            <span className="mono">{money(v, cur)}</span>
          </div>
        ))}
        <div className="cost-row cost-row--total">
          <span>Cost per piece</span>
          <span className="mono">{money(c.perPiece.total, cur)}</span>
        </div>
        <div className="cost-row cost-row--profit">
          <span>Profit per piece</span>
          <span className="mono">{money(c.profitPerPiece, cur)}</span>
        </div>
        {c.quantity > 1 ? (
          <div className="cost-row">
            <span>Job total · {c.quantity} pieces</span>
            <span className="mono">{money(c.job.totalCost, cur)}</span>
          </div>
        ) : null}
        <div className="cost-row">
          <span>Machine · labor</span>
          <span className="mono">
            {fmtMin(c.job.totalTimeSec / 60)} · {fmtMin(c.job.laborMinutes)}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Cost & price (Pro feature "cost") in the Prepare step. */
export function CostPanel({ ctx, quantity, timeSec: timeOverride, title = "Cost & price" }: { ctx: JobCtx; quantity?: number; timeSec?: number; title?: string }) {
  const gate = useProGate("cost");
  const shop = useWorkshop((s) => s.cost);
  const setCost = useWorkshop((s) => s.setCost);
  const design = useDesign((s) => s.design);
  const setJobCost = useDesign((s) => s.setJobCost);
  const [open, setOpen] = useState(true);
  const [ratesOpen, setRatesOpen] = useState(false);
  const { result, groups } = ctx;
  const stock = result?.layout.stock ?? { width: design.spec.width, height: design.spec.height };
  const timeSec = timeOverride ?? result?.verification?.stats.estimatedTimeSec ?? 0;
  const job = jobCostOf(design.jobCost);
  const cur = shop.currency || "$";

  const usedBits = useMemo(() => {
    const byTool = new Map<number, number>();
    for (const g of groups) byTool.set(g.tool, (byTool.get(g.tool) ?? 0) + g.sec);
    if (!byTool.size) byTool.set(1, timeSec);
    return [...byTool].map(([tool, sec]) => {
      const id = tool === 2 && design.useBit2 && design.bit2 ? design.bit2 : design.bit;
      return { tool, id, name: bitNameFor(design, tool), bit: bitById(id), cutTimeSec: sec };
    });
  }, [groups, design, timeSec]);

  const breakdown = useMemo(
    () => estimateCost(costInputs({ timeSec, shop, job: design.jobCost, stock, bits: usedBits, quantity })),
    [timeSec, shop, design.jobCost, stock, usedBits, quantity],
  );

  const patchJob = (p: Partial<typeof job>) => setJobCost({ ...job, ...p });
  const patchShop = (p: Partial<ShopCost>) => setCost(p);

  if (!gate.allowed)
    return (
      <section className="job-sec cost">
        <button className="cost-head" onClick={gate.ask} aria-label="Cost and price, a Pro feature">
          <span className="job-label">{title}</span>
          <ProBadge />
          <span className="cost-head__aside">See what this job costs</span>
        </button>
        <button className="cost-locked" onClick={gate.ask} aria-hidden tabIndex={-1}>
          <div className="cost-blur">
            <Breakdown c={SAMPLE} cur={cur} />
          </div>
          <span className="cost-locked__cta">Material, bit wear, machine time and labor → a price for your customer</span>
        </button>
        {gate.dialog}
      </section>
    );

  return (
    <section className="job-sec cost">
      <button className="cost-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="job-label">{title}</span>
        <ProBadge />
        <span className="cost-head__aside">
          {open ? null : <span className="mono">{money(breakdown.suggestedPrice, cur)}</span>}
          {open ? <ChevronUp size={16} strokeWidth={1.75} /> : <ChevronDown size={16} strokeWidth={1.75} />}
        </span>
      </button>
      {open ? (
        <>
          <Breakdown c={breakdown} cur={cur} onCopy={() => copyText(money(breakdown.suggestedPrice, cur))} />

          <div className="cost-group">
            <div className="cost-group__k">This job</div>
            <div className="cost-grid">
              <NumField label="Board cost" unit={cur} value={job.boardCost} onCommit={(v) => patchJob({ boardCost: num(v, job.boardCost) })} />
              {quantity == null ? <NumField label="Quantity" unit="pcs" value={job.quantity} onCommit={(v) => patchJob({ quantity: Math.max(1, Math.round(num(v, job.quantity, { min: 1, max: 9999 }))) })} /> : null}
              <NumField label="Board width" unit="mm" value={job.boardWidth ?? Math.round(stock.width * 10) / 10} onCommit={(v) => patchJob({ boardWidth: v.trim() === "" ? undefined : num(v, job.boardWidth ?? stock.width, { min: 1 }) })} />
              <NumField label="Board height" unit="mm" value={job.boardHeight ?? Math.round(stock.height * 10) / 10} onCommit={(v) => patchJob({ boardHeight: v.trim() === "" ? undefined : num(v, job.boardHeight ?? stock.height, { min: 1 }) })} />
              <NumField label="Waste" unit="%" value={job.wastePct} onCommit={(v) => patchJob({ wastePct: num(v, job.wastePct, { max: 500 }) })} />
              <NumField label="Finishing / piece" unit="min" value={job.finishingMin} onCommit={(v) => patchJob({ finishingMin: num(v, job.finishingMin) })} />
              <NumField label="Extras / piece" unit={cur} value={job.extras} onCommit={(v) => patchJob({ extras: num(v, job.extras) })} />
            </div>
            <div className="job-fine">Board size defaults to this sign's stock. Enter the sheet you buy to charge only the share you use.</div>
          </div>

          <div className="cost-group">
            <button className="cost-group__toggle" onClick={() => setRatesOpen(!ratesOpen)} aria-expanded={ratesOpen}>
              <span className="cost-group__k">Shop rates · saved for every job</span>
              <span className="mono tiny muted">
                {money(shop.laborRate, cur)}/h · {shop.marginPct}% margin
              </span>
              {ratesOpen ? <ChevronUp size={15} strokeWidth={1.75} /> : <ChevronDown size={15} strokeWidth={1.75} />}
            </button>
            {ratesOpen ? (
              <>
                <div className="cost-grid">
                  <NumField label="Labor" unit={`${cur}/h`} value={shop.laborRate} onCommit={(v) => patchShop({ laborRate: num(v, shop.laborRate) })} />
                  <NumField label="Machine" unit={`${cur}/h`} value={shop.machineRate} onCommit={(v) => patchShop({ machineRate: num(v, shop.machineRate) })} />
                  <NumField label="Margin" unit="%" value={shop.marginPct} onCommit={(v) => patchShop({ marginPct: num(v, shop.marginPct, { max: 1000 }) })} />
                  <NumField label="Setup / job" unit="min" value={shop.setupMin} onCommit={(v) => patchShop({ setupMin: num(v, shop.setupMin) })} />
                </div>
                <div className="numfield">
                  <span className="numfield__k">Platform fee</span>
                  <Seg<ShopCost["fee"]>
                    label="Platform fee"
                    value={shop.fee}
                    onChange={(fee) => patchShop({ fee })}
                    options={(Object.keys(FEE_PRESETS) as ShopCost["fee"][]).map((k) => [k, FEE_PRESETS[k].label])}
                    style={{ width: "100%" }}
                  />
                </div>
                {shop.fee === "custom" ? <NumField label="Fee" unit="%" value={shop.customFeePct} onCommit={(v) => patchShop({ customFeePct: num(v, shop.customFeePct, { max: 99 }) })} /> : null}
                {usedBits.map((b) => {
                  const bc = bitCost(shop, b.id, b.bit);
                  const setBit = (p: Partial<typeof bc>) => patchShop({ bits: { ...shop.bits, [b.id]: { ...bc, ...p } } });
                  return (
                    <div key={b.id} className="cost-bit">
                      <span className="cost-bit__name">
                        T{b.tool} · {b.name}
                      </span>
                      <div className="cost-grid">
                        <NumField label="Bit price" unit={cur} value={bc.cost} onCommit={(v) => setBit({ cost: num(v, bc.cost) })} />
                        <NumField label="Life" unit="h" value={bc.lifeHours} onCommit={(v) => setBit({ lifeHours: num(v, bc.lifeHours, { min: 0.1 }) })} />
                      </div>
                    </div>
                  );
                })}
                <NumField label="Currency symbol" value={undefined} placeholder={cur} onCommit={(v) => v.trim() && patchShop({ currency: v.trim().slice(0, 3) })} />
              </>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
