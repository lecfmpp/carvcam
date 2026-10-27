import type { GenerateResult, KeepOutZone } from "@carvcam/cam-engine";
import type { Design } from "../../state/design";
import type { OpGroup } from "./jobUtil";

/**
 * Job setup sheet: everything you need at the machine on one printed page (A4 or Letter).
 * `buildSetupSheet` gathers the data (pure, tested); `setupSheetHtml` turns it into a
 * self-contained page with print CSS.
 */

export interface SheetBit {
  t: number;
  name: string;
  diameter: number;
  rpm: number;
  feed: number;
  plunge: number;
  stepdown: number;
  stepover: number;
  /** Makita dial (router heads set by hand). */
  dial?: number;
}

export interface SetupSheet {
  title: string;
  date: string;
  machine: string;
  head: string;
  headAuto: boolean;
  material: string;
  stock: { width: number; height: number; thickness: number };
  bits: SheetBit[];
  /** In order: which bit goes in first and when to change. */
  toolSteps: string[];
  ops: { n: number; label: string; t: number; bit: string; depth: number; min: number }[];
  totalMin: number;
  /** Holding tabs: how many the cut leaves, their size, and Auto/Manual placement; marks for the drawing. */
  tabs: { count: number; height: number; width: number; manual: boolean; marks: { x: number; y: number; angle: number; width: number; kerf: number }[] } | null;
  zones: KeepOutZone[];
  /** Top view in mm, Y up: SVG path data for the part outline and the cuts. */
  drawing: { outline: string; cuts: string; through: string };
  checklist: string[];
  verified: boolean;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
type Poly = { x: number; y: number }[];

/** SVG path data (y flipped so the board's bottom-left is at the bottom-left of the drawing). */
export function regionPath(region: Poly[], height: number) {
  return region
    .filter((p) => p.length > 1)
    .map((p) => "M" + p.map((q) => `${r1(q.x)} ${r1(height - q.y)}`).join("L") + "Z")
    .join("");
}

export function buildSetupSheet(input: {
  design: Design;
  result: GenerateResult;
  groups: OpGroup[];
  machine: string;
  head: { name: string; auto: boolean };
  bitName(tool: number): string;
  date?: Date;
}): SetupSheet {
  const { design, result, groups } = input;
  const L = result.layout;
  const stock = { width: r1(L.stock.width), height: r1(L.stock.height), thickness: r1(L.stock.thickness) };
  const order: number[] = [];
  for (const g of groups) if (!order.includes(g.tool)) order.push(g.tool);
  if (!order.length) order.push(result.tools[0]?.id ?? 1);

  const bits: SheetBit[] = order.map((t) => {
    const tool = result.tools.find((x) => x.id === t) ?? result.tools[0];
    const p = result.tools.length > 1 && result.tools[1]?.id === t ? result.params.cutout : result.params.main;
    const dial = result.manualAdjustments.find((a) => a.tool === t)?.dial;
    return { t, name: input.bitName(t), diameter: r1(tool?.diameter ?? 0), rpm: p.rpm, feed: p.feed, plunge: p.plunge, stepdown: p.stepdown, stepover: p.stepover, ...(dial != null ? { dial } : {}) };
  });

  const toolSteps = [`Start with T${order[0]} · ${input.bitName(order[0])}`];
  for (let i = 1; i < order.length; i++) {
    const first = groups.findIndex((g) => g.tool === order[i]);
    toolSteps.push(`Change to T${order[i]} · ${input.bitName(order[i])}${first >= 0 ? ` before step ${first + 1} (${groups[first].label})` : ""}, then measure the bit height again`);
  }

  const ops = groups.map((g, i) => ({
    n: i + 1,
    label: g.label,
    t: g.tool,
    bit: input.bitName(g.tool),
    depth: r1(Math.max(0, ...g.raw.map((k) => result.operations[k]?.depth ?? 0))),
    min: Math.max(0, g.sec / 60),
  }));

  const H = L.stock.height;
  const cuts = [...L.engraved, ...(L.relief ? [L.relief] : [])].map((c) => regionPath(c.region, H)).join("");
  const through = [...L.cutouts, ...L.holes].map((c) => regionPath(c.region, H)).join("");
  const outline = L.profile ? regionPath(L.profile.region, H) : regionPath(L.part, H);
  const hasProfile = result.operations.some((o) => o.type === "profile");
  const zones = design.keepOut ?? [];

  const checklist = [
    "Board clamped flat, nothing rocks",
    zones.length ? `Clamps where the sheet shows them (${zones.length})` : "Clamps outside the carving area",
    "Work zero set: X0 Y0 bottom-left corner, Z0 top of the board",
    `Bit T${order[0]} installed and tight in the collet`,
    input.head.auto ? "Spindle speed set by the program" : `Router dial set (${bits[0]?.dial ?? "see table"})`,
    "Dust collection on",
    "Eye and ear protection on",
  ];

  return {
    title: design.name || "Untitled sign",
    date: (input.date ?? new Date()).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
    machine: input.machine,
    head: input.head.name,
    headAuto: input.head.auto,
    material: design.material,
    stock,
    bits,
    toolSteps,
    ops,
    totalMin: (result.verification?.stats.estimatedTimeSec ?? ops.reduce((a, o) => a + o.min * 60, 0)) / 60,
    tabs: sheetTabs(design, result, hasProfile),
    zones,
    drawing: { outline, cuts, through },
    checklist,
    verified: !!result.ok,
  };
}

/** Tabs as the job will cut them (the engine's count when it reports them). */
function sheetTabs(design: Design, result: GenerateResult, hasProfile: boolean): SetupSheet["tabs"] {
  const t = design.tabs;
  const asked = t.mode === "manual" ? (t.positions?.length ?? 0) : t.count;
  const placed = result.tabs ?? [];
  const count = placed.length || asked;
  if (!hasProfile || count === 0) return null;
  return {
    count,
    height: t.height,
    width: t.width ?? 6,
    manual: t.mode === "manual",
    marks: placed.map((m) => ({ x: r1(m.x), y: r1(m.y), angle: m.angle, width: m.width, kerf: m.kerf })),
  };
}

/** "4 tabs · 6 mm wide × 3 mm high (placed by hand)". */
export function tabsText(t: SetupSheet["tabs"]): string {
  if (!t) return "None";
  return `${t.count} tab${t.count === 1 ? "" : "s"} · ${t.width} mm wide × ${t.height} mm high${t.manual ? " (placed by hand)" : ""}`;
}

const esc = (s: string | number) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function minText(min: number) {
  if (min < 1) return "<1 min";
  if (min >= 60) return `${Math.floor(min / 60)} h ${Math.round(min % 60)} min`;
  return `${Math.round(min)} min`;
}

/** The top-view drawing: board, cuts, keep-out zones, origin marker. Units: mm. */
export function sheetSvg(s: SetupSheet) {
  const W = s.stock.width;
  const H = s.stock.height;
  let x0 = 0, y0 = 0, x1 = W, y1 = H;
  for (const z of s.zones) {
    x0 = Math.min(x0, z.x);
    y0 = Math.min(y0, z.y);
    x1 = Math.max(x1, z.x + z.width);
    y1 = Math.max(y1, z.y + z.height);
  }
  const pad = Math.max(W, H) * 0.09 + 6;
  const vx = x0 - pad;
  const vy = H - y1 - pad;
  const vw = x1 - x0 + 2 * pad;
  const vh = y1 - y0 + 2 * pad;
  const k = Math.max(vw, vh) / 100; // stroke / text scale
  const zones = s.zones
    .map((z, i) => {
      const y = H - (z.y + z.height);
      return `<rect x="${r1(z.x)}" y="${r1(y)}" width="${r1(z.width)}" height="${r1(z.height)}" fill="url(#hatch)" stroke="#d63a2c" stroke-width="${r1(0.5 * k)}"/>
<text x="${r1(z.x + z.width / 2)}" y="${r1(y + z.height / 2 + 1.2 * k)}" font-size="${r1(3.2 * k)}" text-anchor="middle" fill="#a3241a" font-weight="600" paint-order="stroke" stroke="#fff" stroke-width="${r1(0.8 * k)}">${esc(z.label || `Zone ${i + 1}`)}</text>`;
    })
    .join("");
  const ax = r1(Math.min(W, H) * 0.22 + 4);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r1(vx)} ${r1(vy)} ${r1(vw)} ${r1(vh)}" preserveAspectRatio="xMidYMid meet">
<defs><pattern id="hatch" width="${r1(2.4 * k)}" height="${r1(2.4 * k)}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="${r1(2.4 * k)}" height="${r1(2.4 * k)}" fill="#fde3df"/><line x1="0" y1="0" x2="0" y2="${r1(2.4 * k)}" stroke="#d63a2c" stroke-width="${r1(0.7 * k)}"/></pattern>
<marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#111"/></marker></defs>
<rect x="0" y="0" width="${W}" height="${H}" fill="#f3ead9" stroke="#8a7350" stroke-width="${r1(0.35 * k)}"/>
<path d="${s.drawing.outline}" fill="none" stroke="#111" stroke-width="${r1(0.45 * k)}" stroke-dasharray="${r1(1.6 * k)} ${r1(0.8 * k)}"/>
<path d="${s.drawing.cuts}" fill="#c9a47b" fill-rule="evenodd" stroke="#6b4a2a" stroke-width="${r1(0.2 * k)}"/>
<path d="${s.drawing.through}" fill="#333" fill-rule="evenodd"/>
${(s.tabs?.marks ?? [])
  .map((m) => `<rect x="${r1(-m.width / 2)}" y="${r1(-m.kerf / 2)}" width="${r1(m.width)}" height="${r1(m.kerf)}" fill="#FFB020" stroke="#6B3500" stroke-width="${r1(0.3 * k)}" transform="translate(${r1(m.x)} ${r1(H - m.y)}) rotate(${r1(-m.angle)})"/>`)
  .join("")}
${zones}
<line x1="0" y1="${H}" x2="${ax}" y2="${H}" stroke="#111" stroke-width="${r1(0.5 * k)}" marker-end="url(#arr)"/>
<line x1="0" y1="${H}" x2="0" y2="${r1(H - ax)}" stroke="#111" stroke-width="${r1(0.5 * k)}" marker-end="url(#arr)"/>
<text x="${r1(ax + 1.2 * k)}" y="${r1(H + 1.2 * k)}" font-size="${r1(3.4 * k)}" font-weight="700">X</text>
<text x="${r1(-1.2 * k)}" y="${r1(H - ax - 1.5 * k)}" font-size="${r1(3.4 * k)}" font-weight="700" text-anchor="middle">Y</text>
<circle cx="0" cy="${H}" r="${r1(1.8 * k)}" fill="#ff5b1f" stroke="#fff" stroke-width="${r1(0.5 * k)}"/>
<text x="${r1(1.5 * k)}" y="${r1(H + 5 * k)}" font-size="${r1(3 * k)}" font-weight="600">X0 Y0 · Z0 = top of board</text>
<text x="${r1(W / 2)}" y="${r1(H - y1 - 2 * k)}" font-size="${r1(3 * k)}" text-anchor="middle" fill="#555">${W} mm</text>
<text x="${r1(x1 + 2 * k)}" y="${r1(H / 2)}" font-size="${r1(3 * k)}" fill="#555" transform="rotate(90 ${r1(x1 + 2 * k)} ${r1(H / 2)})" text-anchor="middle">${H} mm</text>
</svg>`;
}

export function setupSheetHtml(s: SetupSheet): string {
  const feeds = s.bits
    .map(
      (b) =>
        `<tr><td><b>T${b.t}</b></td><td>${esc(b.name)}<div class="sub">Ø ${b.diameter} mm</div></td><td>${b.feed}</td><td>${b.plunge}</td><td>${b.stepdown}</td><td>${b.stepover}</td><td>${s.headAuto ? `${b.rpm.toLocaleString("en-US")}` : `dial ${b.dial ?? "—"}<div class="sub">${b.rpm.toLocaleString("en-US")} RPM</div>`}</td></tr>`,
    )
    .join("");
  const ops = s.ops.map((o) => `<tr><td>${o.n}</td><td>${esc(o.label)}</td><td>T${o.t}</td><td>${o.depth} mm</td><td>${minText(o.min)}</td></tr>`).join("");
  const zones = s.zones.length
    ? s.zones.map((z, i) => `<li><b>${esc(z.label || `Zone ${i + 1}`)}</b> X${z.x} Y${z.y} · ${z.width} × ${z.height} mm · ${z.clearance ?? 20} mm tall</li>`).join("")
    : `<li class="muted">None marked. Keep clamps off the carving area.</li>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Setup sheet · ${esc(s.title)}</title>
<style>
@page { size: auto; margin: 11mm; }
* { box-sizing: border-box; }
html, body { margin: 0; background: #fff; color: #111; font: 10.5pt/1.35 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { max-width: 190mm; margin: 0 auto; padding: 8mm 0; }
@media print { .page { padding: 0; } }
header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 10px; }
h1 { font-size: 17pt; margin: 0; letter-spacing: -0.01em; }
.brand { font: 600 9pt ui-monospace, monospace; color: #ff5b1f; letter-spacing: .08em; text-transform: uppercase; }
.meta { text-align: right; font-size: 9.5pt; color: #333; }
.top { display: grid; grid-template-columns: 1.25fr 1fr; gap: 12px; align-items: start; }
.drawing { border: 1px solid #ccc; border-radius: 6px; padding: 6px; height: 74mm; }
.drawing svg { width: 100%; height: 100%; display: block; }
h2 { font-size: 9pt; text-transform: uppercase; letter-spacing: .06em; color: #555; margin: 10px 0 4px; }
.top h2:first-child { margin-top: 0; }
dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 0; }
dt { color: #555; } dd { margin: 0; font-weight: 600; }
table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
th { text-align: left; font-weight: 600; color: #555; border-bottom: 1px solid #999; padding: 3px 4px; font-size: 8.5pt; }
td { border-bottom: 1px solid #e3e3e3; padding: 3px 4px; vertical-align: top; }
.sub { font-size: 8pt; color: #666; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
ol, ul { margin: 0; padding-left: 18px; }
li { margin: 1px 0; }
.muted { color: #777; }
.checks { list-style: none; padding: 0; columns: 2; column-gap: 12px; }
.checks li { break-inside: avoid; display: flex; gap: 6px; align-items: flex-start; }
.box { width: 11px; height: 11px; border: 1.5px solid #111; border-radius: 2px; flex: none; margin-top: 2px; }
.total { display: flex; justify-content: space-between; font-weight: 700; padding: 4px; }
.warn { color: #b3261e; font-weight: 600; }
footer { margin-top: 10px; font-size: 8pt; color: #777; border-top: 1px solid #ddd; padding-top: 4px; }
</style></head><body><div class="page">
<header><div><div class="brand">CarvCAM · Setup sheet</div><h1>${esc(s.title)}</h1></div>
<div class="meta">${esc(s.date)}<br>${esc(s.machine)} · ${esc(s.head)}</div></header>
<div class="top">
<div class="drawing">${sheetSvg(s)}</div>
<div>
<h2>Stock</h2>
<dl><dt>Material</dt><dd>${esc(s.material)}</dd><dt>Board</dt><dd>${s.stock.width} × ${s.stock.height} mm</dd><dt>Thickness</dt><dd>${s.stock.thickness} mm</dd>
<dt>Zero</dt><dd>X0 Y0 bottom-left, Z0 top</dd>
<dt>Tabs</dt><dd>${esc(tabsText(s.tabs))}</dd>
<dt>Time</dt><dd>${minText(s.totalMin)} estimated</dd></dl>
<h2>Bits, in order</h2>
<ol>${s.toolSteps.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>
<h2>Keep-out zones</h2>
<ul>${zones}</ul>
</div></div>
<h2>Feeds &amp; speeds</h2>
<table><thead><tr><th>Tool</th><th>Bit</th><th>Feed mm/min</th><th>Plunge mm/min</th><th>Pass mm</th><th>Stepover mm</th><th>${s.headAuto ? "RPM" : "Makita"}</th></tr></thead><tbody>${feeds}</tbody></table>
<h2>Operations</h2>
<table><thead><tr><th>#</th><th>Operation</th><th>Tool</th><th>Depth</th><th>Time</th></tr></thead><tbody>${ops}</tbody></table>
<div class="total"><span>Total</span><span>${minText(s.totalMin)}</span></div>
<h2>Before you press Start</h2>
<ul class="checks">${s.checklist.map((c) => `<li><span class="box"></span>${esc(c)}</li>`).join("")}</ul>
<footer>${s.verified ? "G-code verified by CarvCAM: inside travel, no rapid moves into the stock" : '<span class="warn">Not verified: fix the errors in CarvCAM before carving.</span>'}${s.zones.length ? " · travel height raised over the keep-out zones" : ""}</footer>
</div></body></html>`;
}
