import { buildInlay, inlayNumbers, type GenerateResult, type PlateSpecInput } from "@carvcam/cam-engine";
import { ArrowLeftRight, Download, Layers, Sparkles, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ProBadge, useProGate } from "../../account/ProGate";
import { Seg, Stepper } from "../../components/ui";
import { engineOptions, runEngine } from "../../engine/useEngine";
import { BITS, bitById, materialById, MATERIALS, type Bit } from "../../lib/catalog";
import { useDesign, type Design } from "../../state/design";
import { toast } from "../../state/ui";
import { useActiveMachine, useWorkshop } from "../../state/workshop";
import { elementName, elementOf, groupBox, idOf, margin, refOf, type Box, type ElementId } from "./elements";

type Region = { x: number; y: number }[][];

/** Elements that can be inlaid: closed shapes (not lines, open curves or holes). */
export function inlayable(spec: PlateSpecInput, id: ElementId) {
  if (id === "holes") return false;
  const el = elementOf(spec, id) as { type?: string; closed?: boolean } | null;
  if (!el) return false;
  return el.type !== "line" && !(el.type === "curve" && el.closed === false);
}

/** The elements' region in the engine result (the originals, without grid copies), in part mm. */
function regionOf(result: GenerateResult | null, spec: PlateSpecInput, ids: ElementId[]): Region {
  if (!result) return [];
  const m = margin(spec);
  const L = result.layout;
  const all = [...L.engraved, ...L.cutouts, ...(L.parts ?? []), ...(L.relief?.items ?? [])];
  const out: Region = [];
  for (const e of all) {
    if (e.copy) continue;
    const id = idOf(e.ref);
    if (id && ids.includes(id)) out.push(...(e.region as Region).map((p) => p.map((q) => ({ x: q.x - m, y: q.y - m }))));
  }
  return out;
}

const pathOf = (reg: Region) => reg.map((p) => `M${p.map((q) => `${q.x.toFixed(2)},${q.y.toFixed(2)}`).join("L")}Z`).join("");
const fmt = (n: number, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toString();
const baseName = (name: string) => name.replace(/ · inlay (pocket|plug)$/, "");

/**
 * Guided V-carve inlay (Pro): pick the bits and the gaps, see the maths and the cut guide, and
 * create both jobs (the pocket on the base board and the mirrored plug on the insert board).
 * Without Pro everything is a preview, and the last step offers the upgrade instead.
 */
export function InlayWizard({ ids, boxes, result, onClose }: { ids: ElementId[]; boxes: Map<ElementId, Box>; result: GenerateResult | null; onClose(): void }) {
  const gate = useProGate("inlay");
  const design = useDesign((s) => s.design);
  const setDesign = useDesign((s) => s.setDesign);
  const owned = useWorkshop((s) => s.bits);
  const spec = design.spec;
  const sel = ids.filter((id) => inlayable(spec, id) && boxes.has(id));
  const skipped = ids.length - sel.length;

  const byOwned = (a: Bit, b: Bit) => Number(owned.includes(b.id)) - Number(owned.includes(a.id));
  const vbits = BITS.filter((b) => b.profile === "v" && !b.notForSigns).sort(byOwned);
  const flats = BITS.filter((b) => b.profile === "flat" && !b.notForSigns).sort(byOwned);
  const current = bitById(design.bit);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [vbitId, setVbit] = useState((current?.profile === "v" ? current : (vbits.find((b) => b.id === "vbit-60-15mm") ?? vbits[0]))?.id ?? "");
  const [flatId, setFlat] = useState(
    (flats.find((b) => b.id === design.bit2) ?? flats.find((b) => b.id === "flat-1-4-upcut" && owned.includes(b.id)) ?? flats.find((b) => owned.includes(b.id)) ?? flats[0])?.id ?? "",
  );
  const [clear, setClear] = useState(true);
  const [D, setD] = useState(3);
  const [gap, setGap] = useState(0.5);
  const [F, setF] = useState(2);
  const baseMat = materialById(design.material);
  const [plugMat, setPlugMat] = useState(baseMat.id === "Walnut" ? "Pine" : "Walnut");
  const [T, setT] = useState(12);

  const vbit = bitById(vbitId);
  const flat = bitById(flatId);
  const n = inlayNumbers({ depth: D, glueGap: gap, boardGap: F }, { diameter: vbit?.d ?? 15, angle: vbit?.angle ?? 60 });
  const reach = Math.min(n.cone, vbit?.cut ?? 99);
  const problems: string[] = [];
  if (!vbit) problems.push("Pick a V-bit.");
  if (D > reach + 1e-6) problems.push(`The ${vbit?.name} reaches ${fmt(reach)} mm with its cone; the pocket asks for ${fmt(D)} mm.`);
  if (n.plugDepth > reach + 1e-6) problems.push(`The plug needs ${fmt(n.plugDepth)} mm of cone on the ${vbit?.name}; lower the depth or the board gap.`);
  if (D > spec.thickness - 1) problems.push(`The ${spec.thickness} mm base board is too thin for a ${fmt(D)} mm pocket.`);
  if (n.plugDepth > T - 1) problems.push(`The plug board must be at least ${fmt(Math.ceil(n.plugDepth + 1))} mm thick.`);
  if (!sel.length) problems.push("Select a closed shape, an icon, a drawing or text first.");

  const shape = regionOf(result, spec, sel);
  const mg = margin(spec);
  const outline = result ? (result.layout.part as Region).map((p) => p.map((q) => ({ x: q.x - mg, y: q.y - mg }))) : undefined;
  const g = sel.length ? groupBox(sel, boxes) : null;
  const plugW = g ? g.x1 - g.x0 + 20 : 0;
  const plugH = g ? g.y1 - g.y0 + 20 : 0;

  const create = () => {
    if (!gate.allowed) return gate.ask();
    if (problems.length || !g) return;
    const m = buildInlay(
      spec,
      sel.map((id) => ({ ref: refOf(id)!, box: boxes.get(id)! })),
      { depth: D, glueGap: gap, boardGap: F, clear, plugThickness: T, plugMaterial: materialById(plugMat).engine },
    );
    const { inlayOther: _old, savedId: _saved, ...rest } = design;
    const useBit2 = clear && !!flat;
    const name = baseName(design.name);
    const base: Design = { ...rest, name: `${name} · inlay pocket`, spec: m.base, bit: vbitId, bit2: useBit2 ? flatId : design.bit2, useBit2 };
    const plug: Design = {
      name: `${name} · inlay plug`,
      material: plugMat,
      spec: { ...m.plug, material: materialById(plugMat).engine },
      bit: vbitId,
      bit2: useBit2 ? flatId : undefined,
      useBit2,
      preset: design.preset,
      tabs: design.tabs,
    };
    setDesign({ ...base, inlayOther: plug });
    toast("Pocket job ready. Open the plug job from the Inlay card in the panel.");
    onClose();
  };

  const steps: [1 | 2 | 3, string][] = [
    [1, "Shape"],
    [2, "Bits and gaps"],
    [3, "Cut guide"],
  ];
  const errorList = problems.map((p) => (
    <div key={p} className="tiny" style={{ color: "var(--alarm-text)" }}>
      {p}
    </div>
  ));

  return createPortal(
    <div className="create-modal" role="dialog" aria-modal="true" aria-label="Guided inlay" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="create-modal__card">
        <div className="create-modal__head">
          <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Layers size={18} strokeWidth={1.75} /> Guided V-carve inlay <ProBadge />
          </h3>
          <button className="create-modal__close" aria-label="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <nav className="inlay-steps" aria-label="Steps">
          {steps.map(([k, label]) => (
            <button key={k} aria-current={step === k ? "step" : undefined} onClick={() => setStep(k)}>
              <b>{k}</b> {label}
            </button>
          ))}
        </nav>
        <div className="inlay-body">
          <div className="inlay-section">
            {step === 3 ? (
              <Guide D={D} gap={gap} F={F} s={n.plugStart} plugDepth={n.plugDepth} base={`${spec.thickness} mm ${baseMat.id}`} plug={`${fmt(plugW, 0)} × ${fmt(plugH, 0)} × ${T} mm ${plugMat}`} vbit={vbit?.name ?? "V-bit"} flat={clear && flat ? flat.name : null} />
            ) : (
              <>
                <div className="inlay-previews">
                  <Preview title="Pocket · base board" sub={`${spec.width} × ${spec.height} mm ${baseMat.id}`} w={spec.width} h={spec.height} face={baseMat.face} fill={baseMat.recess} shape={shape} outline={outline} />
                  <Preview
                    title="Plug · insert board (mirrored)"
                    sub={g ? `${fmt(plugW, 0)} × ${fmt(plugH, 0)} mm ${plugMat}` : ""}
                    w={plugW || 10}
                    h={plugH || 10}
                    face={materialById(plugMat).recess}
                    fill={materialById(plugMat).face}
                    shape={g ? shape.map((p) => p.map((q) => ({ x: g.x1 + 10 - q.x, y: q.y - g.y0 + 10 }))) : []}
                  />
                </div>
                <CrossSection D={D} gap={gap} F={F} tan={n.tan} base={baseMat.face} plug={materialById(plugMat).face} />
              </>
            )}
          </div>
          <div className="inlay-section">
            {step === 1 ? (
              <>
                <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                  {sel.length ? (
                    <>
                      Inlaying <b>{sel.map((id) => elementName(spec, id)).join(", ")}</b>. The pocket is V-carved into this board; the plug is the same shape, mirrored, carved standing up on a second board. Flip the plug, glue it in, and plane it flush.
                    </>
                  ) : (
                    "Select a closed shape, an icon, a drawing or some text on the board, then open the inlay again."
                  )}
                </div>
                {skipped ? <div className="tiny muted">{skipped} selected line(s) or open curve(s) can't be inlaid and are left as they are.</div> : null}
                <div className="tiny muted">Bold shapes inlay best: thin strokes and sharp inside points make fragile plugs. Archivo Black is a good inlay font.</div>
                <div className="create-modal__actions">
                  <button className="btn btn--primary btn--sm" disabled={!sel.length} onClick={() => setStep(2)}>
                    Next: bits and gaps
                  </button>
                </div>
              </>
            ) : step === 2 ? (
              <>
                <Row label="V-bit" aside={<span className="tiny muted">same bit for both parts</span>}>
                  <select className="inlay-select" value={vbitId} onChange={(e) => setVbit(e.target.value)} aria-label="V-bit">
                    {vbits.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} · {b.inch}
                        {owned.includes(b.id) ? "" : " (not in your bits)"}
                      </option>
                    ))}
                  </select>
                </Row>
                <div className="copies-pop__two">
                  <Row label="Pocket depth">
                    <Stepper label="Pocket depth" value={D} min={1} max={10} step={0.5} unit="mm" onChange={setD} />
                  </Row>
                  <Row label="Glue gap">
                    <Stepper label="Glue gap" value={gap} min={0} max={1.5} step={0.1} unit="mm" onChange={setGap} />
                  </Row>
                </div>
                <div className="copies-pop__two">
                  <Row label="Plug board">
                    <Stepper label="Plug board thickness" value={T} min={4} max={40} step={1} unit="mm" onChange={setT} />
                  </Row>
                  <Row label="Board gap">
                    <Stepper label="Gap between boards" value={F} min={0.5} max={6} step={0.5} unit="mm" onChange={setF} />
                  </Row>
                </div>
                <Row label="Plug wood">
                  <select className="inlay-select" value={plugMat} onChange={(e) => setPlugMat(e.target.value)} aria-label="Plug wood">
                    {MATERIALS.filter((m) => m.id !== "Acrylic").map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.id}
                      </option>
                    ))}
                  </select>
                </Row>
                <Row label="Clear flat areas with a flat bit">
                  <Seg<"yes" | "no">
                    label="Flat-bit clearing"
                    value={clear ? "yes" : "no"}
                    onChange={(v) => setClear(v === "yes")}
                    options={[
                      ["yes", "Yes, faster"],
                      ["no", "V-bit only"],
                    ]}
                  />
                  {clear ? (
                    <select className="inlay-select" style={{ marginTop: 8 }} value={flatId} onChange={(e) => setFlat(e.target.value)} aria-label="Flat bit">
                      {flats.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                          {owned.includes(b.id) ? "" : " (not in your bits)"}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </Row>
                <dl className="inlay-nums mono">
                  <dt>Plug start depth (pocket − glue gap)</dt>
                  <dd>{fmt(n.plugStart, 2)} mm</dd>
                  <dt>Plug cut depth (start + board gap)</dt>
                  <dd>{fmt(n.plugDepth, 2)} mm</dd>
                  <dt>Pocket wall slope</dt>
                  <dd>
                    {fmt(n.wallWidth, 2)} mm in over {fmt(D)} mm
                  </dd>
                  <dt>V-bit reach</dt>
                  <dd>{fmt(reach)} mm</dd>
                </dl>
                {errorList}
                <div className="create-modal__actions">
                  <button className="btn btn--outline btn--sm" onClick={() => setStep(1)}>
                    Back
                  </button>
                  <button className="btn btn--primary btn--sm" onClick={() => setStep(3)}>
                    Next: cut guide
                  </button>
                </div>
              </>
            ) : gate.allowed ? (
              <>
                <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                  This makes <b>two jobs</b>: the pocket (this board) opens in the editor now; switch to the plug from the Inlay card in the panel, or download both G-code files there.
                </div>
                {errorList}
                <div className="create-modal__actions">
                  <button className="btn btn--outline btn--sm" onClick={() => setStep(2)}>
                    Back
                  </button>
                  <button className="btn btn--primary btn--sm" disabled={problems.length > 0} onClick={create}>
                    Create pocket + plug jobs
                  </button>
                </div>
              </>
            ) : (
              <ProCallout onUnlock={gate.ask} onClose={onClose} />
            )}
          </div>
        </div>
      </div>
      {gate.dialog}
    </div>,
    document.body,
  );
}

function ProCallout({ onUnlock, onClose }: { onUnlock(): void; onClose(): void }) {
  const openProject = useDesign((s) => s.openProject);
  return (
    <div className="inlay-pro">
      <h4>
        <Sparkles size={16} /> Guided inlays are part of CarvCAM Pro
      </h4>
      <div className="tiny" style={{ lineHeight: 1.5 }}>
        Pro turns any shape or text into a matched pocket and plug, with the start depth and glue gap worked out for your V-bit. Everything above is a free preview.
      </div>
      <div className="inlay-pro__actions">
        <button className="btn btn--primary btn--sm" onClick={onUnlock}>
          <ProBadge /> Unlock guided inlays
        </button>
      </div>
      <button
        className="btn btn--quiet btn--sm"
        onClick={() => {
          openProject("heart-inlay");
          toast("Heart inlay coaster opened. It's free to cut: pocket first, then the plug.");
          onClose();
        }}
      >
        Try the free heart inlay coaster
      </button>
    </div>
  );
}

function Guide(p: { D: number; gap: number; F: number; s: number; plugDepth: number; base: string; plug: string; vbit: string; flat: string | null }) {
  return (
    <ol className="inlay-guide">
      <li>
        <span>
          <b>Cut the pocket in the base board</b> ({p.base}). The {p.vbit} V-carves the walls {fmt(p.D)} mm deep
          {p.flat ? <>, then the {p.flat} clears the flat bottom</> : null}. Don't move the board until the plug fits.
        </span>
      </li>
      <li>
        <span>
          <b>Cut the plug in the insert board</b> ({p.plug}, zero on the lower-left corner and top face like any job). The shape is already mirrored. The V-bit starts {fmt(p.s, 2)} mm deep at the edge of the shape and lowers the rest of the board to {fmt(p.plugDepth, 2)} mm.
        </span>
      </li>
      <li>
        <span>
          <b>Glue and clamp.</b> Dry-fit first: the walls should touch before the plug bottoms out. Brush glue on the walls, flip the plug board into the pocket and clamp. The {fmt(p.gap)} mm gap at the bottom holds the extra glue; the boards stay about {fmt(p.F)} mm apart.
        </span>
      </li>
      <li>
        <span>
          <b>Cut off and flatten.</b> When the glue is dry, saw the plug board off in the {fmt(p.F)} mm gap (or plane it away), then plane, sand or surface the top flush.
        </span>
      </li>
    </ol>
  );
}

function Preview(p: { title: string; sub: string; w: number; h: number; face: string; fill: string; shape: Region; outline?: Region }) {
  const pad = Math.max(p.w, p.h) * 0.04;
  return (
    <div className="inlay-preview">
      <div className="inlay-preview__box">
        <svg viewBox={`${-pad} ${-pad} ${p.w + 2 * pad} ${p.h + 2 * pad}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
          <g transform={`translate(0 ${p.h}) scale(1 -1)`} fillRule="nonzero">
            {p.outline?.length ? <path d={pathOf(p.outline)} fill={p.face} /> : <rect x={0} y={0} width={p.w} height={p.h} rx={2} fill={p.face} />}
            <path d={pathOf(p.shape)} fill={p.fill} stroke="rgba(0,0,0,.35)" strokeWidth={Math.max(p.w, p.h) / 300} />
          </g>
        </svg>
      </div>
      <div style={{ fontSize: 13 }}>{p.title}</div>
      <div className="tiny muted">{p.sub}</div>
    </div>
  );
}

/** Cross-section (widths not to scale): pocket, the fitted plug, the glue gap and the gap between the boards. */
function CrossSection({ D, gap, F, tan, base, plug }: { D: number; gap: number; F: number; tan: number; base: string; plug: string }) {
  const s = D - gap;
  const k = 5; // drawing scale (keeps the depths readable)
  const top = Math.max(26, 2 * D * tan * k + 12); // pocket width at the surface
  const W = 120;
  const x0 = (W - top) / 2;
  const wall = D * tan * k;
  const y0 = (F + 1.6) * k + 6;
  const Y = (z: number) => y0 + z * k; // z > 0 = into the base
  const baseTop = Y(0);
  const pocket = `M${x0},${baseTop} L${x0 + wall},${Y(D)} L${x0 + top - wall},${Y(D)} L${x0 + top},${baseTop}`;
  // Plug: its top at depth s, tight walls; above it, the plug board F above the surface.
  const plugPath = `M${x0 + s * tan * k},${Y(s)} L${x0 + top - s * tan * k},${Y(s)} L${x0 + top + F * tan * k},${Y(-F)} L${W - 4},${Y(-F)} L${W - 4},${Y(-F - 1.6)} L4,${Y(-F - 1.6)} L4,${Y(-F)} L${x0 - F * tan * k},${Y(-F)} Z`;
  const H = Y(D) + 12;
  return (
    <svg className="inlay-xsec" viewBox={`0 0 ${W} ${H}`} aria-label="Cross-section of the inlay">
      <path d={`M0,${baseTop} L${x0},${baseTop} L${x0 + wall},${Y(D)} L${x0 + top - wall},${Y(D)} L${x0 + top},${baseTop} L${W},${baseTop} L${W},${H} L0,${H} Z`} fill={base} />
      <path d={plugPath} fill={plug} stroke="rgba(0,0,0,.4)" strokeWidth={0.2} />
      <path d={pocket} fill="none" stroke="rgba(0,0,0,.55)" strokeWidth={0.25} strokeDasharray="0.8 0.6" />
      <g fontSize={3.6} fill="#2A2420" fontFamily="var(--font-mono, monospace)">
        <text x={x0 + top + 3} y={(Y(s) + Y(D)) / 2 + 1.2}>
          glue gap {fmt(gap)} mm
        </text>
        <text x={x0 + top + F * tan * k + 3} y={(Y(-F) + baseTop) / 2 + 1.2}>
          board gap {fmt(F)} mm
        </text>
        <text x={4} y={Y(D) + 8}>
          pocket {fmt(D)} mm · plug starts {fmt(s, 2)} mm deep
        </text>
      </g>
    </svg>
  );
}

function Row({ label, children, aside }: { label: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="create-field">
      <div className="create-field__label">
        <span>{label}</span>
        {aside}
      </div>
      {children}
    </div>
  );
}

// ------------------------------------------------------------------ panel: inlay card

/** Card in the panel when the design is one part of an inlay (free: switch part and download both). */
export function InlayCard() {
  const design = useDesign((s) => s.design);
  const switchPart = useDesign((s) => s.switchInlayPart);
  const { machine, headId } = useActiveMachine();
  const [busy, setBusy] = useState(false);
  const inlay = design.spec.inlay;
  if (!inlay) return null;
  const pocket = inlay.part === "pocket";
  const bit = bitById(design.bit);
  const depth = inlay.depth ?? 3;
  const glueGap = inlay.glueGap ?? 0.5;
  const n = inlayNumbers({ depth, glueGap, boardGap: inlay.boardGap ?? 2 }, { diameter: bit?.d ?? 15, angle: bit?.angle ?? 60 });
  const other = design.inlayOther;

  const downloadBoth = async () => {
    if (!other) return;
    setBusy(true);
    try {
      const parts = pocket ? [design, other] : [other, design];
      const files: [string, string][] = [];
      for (const d of parts) {
        const r = await runEngine(d.spec, engineOptions(d, machine.id, headId, d.preset ?? machine.preset), false);
        if (!r.ok || !r.result?.ok) {
          toast(`"${d.name}" has issues to fix first. Open it to see them.`);
          return;
        }
        files.push([d.name, r.result.gcode]);
      }
      for (const [name, gcode] of files) saveNc(name, gcode);
      toast("Both G-code files downloaded: pocket first, then plug.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="inlay-card">
      <div className="inlay-card__head">
        <Layers size={16} strokeWidth={1.75} />
        <h3>
          Inlay · part {pocket ? "1" : "2"} of 2: {pocket ? "pocket" : "plug"}
        </h3>
      </div>
      <div className="tiny" style={{ lineHeight: 1.5 }}>
        {pocket ? (
          <>V-carve the pocket {fmt(depth)} mm deep in this board. Then cut the plug, glue it in and plane flush.</>
        ) : (
          <>
            The shape stands up, mirrored. The V-bit starts {fmt(n.plugStart, 2)} mm deep at its edge and lowers the rest to {fmt(n.plugDepth, 2)} mm, so a {fmt(glueGap)} mm glue gap is left in the pocket.
          </>
        )}
      </div>
      <dl className="inlay-nums mono">
        <dt>Pocket depth</dt>
        <dd>{fmt(depth)} mm</dd>
        <dt>Glue gap</dt>
        <dd>{fmt(glueGap)} mm</dd>
        <dt>Plug start / cut depth</dt>
        <dd>
          {fmt(n.plugStart, 2)} / {fmt(n.plugDepth, 2)} mm
        </dd>
      </dl>
      {other ? (
        <div className="inlay-card__actions">
          <button className="btn btn--outline btn--sm" onClick={switchPart}>
            <ArrowLeftRight size={14} /> Open the {pocket ? "plug" : "pocket"} job
          </button>
          <button className="btn btn--quiet btn--sm" disabled={busy} onClick={() => void downloadBoth()}>
            <Download size={14} /> {busy ? "Checking…" : "Both .nc files"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function saveNc(name: string, gcode: string) {
  const file = `${name.trim().replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "") || "inlay"}.nc`;
  const url = URL.createObjectURL(new Blob([gcode], { type: "text/plain" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: file });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
