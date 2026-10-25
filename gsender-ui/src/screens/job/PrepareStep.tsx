import type { CutParams } from "@gsender-next/cam-engine";
import { AlertTriangle, Check, Download, Pause, Play, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Issue, SidePanel, Stepper, VideoCard } from "../../components/ui";
import { engineOptions, runEngine } from "../../engine/useEngine";
import { BITS, bitById, machineName, materialById, PRESET_LABEL, type Preset } from "../../lib/catalog";
import { useDesign } from "../../state/design";
import { useWorkshop } from "../../state/workshop";
import { Board, ToolpathOverlay, useSegments } from "../../stage/Board";
import { fitScale, Stage } from "../../stage/Stage";
import { ThreeView } from "../../stage/ThreeView";
import type { JobCtx } from "./Job";
import { bitNameFor, fmtMin, PRESETS, rpmText } from "./jobUtil";

const HINT: Record<Preset, string> = {
  fast: "Shorter job; edges may need a bit more sanding.",
  balanced: "Good finish and reasonable time. Best for most signs.",
  detailed: "Slower, cleaner edges and crisper small letters.",
};

/** Tempo e parâmetros de cada velocidade (as que não estão selecionadas rodam sem simulação). */
function usePresetTimes(ctx: JobCtx) {
  const { design, machine, headId, preset, result } = ctx;
  const [other, setOther] = useState<Partial<Record<Preset, { sec: number; params: CutParams }>>>({});
  const key = JSON.stringify([design.spec, design.bit, design.bit2, design.useBit2, design.tabs, machine.id, headId]);
  useEffect(() => {
    let alive = true;
    setOther({});
    for (const p of PRESETS) {
      runEngine(design.spec, engineOptions(design, machine.id, headId, p), false).then((r) => {
        if (!alive || !r.result?.verificacao) return;
        const v = r.result.verificacao;
        setOther((o) => ({ ...o, [p]: { sec: v.estatisticas.tempoEstimadoSeg, params: r.result!.parametros.principal } }));
      });
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const cur = result?.verificacao ? { sec: result.verificacao.estatisticas.tempoEstimadoSeg, params: result.parametros.principal } : undefined;
  return { ...other, ...(cur ? { [preset]: cur } : {}) } as Partial<Record<Preset, { sec: number; params: CutParams }>>;
}

export function PrepareStep({ ctx }: { ctx: JobCtx }) {
  const nav = useNavigate();
  const { design, result, sim, machine, preset, groups } = ctx;
  const patch = useDesign((s) => s.patch);
  const mode = useWorkshop((s) => s.mode);
  const ownBits = useWorkshop((s) => s.bits);
  const times = usePresetTimes(ctx);
  const segs = useSegments(result?.gcode);
  const [playing, setPlaying] = useState(false);
  const [played, setPlayed] = useState(1);

  // "Play toolpath": desenha o percurso em ~9 s.
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

  // Segunda fresa: a mais fina grava os detalhes, a outra faz o resto.
  const second = useMemo(() => {
    const main = bitById(design.bit);
    if (!main) return null;
    const hasDetail = [...(design.spec.texto ?? []), ...(design.spec.icones ?? []), ...(design.spec.formas ?? [])].some((e) => (e.modo ?? "relevo") !== "recorte");
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

  const b = result?.layout.bloco;
  const errors = result?.avisos.filter((a) => a.severidade === "erro") ?? [];
  const verified = !!result?.verificacao?.ok && errors.length === 0;
  const compression = result?.avisos.find((a) => a.codigo === "COMPRESSAO_PASSADA");
  const totalSec = result?.verificacao?.estatisticas.tempoEstimadoSeg ?? 0;
  const p = result?.parametros.principal;
  const tools = new Set(groups.map((g) => g.tool));
  const maxTabH = Math.max(0.5, Math.min(5, (design.spec.espessura ?? 6) - 1));

  return (
    <>
      <Stage
        caption="Toolpath preview · orange is where the bit goes"
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
          const s = fitScale(api.size, b.largura, b.altura);
          const mat = materialById(design.material);
          if (api.view === "3d" && sim) return <ThreeView sim={sim} thickness={b.espessura} material={mat} board={{ width: b.largura, height: b.altura }} zoom={api.zoom} spin={api.spin} size={api.size} />;
          return (
            <Board width={b.largura} height={b.altura} scale={s} zoom={api.zoom} label={`Board ${fmtN(b.largura)} × ${fmtN(b.altura)} mm`}>
              <div className={`job-face ${mat.grain ? "job-face--grain" : ""}`} style={{ background: mat.face }} />
              <ToolpathOverlay segments={segs} width={b.largura} height={b.altura} scale={s} played={played} opacity={0.75} />
            </Board>
          );
        }}
      />
      <SidePanel
        title="Prepare"
        sub={design.name}
        foot={
          <>
            <div className="sidepanel__hint">{errors.length ? "Fix the errors in Create to continue." : `Everything below is checked for your ${machineName(machine)}.`}</div>
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
        {errors.map((a, i) => (
          <Issue key={i} kind="error" eyebrow="Error · blocks continue" title={a.mensagem} body={a.sugestao} actions={<button className="btn btn--light btn--sm" onClick={() => nav("/create")}>Back to Create</button>} />
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
                      {rpmText(t.params.rpm)} · {t.params.avanco} mm/min · plunge {t.params.mergulho} · pass {t.params.passada} mm
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
              <span className="job-info__tag">Info</span>Compression bit: pass depth raised to {p?.passada} mm so both edges come out clean.
            </div>
          ) : null}
        </section>

        {ctx.hasProfile ? (
          <section className="job-sec">
            <div className="job-label">Holding tabs</div>
            <div className="job-grid2">
              <label className="job-mini">
                How many
                <Stepper label="tabs" value={design.tabs.count} min={0} max={8} onChange={(v) => patch({ tabs: { ...design.tabs, count: v } })} />
              </label>
              <label className="job-mini">
                Height
                <Stepper label="tab height" value={design.tabs.height} unit="mm" step={0.5} min={0.5} max={maxTabH} onChange={(v) => patch({ tabs: { ...design.tabs, height: v } })} />
              </label>
            </div>
            {design.tabs.count === 0 ? (
              <div role="status" className="job-warn">
                <AlertTriangle size={16} color="var(--paused)" strokeWidth={1.75} />
                <span>
                  <b>Warning:</b> without tabs the piece comes loose at the end. Hold it with double-sided tape.
                </span>
              </div>
            ) : (
              <div className="job-note">Tabs keep the piece attached to the board until the end. You cut them off afterwards.</div>
            )}
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
          {ctx.result?.ajustesManuais.map((a) => (
            <div key={a.ferramenta} className="job-row">
              <span>Makita dial for {bitNameFor(design, a.ferramenta)}</span>
              <span className="mono">
                {a.dial} · {rpmText(a.rpm)}
              </span>
            </div>
          ))}
          {b ? (
            <div className="job-row">
              <span>Board needed</span>
              <span className="mono" style={{ color: "var(--text)" }}>
                {fmtN(b.largura)} × {fmtN(b.altura)} × {fmtN(b.espessura)} mm
              </span>
            </div>
          ) : null}
          {mode === "pro" && p ? (
            <div className="job-fine mono">
              {rpmText(p.rpm)} · feed {p.avanco} mm/min · plunge {p.mergulho} mm/min · pass {p.passada} mm · stepover {p.sobreposicao} mm
            </div>
          ) : null}
          {result?.verificacao ? (
            <div className="job-fine mono">
              {result.verificacao.estatisticas.linhas.toLocaleString("en-US")} lines · inside travel · no rapid moves into stock
            </div>
          ) : null}
        </section>

        <VideoCard id="prepare" />
      </SidePanel>
    </>
  );
}

const fmtN = (n: number) => String(Math.round(n * 10) / 10);

/** Salva o G-code verificado como .nc, para abrir no gSender atual ou levar num pendrive até o gControl. */
function downloadGcode(name: string, gcode: string) {
  const file = `${name.trim().replace(/[^\w\-]+/g, "-").replace(/^-|-$/g, "") || "gsender-job"}.nc`;
  const url = URL.createObjectURL(new Blob([gcode], { type: "text/plain" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: file });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
