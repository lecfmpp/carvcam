import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Seg } from "../../components/ui";
import { TopBar } from "../../components/TopBar";
import { engineOptions, runEngine } from "../../engine/useEngine";
import type { SimGrid } from "../../engine/protocol";
import { BITS, bitById, compat, HEADS, machineById, MACHINES, materialById, PROJECTS, projectFits, TRACK, type HeadId, type Intent, type Machine, type Project } from "../../lib/catalog";
import { useDesign, type Design } from "../../state/design";
import { useActiveMachine, useWorkshop } from "../../state/workshop";
import { SimCanvas } from "../../stage/SimCanvas";
import { IntentChips } from "./Onboarding";
import { BitCardBody, cm } from "./parts";
import "./workshop.css";

type Tab = "first-cuts" | "bits" | "settings";

export default function Workshop({ tab }: { tab: Tab }) {
  return (
    <div className="app app--plain">
      <TopBar variant="app" />
      <main className="ws-main">{tab === "first-cuts" ? <FirstCuts /> : tab === "bits" ? <Library /> : <Settings />}</main>
    </div>
  );
}

// ---------------------------------------------------------------- First cuts

/** Projeto do catálogo no formato do editor (igual ao que `openProject` monta). */
function projectDesign(p: Project): Design {
  const m = materialById(p.material);
  return {
    name: p.title,
    projectId: p.id,
    material: m.id,
    spec: { ...structuredClone(p.spec), material: m.engine },
    bit: p.bits[0],
    bit2: p.bits[1],
    useBit2: p.bits.length > 1,
    preset: p.speed,
    tabs: { count: 4, height: Math.min(3, Math.round(p.spec.espessura * 0.35 * 10) / 10) },
  };
}

interface Preview {
  sim: SimGrid | null;
  minutes: number | null;
  board: { width: number; height: number; thickness: number } | null;
  /** Contorno da peça final (sem a sobra do bloco), para recortar a prévia. */
  piece: { x: number; y: number }[][] | null;
}

// Simulações das prévias, guardadas enquanto o app estiver aberto.
const cache = new Map<string, Preview>();
let queue: Promise<unknown> = Promise.resolve();

function previewKey(p: Project, m: Machine, head: HeadId) {
  return `${p.id}|${m.id}|${head}`;
}

/** Gera a prévia de um projeto (uma por vez, para não travar o worker). */
function loadPreview(p: Project, m: Machine, head: HeadId): Promise<Preview> {
  const key = previewKey(p, m, head);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const fits = projectFits(p, m);
  // Se não cabe, a prévia é gerada numa máquina grande só para mostrar a peça.
  const target = fits ? m : machineById("altmill-4x8");
  const tHead = fits ? head : target.defaultHead;
  const d = projectDesign(p);
  const job = queue.then(async () => {
    const w = p.spec.largura;
    const h = p.spec.altura;
    const r = await runEngine(d.spec, engineOptions(d, target.id, tHead, d.preset ?? target.preset), true, Math.max(0.5, Math.max(w, h) / 260));
    const b = r.result?.layout.bloco;
    const out: Preview = {
      sim: r.sim,
      minutes: fits && r.result?.ok ? Math.max(1, Math.round((r.result.verificacao?.estatisticas.tempoEstimadoSeg ?? 0) / 60)) : null,
      board: b ? { width: b.largura, height: b.altura, thickness: b.espessura } : null,
      piece: r.result?.layout.peca ?? null,
    };
    cache.set(key, out);
    return out;
  });
  queue = job.catch(() => undefined);
  return job;
}

function bounds(r: { x: number; y: number }[][]) {
  const pts = r.flat();
  return { minX: Math.min(...pts.map((p) => p.x)), minY: Math.min(...pts.map((p) => p.y)), maxX: Math.max(...pts.map((p) => p.x)), maxY: Math.max(...pts.map((p) => p.y)) };
}

function fitNames(p: Project) {
  const f = MACHINES.filter((m) => projectFits(p, m));
  const lm = [...new Set(f.filter((m) => m.family !== "AltMill").map((m) => m.size))];
  const alt = f.some((m) => m.family === "AltMill");
  return "Needs a " + [...lm, ...(alt ? ["AltMill"] : [])].join(" or ");
}

const short = (m: Machine) => `${m.family.replace("LongMill ", "")} ${m.size}`;

function FirstCuts() {
  const nav = useNavigate();
  const { machine } = useActiveMachine();
  const trackDone = useWorkshop((s) => s.trackDone);
  const openProject = useDesign((s) => s.openProject);
  const newBlank = useDesign((s) => s.newBlank);

  const make = (id: string) => {
    openProject(id);
    nav("/create");
  };
  const cur = TRACK.findIndex((t) => !trackDone.includes(t.id));
  const doneN = TRACK.filter((t) => trackDone.includes(t.id)).length;

  return (
    <div className="ws-page ws-page--wide" style={{ gap: 28 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20 }}>
        <div className="ws-head">
          <h1 className="ws-title ws-title--sm">First cuts</h1>
          <p className="ws-lead ws-lead--sm">Ready-made projects for your {short(machine)}. Each opens fully set up, and you can change anything.</p>
        </div>
        <button
          className="link"
          style={{ fontSize: 14, color: "var(--text-2)", whiteSpace: "nowrap" }}
          onClick={() => {
            newBlank();
            nav("/create");
          }}
        >
          Start from a blank board
        </button>
      </div>

      <section aria-label="Start here" className="ws-track">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ font: "600 16px var(--font)" }}>Start here</span>
          <span className="small muted">
            {doneN} of {TRACK.length} done
          </span>
        </div>
        <ol>
          {TRACK.map((t, i) => {
            const d = trackDone.includes(t.id);
            const on = i === cur;
            return (
              <li key={t.id} style={{ display: "flex" }}>
                <button className={`ws-track-item ${d ? "is-done" : ""} ${on ? "is-on" : ""}`} onClick={() => (t.id === "surface" ? nav("/surfacing") : make(t.id))}>
                  <span className="ws-track-dot">{d ? "✓" : i + 1}</span>
                  <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2, textAlign: "left" }}>
                    <span style={{ font: "500 14px var(--font)" }}>{t.title}</span>
                    <span className="tiny muted">{d ? "Done" : on ? (t.sub ?? "Next up") : "Later"}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="ws-projects">
        {PROJECTS.map((p) => (
          <ProjectCard key={p.id} project={p} onMake={() => make(p.id)} />
        ))}
      </div>
    </div>
  );
}

function ProjectCard({ project: p, onMake }: { project: Project; onMake(): void }) {
  const { machine, headId } = useActiveMachine();
  const myBits = useWorkshop((s) => s.bits);
  const ok = projectFits(p, machine);
  const [pv, setPv] = useState<Preview | null>(() => cache.get(previewKey(p, machine, headId)) ?? null);

  useEffect(() => {
    let alive = true;
    setPv(cache.get(previewKey(p, machine, headId)) ?? null);
    loadPreview(p, machine, headId).then((r) => alive && setPv(r));
    return () => {
      alive = false;
    };
  }, [p, machine, headId]);

  const levelCls = p.level === "First cut" ? "ws-level--first" : p.level === "Easy" ? "ws-level--easy" : "";
  const mat = materialById(p.material);
  const box = { w: 260, h: 120 };

  return (
    <article className="ws-proj">
      <div className={`ws-proj-pv ${ok ? "" : "is-dim"}`}>
        {pv?.sim && pv.board ? (
          (() => {
            // Enquadra só a peça (o bloco tem 10 mm de sobra quando há recorte).
            const bb = pv.piece?.length ? bounds(pv.piece) : { minX: 0, minY: 0, maxX: pv.board.width, maxY: pv.board.height };
            const s = Math.min(box.w / (bb.maxX - bb.minX), box.h / (bb.maxY - bb.minY));
            const H = pv.board.height;
            const clip = pv.piece?.length
              ? `path(evenodd, '${pv.piece.map((ring) => "M" + ring.map((q) => `${((q.x - bb.minX) * s).toFixed(1)} ${((bb.maxY - q.y) * s).toFixed(1)}`).join("L") + "Z").join("")}')`
              : undefined;
            return (
              <div style={{ filter: "drop-shadow(0 16px 24px rgba(0,0,0,.45))" }}>
                <div style={{ position: "relative", width: (bb.maxX - bb.minX) * s, height: (bb.maxY - bb.minY) * s, overflow: "hidden", clipPath: clip }}>
                  <div style={{ position: "absolute", left: -bb.minX * s, top: -(H - bb.maxY) * s, width: pv.board.width * s, height: H * s }}>
                    <SimCanvas sim={pv.sim} thickness={pv.board.thickness} material={mat} scale={s} board={{ width: pv.board.width, height: H }} />
                  </div>
                </div>
              </div>
            );
          })()
        ) : (
          <div className="ws-skel" style={{ width: Math.min(box.w, (p.spec.largura / p.spec.altura) * box.h), height: Math.min(box.h, (p.spec.altura / p.spec.largura) * box.w) }} aria-label="Preparing preview" />
        )}
        {!ok ? <span className="ws-needs">{fitNames(p)}</span> : null}
      </div>
      <div className="ws-proj-body">
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className={`ws-level ${levelCls}`}>{p.level}</span>
          {ok ? (
            <span style={{ font: "400 13px var(--mono)", color: "var(--text-2)" }}>
              {pv?.minutes != null ? `≈ ${pv.minutes} min on your ${short(machine)}` : `≈ … min on your ${short(machine)}`}
            </span>
          ) : null}
        </div>
        <div className="ws-proj-title">{p.title}</div>
        <div className="ws-proj-learn">You learn: {p.learn}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {p.bits.map((id) => {
            const b = bitById(id)!;
            const has = myBits.includes(id);
            const c = compat(b, headId);
            const need = has && c.level === "accessory";
            const color = !has ? "var(--alarm-text)" : need ? "var(--paused)" : "var(--ready-text)";
            return (
              <div key={id} className="ws-bitline" style={{ color }}>
                <span style={{ width: 16, font: "600 13px var(--font)" }}>{!has ? "✗" : need ? "!" : "✓"}</span>
                {b.name}
                {!has ? " · you don't have it" : need ? ` · ${c.label.toLowerCase()}` : ""}
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: "auto", paddingTop: 6 }}>
          {ok ? (
            <button className="ws-make" onClick={onMake}>
              Make this project
            </button>
          ) : (
            <button className="ws-make" disabled aria-disabled="true">
              Too big for your machine
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------- My bits

function Library() {
  const { head, headId } = useActiveMachine();
  const { bits, toggleBit } = useWorkshop();
  const [tab, setTab] = useState<"mine" | "all">("mine");
  const [intent, setIntent] = useState<Intent | null>(null);
  const filtered = BITS.filter((b) => !intent || b.uses.includes(intent));
  const list = tab === "mine" ? filtered.filter((b) => bits.includes(b.id)) : filtered;

  return (
    <div className="ws-page ws-page--wide" style={{ gap: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20 }}>
        <div className="ws-head">
          <h1 className="ws-title ws-title--sm">Bits</h1>
          <p className="ws-lead ws-lead--sm">Badges are checked against your {head.name}.</p>
        </div>
        <div role="tablist" className="ws-tabs">
          {(
            [
              ["mine", `My bits · ${bits.length}`],
              ["all", `All Sienci bits · ${BITS.length}`],
            ] as const
          ).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} className="ws-tab" onClick={() => setTab(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <IntentChips value={intent} onChange={setIntent} />
      {list.length === 0 ? (
        <div style={{ padding: 24, borderRadius: 14, border: "1px dashed rgba(255,255,255,.16)", font: "400 14px var(--font)", color: "var(--text-3)" }}>No bits here yet. Switch to All Sienci bits and add the ones you have.</div>
      ) : null}
      <div className="ws-grid4">
        {list.map((b) => {
          const on = bits.includes(b.id);
          return (
            <div key={b.id} className={`ws-card ws-bit ${on ? "is-on" : ""}`}>
              <BitCardBody bit={b} head={headId} corner={on ? <span className="ws-inmine">In my bits</span> : null} />
              <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
                <button className="btn btn--outline" style={{ flex: 1, height: 40, font: "500 13px var(--font)", background: "transparent" }} onClick={() => toggleBit(b.id)}>
                  {on ? "Remove from my bits" : "Add to my bits"}
                </button>
                <a className="btn btn--quiet" style={{ height: 40, padding: "0 12px", font: "500 13px var(--font)", textDecoration: "none", color: "#D6D3CD" }} href={b.storeUrl} target="_blank" rel="noreferrer">
                  See in store
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Settings

function Settings() {
  const nav = useNavigate();
  const { machine, head, headId } = useActiveMachine();
  const { machines, active, setHead, removeMachine } = useWorkshop();
  const rows = [
    { k: "Machine", v: `${machine.family} ${machine.size}` },
    { k: "Work area", v: `${machine.area[0]} × ${machine.area[1]} mm · Z ${machine.z} mm` },
    { k: "Max speed", v: `${machine.maxSpeed.toLocaleString("en-US")} mm/min` },
    { k: "Spins the bit", v: `${head.name} · ${head.auto ? "automatic speed" : "dial by hand"}` },
    { k: "Controller", v: machine.controller },
  ];
  return (
    <div className="ws-page ws-page--narrow" style={{ paddingTop: 36, gap: 20 }}>
      <div className="ws-head" style={{ gap: 6 }}>
        <div className="ws-kicker">Settings</div>
        <h1 className="ws-title ws-title--sm">My machine</h1>
      </div>
      <div className="ws-panel" style={{ overflow: "hidden" }}>
        {rows.map((r) => (
          <div key={r.k} className="ws-row">
            <span className="ws-row-k">{r.k}</span>
            <span className="ws-row-v">{r.v}</span>
          </div>
        ))}
      </div>
      <div style={{ font: "400 13px var(--font)", color: "var(--text-4)" }}>
        These values come from the machine profile ({cm(machine.area)}) and can't be edited here. Firmware settings live in Settings → Advanced.
      </div>
      {machine.heads.length > 1 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="field-label" style={{ margin: 0 }}>
            What spins the bit
          </span>
          <Seg<HeadId> label="What spins the bit" size="lg" value={headId} onChange={setHead} options={machine.heads.map((h) => [h, HEADS[h].name] as [HeadId, string])} />
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 10 }}>
        <button className="ws-btn ws-btn--ghost" style={{ height: 48, background: "rgba(255,255,255,.06)", borderColor: "rgba(255,255,255,.18)" }} onClick={() => nav("/workshop/onboarding")}>
          Change machine
        </button>
        {machines.length > 1 ? (
          <button className="ws-btn ws-btn--ghost" style={{ height: 48, color: "var(--alarm-text)" }} onClick={() => removeMachine(active)}>
            Remove this machine
          </button>
        ) : null}
      </div>
    </div>
  );
}
