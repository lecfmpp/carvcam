import type { CutParams } from "@carvcam/cam-engine";
import { AlertTriangle, Check, Download, Pause, Play, Printer, Rows3, XCircle } from "lucide-react";
import { templateFields } from "@carvcam/cam-engine";
import { ProBadge } from "../../account/ProGate";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Issue, Seg, SidePanel, Stepper, VideoCard } from "../../components/ui";
import { engineKey, engineOptions, runEngine, tabCount } from "../../engine/useEngine";
import { BITS, bitById, machineName, materialById, PRESET_LABEL, type Preset } from "../../lib/catalog";
import { MAX_TABS, useDesign, type Tabs } from "../../state/design";
import { toast } from "../../state/ui";
import { evenPositions, positionsFromResult, profileOutlines, TAB_COLOR, TAB_EDGE, tabLimits, tabMarks } from "../../stage/tabs";
import { TabsLayer } from "../../stage/TabsLayer";
import { useWorkshop } from "../../state/workshop";
import { Board, LayoutOverlay, ToolpathOverlay, useSegments } from "../../stage/Board";
import { KeepOutLayer } from "../../stage/KeepOutLayer";
import { fitScale, Stage } from "../../stage/Stage";
import { StageRulers, useRulersOn } from "../../stage/Rulers";
import { ThreeView } from "../../stage/ThreeView";
import type { JobCtx } from "./Job";
import { bitNameFor, fmtMin, PRESETS, rpmText } from "./jobUtil";
import { zoneIssues, zoneOverhang } from "./zones";
import { SetupSheetDialog } from "./SetupSheetDialog";
import { CostPanel } from "./CostPanel";
import { BatchDialog } from "./BatchDialog";
import { buildIssues, engineErrorIssue } from "../create/issues";
import { IssueCard, useIssueCtx, useIssueRunner } from "../create/IssueCard";

const HINT: Record<Preset, string> = {
  fast: "Shorter job; edges may need a bit more sanding.",
  balanced: "Good finish and reasonable time. Best for most signs.",
  detailed: "Slower, cleaner edges and crisper small letters.",
};

/** Time and parameters for each speed (unselected ones run without simulation). */
function usePresetTimes(ctx: JobCtx) {
  const { design, machine, headId, preset, result } = ctx;
  const [other, setOther] = useState<Partial<Record<Preset, { sec: number; params: CutParams }>>>({});
  const key = engineKey(design, machine.id, headId);
  useEffect(() => {
    let alive = true;
    setOther({});
    for (const p of PRESETS) {
      runEngine(design.spec, engineOptions(design, machine.id, headId, p), false).then((r) => {
        if (!alive || !r.result?.verification) return;
        const v = r.result.verification;
        setOther((o) => ({ ...o, [p]: { sec: v.stats.estimatedTimeSec, params: r.result!.params.main } }));
      });
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const cur = result?.verification ? { sec: result.verification.stats.estimatedTimeSec, params: result.params.main } : undefined;
  return { ...other, ...(cur ? { [preset]: cur } : {}) } as Partial<Record<Preset, { sec: number; params: CutParams }>>;
}

export function PrepareStep({ ctx }: { ctx: JobCtx }) {
  const rulersOn = useRulersOn();
  const nav = useNavigate();
  const { design, result, sim, machine, preset, groups } = ctx;
  const patch = useDesign((s) => s.patch);
  const mode = useWorkshop((s) => s.mode);
  const ownBits = useWorkshop((s) => s.bits);
  const times = usePresetTimes(ctx);
  const segs = useSegments(result?.gcode);
  const [playing, setPlaying] = useState(false);
  const [played, setPlayed] = useState(1);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const fields = useMemo(() => templateFields(design.spec), [design.spec]);

  // "Play toolpath": draws the path in ~9 s.
  useEffect(() => {
    if (!playing) return;
    const t0 = performance.now();
    let raf = 0;
    const f = (t: number) => {
      const p = Math.min(1, (t - t0) / 9000);
      setPlayed(p);
      if (p < 1) raf = requestAnimationFrame(f);
      else setPlaying(false);
    };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // Second bit: the finer one engraves the details, the other does the rest.
  const second = useMemo(() => {
    const main = bitById(design.bit);
    if (!main) return null;
    const hasDetail = [...(design.spec.texts ?? []), ...(design.spec.icons ?? []), ...(design.spec.shapes ?? [])].some((e) => (e.mode ?? "relief") !== "cutout");
    if (design.bit2 && bitById(design.bit2)) {
      const b2 = bitById(design.bit2)!;
      const [fine, coarse] = main.d <= b2.d ? [main, b2] : [b2, main];
      return { fine, coarse };
    }
    if (!hasDetail) return null;
    const fine = BITS.filter((b) => ownBits.includes(b.id) && b.profile === "flat" && !b.notForSigns && b.d < main.d - 0.1).sort((a, b) => a.d - b.d)[0];
    return fine ? { fine, coarse: main } : null;
  }, [design, ownBits]);

  const toggleSecond = () => {
    if (!second) return;
    if (design.useBit2) patch({ bit: second.coarse.id, bit2: second.fine.id, useBit2: false });
    else patch({ bit: second.fine.id, bit2: second.coarse.id, useBit2: true });
  };

  const b = result?.layout.stock;
  const errors = result?.warnings.filter((a) => a.severity === "error") ?? [];
  const verified = !!result?.verification?.ok && errors.length === 0;
  const compression = result?.warnings.find((a) => a.code === "COMPRESSION_STEPDOWN");
  const totalSec = result?.verification?.stats.estimatedTimeSec ?? 0;
  const p = result?.params.main;
  const tools = new Set(groups.map((g) => g.tool));
  const zones = design.keepOut ?? [];
  const koPath = zoneIssues(result, zones).filter((i) => i.code === "KEEP_OUT_PATH");
  const isKo = (code: string) => code === "KEEP_OUT_OVERLAP" || code === "KEEP_OUT_TOO_TALL";
  const koBlocked = errors.some((a) => isKo(a.code)) || koPath.length > 0;
  // The same cards as in Create, with their one-click fixes.
  const issueCtx = useIssueCtx();
  const runIssue = useIssueRunner();
  const blocking = useMemo(
    () => buildIssues(result, issueCtx).filter((i) => i.level === "error"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result, issueCtx.ownedBits, issueCtx.keepOut, issueCtx.canUndo, issueCtx.hasLastGood, issueCtx.headId, issueCtx.tabs],
  );
  const tabs = design.tabs;
  const limits = tabLimits(design.spec.thickness ?? 6);
  const nTabs = tabCount(tabs);
  const placedTabs = result?.tabs?.length ?? 0;
  const outlines = useMemo(() => profileOutlines(result), [result]);
  const marks = useMemo(() => tabMarks(tabs, result), [tabs, result]);
  const simTabs = useMemo(() => tabMarks({ ...tabs, mode: "auto" }, result), [tabs, result]);
  const setTabs = (t: Partial<Tabs>) => patch({ tabs: { ...tabs, ...t } });
  /** Canvas edits: a drag on an Auto tab switches to Manual, starting from where the tabs are now. */
  const editTabs = (positions: number[]) => {
    if (tabs.mode !== "manual") toast("Tabs switched to Manual: drag them, click the outline to add one.");
    setTabs({ mode: "manual", positions });
  };
  const setMode = (mode: Tabs["mode"]) => {
    if (mode === tabs.mode) return;
    if (mode === "manual") setTabs({ mode, positions: tabs.positions?.length ? tabs.positions : positionsFromResult(result, tabs.count) });
    else setTabs({ mode, count: Math.min(MAX_TABS, tabs.positions?.length || tabs.count) });
  };

  return (
    <>
      <Stage
        caption="Toolpath preview · orange is where the bit goes"
        canvasTools
        tools={
          <button
            className="tool-btn"
            onClick={() => {
              if (!playing) setPlayed(0);
              setPlaying(!playing);
            }}
          >
            {playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
            {playing ? "Pause preview" : "Play toolpath"}
          </button>
        }
        render={(api) => {
          if (!b) return <div className="muted">Preparing the toolpath…</div>;
          const oh = zoneOverhang(zones, b);
          const s = fitScale(api.size, b.width + 2 * oh.x, b.height + 2 * oh.y);
          const mat = materialById(design.material);
          if (api.view === "3d" && sim) return <ThreeView sim={sim} thickness={b.thickness} material={mat} board={{ width: b.width, height: b.height }} zoom={api.zoom} spin={api.spin} size={api.size} tabs={simTabs} />;
          return (
            <Board width={b.width} height={b.height} scale={s} zoom={api.zoom} rulers={rulersOn} label={`Board ${fmtN(b.width)} × ${fmtN(b.height)} mm`}>
              <div className={`job-face ${mat.grain ? "job-face--grain" : ""}`} style={{ background: mat.face }} />
              {segs.length ? <ToolpathOverlay segments={segs} width={b.width} height={b.height} scale={s} played={played} opacity={0.75} /> : <LayoutOverlay layout={result!.layout} scale={s} />}
              {zones.length ? <KeepOutLayer zones={zones} scale={s} frame={{ width: b.width, height: b.height }} /> : null}
              {ctx.hasProfile && marks.length + outlines.length ? (
                <TabsLayer
                  marks={marks}
                  width={b.width}
                  height={b.height}
                  scale={s}
                  tabHeight={tabs.height}
                  outlines={outlines}
                  positions={tabs.mode === "manual" ? (tabs.positions ?? []) : undefined}
                  onChange={editTabs}
                  autoPositions={() => positionsFromResult(result, tabs.count)}
                />
              ) : null}
              <StageRulers width={b.width} height={b.height} scale={s} zoom={api.zoom} />
            </Board>
          );
        }}
      />
      <SidePanel
        title="Prepare"
        sub={design.name}
        foot={
          <>
            <div className="sidepanel__hint">
              {koBlocked
                ? "A clamp is in the bit's way. Move the clamp in Position or the design in Create."
                : errors.length
                  ? "Fix the problems above to continue (one click each)."
                  : `Everything below is checked for your ${machineName(machine)}.`}
            </div>
            <button className="btn btn--primary btn--lg" disabled={!verified} onClick={() => nav("/position")}>
              Continue to Position →
            </button>
            <button className="btn btn--outline" disabled={!verified || !result?.gcode} onClick={() => result && downloadGcode(design.name, result.gcode)}>
              <Download size={16} strokeWidth={1.75} />
              Download G-code (.nc)
            </button>
          </>
        }
      >
        {ctx.error ? <IssueCard issue={engineErrorIssue(ctx.error, issueCtx)} onRun={runIssue} /> : null}
        {blocking.map((i) => (
          <IssueCard key={i.key} issue={i} onRun={runIssue} />
        ))}

        <section className="job-sec">
          <div className="job-label">Speed</div>
          <div className="preset-grid">
            {PRESETS.map((k) => {
              const t = times[k];
              return (
                <button key={k} className="preset" aria-pressed={k === preset} onClick={() => patch({ preset: k })}>
                  <span className="preset__title">{PRESET_LABEL[k].title}</span>
                  <span className="preset__time">{t ? fmtMin(t.sec / 60) : "…"}</span>
                  <span className="preset__sub">Sienci table: {PRESET_LABEL[k].table}</span>
                  {mode === "pro" && t ? (
                    <span className="preset__pro">
                      {rpmText(t.params.rpm)} · {t.params.feed} mm/min · plunge {t.params.plunge} · pass {t.params.stepdown} mm
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="job-note">{HINT[preset]}</div>
          <div className="job-fine">
            Values from the official Sienci Labs speed table · default for {machine.family}: {PRESET_LABEL[machine.preset].title}
          </div>
          {compression ? (
            <div role="status" className="job-info">
              <span className="job-info__tag">Info</span>Compression bit: pass depth raised to {p?.stepdown} mm so both edges come out clean.
            </div>
          ) : null}
        </section>

        {ctx.hasProfile ? (
          <section className="job-sec job-tabs" aria-labelledby="tabs-label">
            <div className="job-tabs__head">
              <span className="job-tabs__sw" style={{ background: TAB_COLOR, borderColor: TAB_EDGE }} aria-hidden />
              <div className="job-label" id="tabs-label">
                Holding tabs
              </div>
              <Seg<Tabs["mode"]>
                label="Tab placement"
                value={tabs.mode}
                onChange={setMode}
                options={[
                  ["auto", "Auto"],
                  ["manual", "Manual"],
                ]}
              />
            </div>
            <div className="job-note">Small bridges of wood that keep the piece attached to the board until the end. You saw them off afterwards.</div>
            <div className="job-grid2 job-grid2--tabs">
              {tabs.mode === "auto" ? (
                <label className="job-mini">
                  How many
                  <Stepper label="tabs" value={tabs.count} min={0} max={MAX_TABS} onChange={(v) => setTabs({ count: v })} />
                </label>
              ) : (
                <div className="job-mini job-tabs__manual">
                  How many
                  <div className="job-tabs__count">
                    <b>{nTabs}</b> placed
                    <button className="btn btn--outline btn--sm" onClick={() => setTabs({ positions: evenPositions(Math.max(1, nTabs || 4)) })}>
                      Spread evenly
                    </button>
                  </div>
                </div>
              )}
              <label className="job-mini">
                Height
                <Stepper label="tab height" value={tabs.height} unit="mm" step={0.5} min={limits.minHeight} max={limits.maxHeight} onChange={(v) => setTabs({ height: v })} />
              </label>
              <label className="job-mini">
                Width
                <Stepper label="tab width" value={tabs.width} unit="mm" step={0.5} min={limits.minWidth} max={limits.maxWidth} onChange={(v) => setTabs({ width: v })} />
              </label>
            </div>
            {tabs.height >= limits.maxHeight ? <div className="job-fine">{limits.heightNote}</div> : null}
            {tabs.width <= limits.minWidth ? <div className="job-fine">{limits.widthNote}</div> : null}
            {tabs.mode === "manual" ? (
              <div className="job-fine">
                On the preview: drag a tab along the outline, click the outline to add one, double-click a tab to remove it.
                {outlines.length > 1 ? " The same spots are used on every piece." : ""}
              </div>
            ) : (
              <div className="job-fine">Spread evenly around the outline. Drag one on the preview to place them yourself.</div>
            )}
            {nTabs === 0 ? (
              <div role="status" className="job-warn">
                <AlertTriangle size={16} color="var(--paused)" strokeWidth={1.75} />
                <span>
                  <b>Warning:</b> without tabs the piece comes loose at the end. Hold it with double-sided tape.
                </span>
              </div>
            ) : result && placedTabs < nTabs * Math.max(1, outlines.length) && placedTabs > 0 ? (
              <div className="job-fine">
                {placedTabs} of {nTabs * Math.max(1, outlines.length)} tabs fit: tabs too close together, or on a piece too small for them, are left out.
              </div>
            ) : null}
          </section>
        ) : null}

        {second ? (
          <section className="job-sec">
            <div className="job-label">Second bit</div>
            <label className="job-check">
              <input type="checkbox" checked={design.useBit2} onChange={toggleSecond} />
              <span>
                <span className="job-check__title">Use the {second.fine.name} for the fine detail</span>
                <span className="job-check__sub">
                  Engraves the details with {second.fine.inch} flat, cuts the rest with {second.coarse.name}. Adds one bit change.
                </span>
              </span>
            </label>
          </section>
        ) : null}

        <section className="job-summary">
          <div className="job-summary__head">
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span className="job-big">{result ? fmtMin(totalSec / 60) : "…"}</span>
              <span className="job-note">estimated</span>
            </div>
            {result ? (
              verified ? (
                <span className="job-verified">
                  <Check size={13} strokeWidth={2.2} />
                  G-code verified
                </span>
              ) : (
                <span className="job-verified job-verified--bad">
                  <XCircle size={13} strokeWidth={2} />
                  Not verified
                </span>
              )
            ) : null}
          </div>
          <div>
            {groups.map((g, i) => (
              <div key={i} className="job-op">
                <span className="job-op__n">{i + 1}</span>
                <span className="job-op__label">{g.label}</span>
                <span className="job-op__bit">{bitNameFor(design, g.tool)}</span>
                <span className="job-op__time">{fmtMin(g.sec / 60)}</span>
              </div>
            ))}
            {tools.size > 1 ? <div className="job-op job-op--note">The carve pauses once for the bit change.</div> : null}
          </div>
          {ctx.result?.manualAdjustments.map((a) => (
            <div key={a.tool} className="job-row">
              <span>Makita dial for {bitNameFor(design, a.tool)}</span>
              <span className="mono">
                {a.dial} · {rpmText(a.rpm)}
              </span>
            </div>
          ))}
          {b ? (
            <div className="job-row">
              <span>Board needed</span>
              <span className="mono" style={{ color: "var(--text)" }}>
                {fmtN(b.width)} × {fmtN(b.height)} × {fmtN(b.thickness)} mm
              </span>
            </div>
          ) : null}
          {mode === "pro" && p ? (
            <div className="job-fine mono">
              {rpmText(p.rpm)} · feed {p.feed} mm/min · plunge {p.plunge} mm/min · pass {p.stepdown} mm · stepover {p.stepover} mm
            </div>
          ) : null}
          {result?.verification ? (
            <div className="job-fine mono">
              {result.verification.stats.lines.toLocaleString("en-US")} lines · inside travel · no rapid moves into stock
            </div>
          ) : null}
          <button className="btn btn--outline btn--sm job-sheet-btn" disabled={!result?.gcode} onClick={() => setSheetOpen(true)}>
            <Printer size={15} strokeWidth={1.75} />
            Print setup sheet
          </button>
        </section>
        {sheetOpen ? <SetupSheetDialog ctx={ctx} onClose={() => setSheetOpen(false)} /> : null}

        <button className="batch-launch" onClick={() => setBatchOpen(true)}>
          <Rows3 size={18} strokeWidth={1.5} color="var(--text-2)" />
          <span className="batch-launch__text">
            <span className="batch-launch__title">
              Batch from CSV <ProBadge />
            </span>
            <span className="batch-launch__sub">{fields.length ? `One file per row · fills ${fields.map((f) => `{{${f}}}`).join(", ")}` : "Name tags, numbered plaques: one file per row of a spreadsheet"}</span>
          </span>
        </button>
        {batchOpen ? <BatchDialog ctx={ctx} onClose={() => setBatchOpen(false)} /> : null}

        <CostPanel ctx={ctx} />

        <VideoCard id="prepare" />
      </SidePanel>
    </>
  );
}

const fmtN = (n: number) => String(Math.round(n * 10) / 10);

/** Saves the verified G-code as .nc, to open in another G-code sender or carry to gControl on a USB stick. */
function downloadGcode(name: string, gcode: string) {
  const file = `${name.trim().replace(/[^\w\-]+/g, "-").replace(/^-|-$/g, "") || "carvcam-job"}.nc`;
  const url = URL.createObjectURL(new Blob([gcode], { type: "text/plain" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: file });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
