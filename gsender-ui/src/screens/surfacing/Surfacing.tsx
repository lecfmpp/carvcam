import { generateSurfacing, ToolSchema, type SurfacingResult } from "@gsender-next/cam-engine";
import { sienciLink } from "../../lib/referral";
import { AlertTriangle, Check, CheckCircle2, Pause, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BitSilhouette } from "../../components/BitSilhouette";
import { TopBar } from "../../components/TopBar";
import { Seg, SidePanel, Stepper, VideoCard } from "../../components/ui";
import { bitById, PRESET_TO_SPEED, type Preset } from "../../lib/catalog";
import { useMachine } from "../../machine/store";
import { openConnect, toast } from "../../state/ui";
import { useActiveMachine, useWorkshop } from "../../state/workshop";
import { ToolpathOverlay, useSegments } from "../../stage/Board";
import { Stage } from "../../stage/Stage";
import { compatBadge, Dial } from "../workshop/parts";
import "../workshop/workshop.css";
import "./surfacing.css";

type Step = "area" | "bit" | "preview" | "check";
const STEPS: Step[] = ["area", "bit", "preview", "check"];
const BIT_ID = "aplainar-22mm";
const JOB_NAME = "Surface the bed";
const PRESETS: [Preset, string, string][] = [
  ["detailed", "Detailed", "Reduced"],
  ["balanced", "Balanced", "Regular"],
  ["fast", "Fast", "Maximum"],
];

/** Assistente de aplainamento da mesa: área → fresa e profundidade → prévia → checklist → corte. */
export default function Surfacing() {
  const nav = useNavigate();
  const { machine, head, headId } = useActiveMachine();
  const { bits, markDone } = useWorkshop();
  const m = useMachine();
  const [aw, ah] = machine.area;

  const [step, setStep] = useState<Step>("area");
  const [whole, setWhole] = useState(true);
  const [w, setW] = useState(aw);
  const [h, setH] = useState(ah);
  const [depth, setDepth] = useState(0.5);
  const [preset, setPreset] = useState<Preset>(machine.preset);
  const [pro, setPro] = useState(false);
  const [bitIn, setBitIn] = useState(false);
  const [routerOn, setRouterOn] = useState(false);
  const [clear, setClear] = useState(false);
  const [started, setStarted] = useState(false);
  const [play, setPlay] = useState<{ on: boolean; t: number }>({ on: false, t: 0 });

  // Troca de máquina: volta à área inteira da nova máquina.
  useEffect(() => {
    setW(aw);
    setH(ah);
    setWhole(true);
    setPreset(machine.preset);
  }, [aw, ah, machine.preset]);

  const x0 = (aw - w) / 2;
  const y0 = (ah - h) / 2;

  const jobs = useMemo(() => {
    const out = {} as Record<Preset, SurfacingResult>;
    for (const [k] of PRESETS) out[k] = generateSurfacing({ largura: w, altura: h, profundidade: depth, sienci: { maquina: machine.id, cabecote: headId, velocidade: PRESET_TO_SPEED[k] } });
    return out;
  }, [w, h, depth, machine.id, headId]);
  const job = jobs[preset];
  const mins = (k: Preset) => Math.max(1, Math.round(jobs[k].verificacao.estatisticas.tempoEstimadoSeg / 60));
  const segs = useSegments(job.gcode);

  // Fase derivada da máquina simulada.
  const mine = started && m.job?.name === JOB_NAME;
  const phase = !mine ? "setup" : m.status === "running" || m.status === "toolchange" ? "running" : m.status === "paused" ? "paused" : m.status === "done" ? "done" : "setup";
  const progress = mine && m.job ? Math.min(1, m.elapsed / Math.max(1e-6, m.job.total)) : 0;

  useEffect(() => {
    if (phase === "done") markDone("surface");
  }, [phase, markDone]);
  // Parado pelo botão Stop (ou alarme): volta ao checklist.
  const prevStatus = useRef(m.status);
  useEffect(() => {
    if (started && (prevStatus.current === "running" || prevStatus.current === "paused") && (m.status === "idle" || m.status === "alarm")) {
      setStarted(false);
      setStep("check");
      toast("Stopped. The bit lifted and the router turned off.");
    }
    prevStatus.current = m.status;
  }, [m.status, started]);

  // "Play toolpath": 8 s para percorrer o caminho.
  useEffect(() => {
    if (!play.on) return;
    let raf = 0;
    let last = performance.now();
    const f = (t: number) => {
      const dt = (t - last) / 1000;
      last = t;
      setPlay((p) => (p.t + dt / 8 >= 1 ? { on: false, t: 0 } : { on: true, t: p.t + dt / 8 }));
      raf = requestAnimationFrame(f);
    };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [play.on]);

  const connected = m.status !== "disconnected" && m.status !== "connecting";
  const dl = job.dial;
  const rpm = job.parametros.rpm;
  const checks: Check[] = [
    connected
      ? { ok: true, label: `Connected · ${machine.family} ${machine.size}`, sub: `USB · ${m.port ?? "COM3"}` }
      : {
          ok: false,
          label: "Connect the machine",
          sub: "Turn it on and plug in the USB cable",
          fixLabel: m.status === "connecting" ? "Connecting…" : "Connect",
          fix: () => {
            m.setBed({ x: aw, y: ah, z: machine.z });
            openConnect();
          },
        },
    m.homed
      ? { ok: true, label: "Machine home found", sub: "So the bit stays inside the bed" }
      : {
          ok: false,
          label: "Find machine home",
          sub: "The machine moves to the back-right corner and stops",
          fixLabel: m.status === "homing" ? "Moving…" : "Find home",
          fix: () => (connected ? m.home() : toast("Connect the machine first.")),
        },
    bitIn
      ? { ok: true, label: "22 mm surfacing bit installed", sub: "Bit height is measured on the spoilboard" }
      : {
          ok: false,
          label: "Install the 22 mm surfacing bit",
          sub: "Lower it until it just touches the spoilboard, then set Z zero",
          fixLabel: "It's in",
          fix: () => {
            // Zero do trabalho: canto frontal esquerdo da área, Z na face da mesa.
            useMachine.setState({ workZero: { x: x0, y: y0, z: -(machine.z - 20) }, zMeasured: true });
            setBitIn(true);
          },
        },
    head.auto
      ? { ok: true, label: "Automatic speed ✓", sub: `${head.name} will run at ${rpm.toLocaleString("en-US")} RPM` }
      : routerOn
        ? { ok: true, label: `Dial on ${dl?.posicao} · router on`, sub: `${dl?.rpm.toLocaleString("en-US")} RPM on the Makita`, dial: dl?.posicao }
        : { ok: false, label: `Turn the dial to ${dl?.posicao} · ${dl?.rpm.toLocaleString("en-US")} RPM`, sub: "Then switch the Makita on. Its speed is set by hand.", dial: dl?.posicao, fixLabel: "Done", fix: () => setRouterOn(true) },
    clear
      ? { ok: true, label: "Bed clear, dust collector on", sub: "Clamps and screws removed from the area" }
      : { ok: false, label: "Clear the bed and start dust collection", sub: "Remove clamps and screws inside the dashed area", fixLabel: "Done", fix: () => setClear(true) },
  ];
  const allOk = checks.every((c) => c.ok);

  const start = () => {
    m.loadJob({ name: JOB_NAME, gcode: job.gcode, tools: [ToolSchema.parse(job.ferramenta)], board: { width: w, height: h, thickness: depth } });
    useMachine.setState({ speedup: 60 });
    setStarted(true);
    useMachine.getState().start();
  };

  // Geometria no palco.
  const si = STEPS.indexOf(step);
  const so = job.parametros.sobreposicao;
  const rows = job.linhas;
  const bitPos = (() => {
    if (phase === "done") return null;
    if (phase !== "setup") {
      const z = m.workZero ?? { x: x0, y: y0, z: 0 };
      return { x: m.pos.x, y: m.pos.y, z: m.pos.z - z.z };
    }
    if (play.on || play.t > 0) {
      const cut = segs.filter((s) => !s.rapid);
      const i = Math.min(cut.length - 1, Math.floor(play.t * cut.length));
      const s = cut[i];
      if (!s) return null;
      const f = play.t * cut.length - i;
      return { x: x0 + s.from.x + (s.to.x - s.from.x) * f, y: y0 + s.from.y + (s.to.y - s.from.y) * f, z: 5 };
    }
    return null;
  })();
  const rowIdx = bitPos ? Math.min(rows, Math.max(1, Math.round((bitPos.y - y0) / so) + 1)) : 1;

  let title = "Surface the bed";
  if (phase === "setup") title = { area: "Area", bit: "Bit and depth", preview: "Preview", check: "Before you start" }[step];
  if (phase === "running") title = "Surfacing";
  if (phase === "paused") title = "Paused";
  if (phase === "done") title = "Bed surfaced";

  const leftMin = Math.max(1, Math.round(mins(preset) * (1 - progress)));
  const myBit = bits.includes(BIT_ID);
  const bit = bitById(BIT_ID)!;

  const foot = (
    <>
      {phase === "setup" && step === "check" ? <div className="small" style={{ color: "#B9B6B0" }}>{allOk ? "Stand clear, glasses on." : "Fix the items above to start."}</div> : null}
      <div style={{ display: "flex", gap: 8 }}>
        {phase === "setup" && si > 0 ? (
          <button className="btn btn--outline" style={{ height: 52, background: "transparent" }} onClick={() => setStep(STEPS[si - 1])}>
            Back
          </button>
        ) : null}
        {phase === "setup" ? (
          step === "check" ? (
            <button className="btn btn--primary btn--lg" style={{ flex: 1 }} disabled={!allOk} onClick={start}>
              Start surfacing
            </button>
          ) : (
            <button
              className="btn btn--primary btn--lg"
              style={{ flex: 1 }}
              onClick={() => {
                setPlay({ on: false, t: 0 });
                setStep(STEPS[si + 1]);
              }}
            >
              {step === "preview" ? "Continue to checklist" : "Continue"}
            </button>
          )
        ) : null}
        {phase === "running" ? (
          <button className="btn btn--quiet btn--lg" style={{ flex: 1, border: "1px solid rgba(255,255,255,.16)" }} onClick={m.pause}>
            Pause <span className="kbd">Space</span>
          </button>
        ) : null}
        {phase === "paused" ? (
          <button className="btn btn--primary btn--lg" style={{ flex: 1 }} onClick={m.resume}>
            Resume
          </button>
        ) : null}
        {phase === "done" ? (
          <button
            className="btn btn--primary btn--lg"
            style={{ flex: 1 }}
            onClick={() => {
              useMachine.getState().reset();
              nav("/workshop");
            }}
          >
            Back to First cuts
          </button>
        ) : null}
      </div>
    </>
  );

  return (
    <div className="app">
      <div className="dotgrid" />
      <TopBar variant="tool" crumbs={["Tools", "Surface the bed"]} />
      <Stage
        noViewToggle={false}
        tools={
          phase === "setup" && step !== "check" ? (
            <button className="tool-btn" onClick={() => setPlay((p) => ({ ...p, on: !p.on }))}>
              {play.on ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
              {play.on ? "Pause preview" : "Play toolpath"}
            </button>
          ) : null
        }
        caption={phase === "setup" ? "Orange rows = where the bit sweeps" : "Live · lighter area is already flat"}
        render={({ view, zoom, size, spin }) => {
          const s = Math.min((size.w - 140) / aw, (size.h - 210) / ah);
          const px = (v: number) => v * s;
          const turned = view === "3d";
          const freshRows = phase === "done" ? h : phase === "setup" ? 0 : Math.max(0, Math.min(h, (bitPos?.y ?? y0) - y0));
          return (
            <Bed3D turned={turned} spin={spin} zoom={zoom}>
              <div className="sf-bed" style={{ width: px(aw), height: px(ah) }}>
                <div className="sf-bed__grid" />
                <div className="sf-area" style={{ left: px(x0), bottom: px(y0), width: px(w), height: px(h) }} />
                {phase === "setup" ? (
                  <div style={{ position: "absolute", left: px(x0), bottom: px(y0), width: px(w), height: px(h) }}>
                    <ToolpathOverlay segments={segs} width={w} height={h} scale={s} opacity={0.75} />
                  </div>
                ) : (
                  <div className="sf-fresh" style={{ left: px(x0), bottom: px(y0), width: px(w), height: px(freshRows) }} />
                )}
                <div className="sf-start" style={{ left: px(x0) - 7, bottom: px(y0) - 7 }} />
                <div className="sf-start-label" style={{ left: px(x0) + 12, bottom: px(y0) + 8 }}>
                  Start · front left
                </div>
                {bitPos ? (
                  <>
                    <div className="sf-bit" style={{ left: px(bitPos.x) - Math.max(14, px(22)) / 2, bottom: px(bitPos.y) - Math.max(14, px(22)) / 2, width: Math.max(14, px(22)), height: Math.max(14, px(22)) }} />
                    <div className="sf-tag" style={{ left: px(bitPos.x) + 16, bottom: px(bitPos.y) + 14 }}>
                      X {(bitPos.x - x0).toFixed(1)}  Y {(bitPos.y - y0).toFixed(1)}  Z {bitPos.z.toFixed(1)}
                    </div>
                  </>
                ) : null}
                <div className="sf-axis" style={{ left: 10, bottom: -30 }}>
                  Front of machine
                </div>
                <div className="sf-axis" style={{ right: 0, top: -30 }}>
                  {aw} × {ah} mm
                </div>
              </div>
            </Bed3D>
          );
        }}
      />

      <SidePanel
        title={title}
        headExtra={
          <span className="sidepanel__sub">{phase === "setup" ? `Step ${si + 1} of 4` : ""}</span>
        }
        foot={foot}
      >
        <div className="sf-bars" aria-hidden="true" style={{ marginTop: -8 }}>
          {STEPS.map((k, i) => (
            <span key={k} className={phase !== "setup" || i <= si ? "is-on" : ""} />
          ))}
        </div>

        {phase === "setup" && step === "area" ? (
          <>
            <div className="sf-text">Surfacing removes a thin layer from the spoilboard so the whole bed is flat and parallel to the bit. Do it once now, then whenever the bed gets worn.</div>
            <Seg<"whole" | "custom">
              label="Area"
              size="lg"
              value={whole ? "whole" : "custom"}
              onChange={(v) => {
                setWhole(v === "whole");
                if (v === "whole") {
                  setW(aw);
                  setH(ah);
                }
              }}
              options={[
                ["whole", "Whole bed"],
                ["custom", "Custom area"],
              ]}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="tiny muted" style={{ fontWeight: 500 }}>
                  Width (X)
                </span>
                <Stepper
                  label="width"
                  value={w}
                  step={50}
                  min={100}
                  max={aw}
                  unit="mm"
                  onChange={(v) => {
                    setWhole(false);
                    setW(v);
                  }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="tiny muted" style={{ fontWeight: 500 }}>
                  Depth (Y)
                </span>
                <Stepper
                  label="depth"
                  value={h}
                  step={50}
                  min={100}
                  max={ah}
                  unit="mm"
                  onChange={(v) => {
                    setWhole(false);
                    setH(v);
                  }}
                />
              </div>
            </div>
            <div className="sf-workarea">
              <span>
                {machine.family} {machine.size} work area
              </span>
              <span className="mono" style={{ color: "var(--text)", fontWeight: 500 }}>
                {aw} × {ah} mm
              </span>
            </div>
          </>
        ) : null}

        {phase === "setup" && step === "bit" ? (
          <>
            <div className="sf-bitcard">
              <BitSilhouette profile="surfacing" d={22} size={76} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ font: "600 15px var(--font)" }}>22 mm surfacing bit</span>
                <span className="mono tiny muted">Ø 22 mm · 7/8″ · shank 1/4″</span>
                {compatBadge(bit, headId)}
              </div>
            </div>
            {!myBit ? (
              <div role="status" className="sf-note" style={{ alignItems: "center", padding: 12, background: "rgba(242,193,78,.07)", border: "1px solid rgba(242,193,78,.3)", fontSize: 13 }}>
                <AlertTriangle size={16} color="var(--paused)" strokeWidth={1.75} style={{ flex: "none" }} />
                <span style={{ flex: 1 }}>This bit isn't in My bits. You can still continue if you have it.</span>
                <a href={sienciLink(bit.storeUrl, "bit_suggestion", bit.id)} target="_blank" rel="noreferrer" className="btn btn--sm" style={{ height: 32, border: "1px solid rgba(242,193,78,.45)", textDecoration: "none", color: "var(--text)" }}>
                  See in store
                </a>
              </div>
            ) : null}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", font: "500 12px var(--font)", color: "var(--text-3)" }}>
                <span>Depth to remove</span>
                <span className="mono" style={{ color: "var(--text)" }}>
                  {depth.toFixed(1)} mm
                </span>
              </div>
              <input type="range" min={0.2} max={2} step={0.1} value={depth} onChange={(e) => setDepth(+e.target.value)} aria-label="Depth to remove" style={{ width: "100%", height: 28, accentColor: "var(--text)" }} />
              <div className="tiny" style={{ color: "var(--text-4)" }}>
                0.5 mm is enough for a new spoilboard. Go deeper only if it has dents.
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div className="tiny muted" style={{ fontWeight: 500 }}>
                Speed
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
                {PRESETS.map(([k, l, t]) => (
                  <button key={k} className="sf-preset" aria-pressed={preset === k} onClick={() => setPreset(k)}>
                    <span style={{ font: "600 14px var(--font)" }}>{l}</span>
                    <span className="mono" style={{ fontSize: 13, fontWeight: 500 }}>
                      {mins(k)} min
                    </span>
                    <span style={{ font: "400 11px var(--font)", color: "var(--text-3)" }}>Sienci table: {t}</span>
                    {pro ? (
                      <span className="mono" style={{ font: "400 11px/1.3 var(--mono)", color: "var(--text-3)" }}>
                        {jobs[k].parametros.rpm.toLocaleString("en-US")} RPM · {jobs[k].parametros.avanco} mm/min
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
              <div className="tiny" style={{ color: "var(--text-4)" }}>
                Values from the official Sienci Labs speed table
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 44, font: "500 14px var(--font)", cursor: "pointer" }}>
              <span>
                Show machine numbers <span className="tiny muted">· Pro</span>
              </span>
              <input type="checkbox" checked={pro} onChange={() => setPro(!pro)} style={{ width: 20, height: 20, accentColor: "var(--text)" }} />
            </label>
          </>
        ) : null}

        {phase === "setup" && step === "preview" ? (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span className="mono" style={{ font: "500 40px/1 var(--mono)", letterSpacing: "-.02em" }}>
                {mins(preset)} min
              </span>
              <span className="muted" style={{ fontSize: 14 }}>
                estimated
              </span>
            </div>
            <div>
              {[
                ["Area", `${w} × ${h} mm`],
                ["Rows", `${rows} · ${Math.round(100 - (so / 22) * 100)}% overlap`],
                ["Depth", `${depth.toFixed(1)} mm in ${job.passadas} pass${job.passadas > 1 ? "es" : ""}`],
                ["Feed", `${job.parametros.avanco} mm/min`],
                ["Bit speed", head.auto ? `${rpm.toLocaleString("en-US")} RPM` : `Dial ${dl?.posicao} · ${dl?.rpm.toLocaleString("en-US")} RPM`],
                ["G-code", job.ok ? "Verified ✓" : "Check failed"],
              ].map(([k, v]) => (
                <div key={k} className="sf-row">
                  <span className="muted">{k}</span>
                  <span className="mono" style={{ fontWeight: 500 }}>
                    {v}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ font: "400 13px/1.45 var(--font)", color: "var(--text-3)" }}>The bit sweeps left to right in overlapping rows, moving toward the back. Play the preview on the bed to see it.</div>
          </>
        ) : null}

        {phase === "setup" && step === "check" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {checks.map((c) => (
              <CheckRow key={c.label} c={c} />
            ))}
          </div>
        ) : null}

        {phase === "running" || phase === "paused" ? (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span className="mono" style={{ font: "500 44px/1 var(--mono)", letterSpacing: "-.03em" }}>
                {Math.floor(progress * 100)}%
              </span>
              <span className="muted" style={{ fontSize: 14 }}>
                {leftMin} min left
              </span>
            </div>
            <div className="sf-bar">
              <div style={{ width: `${progress * 100}%` }} />
            </div>
            <div style={{ font: "400 14px var(--font)", color: "var(--text-2)" }}>
              Row {rowIdx} of {rows}
            </div>
            {phase === "paused" ? (
              <div className="sf-note sf-note--paused">
                <span style={{ color: "var(--paused)", fontWeight: 600 }}>Paused at {Math.floor(progress * 100)}%.</span>The bit lifted 5 mm. Resume to continue the same row.
              </div>
            ) : (
              <div style={{ font: "400 13px/1.45 var(--font)", color: "var(--text-3)" }}>Keep the dust collector running. You can pause at any time; the bit lifts and the position is kept.</div>
            )}
          </>
        ) : null}

        {phase === "done" ? (
          <>
            <div className="sf-note sf-note--done">
              <CheckCircle2 size={18} color="var(--ready-text)" strokeWidth={1.75} style={{ flex: "none", marginTop: 1 }} />
              <span>The bed is flat. Vacuum the dust and you're ready for your first carve.</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, font: "400 14px/1.45 var(--font)", color: "#D6D3CD" }}>
              <div style={{ display: "flex", gap: 10 }}>
                <span className="mono muted" style={{ width: 16, fontSize: 13 }}>
                  1
                </span>
                <span>Run a hand over the bed. It should feel smooth with faint lines.</span>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <span className="mono muted" style={{ width: 16, fontSize: 13 }}>
                  2
                </span>
                <span>Swap back to a carving bit before the next project.</span>
              </div>
            </div>
            <div className="sf-workarea" style={{ alignItems: "center", justifyContent: "flex-start", gap: 10 }}>
              <span className="sf-ok">
                <Check size={12} strokeWidth={2.5} />
              </span>
              Marked done in Start here · next up: Depth test
            </div>
          </>
        ) : null}

        <VideoCard id="surfacing" />
      </SidePanel>
    </div>
  );
}

interface Check {
  ok: boolean;
  label: string;
  sub: string;
  dial?: number;
  fixLabel?: string;
  fix?(): void;
}

function CheckRow({ c }: { c: Check }) {
  if (c.ok)
    return (
      <div className="sf-check">
        <span className="sf-ok">
          <Check size={12} strokeWidth={2.5} />
        </span>
        <span style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <span style={{ font: "500 14px var(--font)" }}>{c.label}</span>
          <span className="tiny muted">{c.sub}</span>
        </span>
        {c.dial ? <Dial size={52} on={c.dial} labelSize={10} /> : null}
      </div>
    );
  return (
    <div className="sf-check sf-check--warn">
      {c.dial ? <Dial size={52} on={c.dial} labelSize={10} /> : <AlertTriangle size={20} color="var(--paused)" strokeWidth={1.75} style={{ flex: "none" }} />}
      <span style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <span style={{ font: "500 14px var(--font)" }}>{c.label}</span>
        <span className="tiny" style={{ color: "var(--text-2)" }}>
          {c.sub}
        </span>
      </span>
      <button className="sf-fix" onClick={c.fix}>
        {c.fixLabel}
      </button>
    </div>
  );
}

/** Inclina a mesa em 3D (CSS) e dá a volta de 360° quando pedido. */
function Bed3D({ turned, spin, zoom, children }: { turned: boolean; spin: number; zoom: number; children: React.ReactNode }) {
  const [yaw, setYaw] = useState(0);
  useEffect(() => {
    if (!spin) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const startT = performance.now();
    let raf = 0;
    const f = (t: number) => {
      const s = Math.min(1, (t - startT) / 4200);
      const e = s < 0.5 ? 4 * s * s * s : 1 - Math.pow(-2 * s + 2, 3) / 2;
      setYaw(360 * e);
      if (s < 1) raf = requestAnimationFrame(f);
      else setYaw(0);
    };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [spin]);
  const tr = turned ? `rotateX(52deg) rotateZ(${-14 + yaw}deg) scale(${(0.9 * zoom).toFixed(3)})` : `scale(${zoom})`;
  return (
    <div style={{ perspective: 1800 }}>
      <div style={{ transform: tr, transformStyle: "preserve-3d", transition: yaw ? "none" : "transform 240ms cubic-bezier(.2,.8,.2,1)" }}>{children}</div>
    </div>
  );
}
