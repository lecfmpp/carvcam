import { usePanelMode } from "../../lib/panel";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Seg } from "../../components/ui";
import { ArrowUpRight } from "lucide-react";
import { BitCard } from "../../components/BitCard";
import { MachineCard } from "../../components/MachineCard";
import { affiliateConfigured, sienciLink } from "../../lib/referral";
import { bitImage, STORE_BITS, STORE_CATEGORY_URL } from "../../lib/storeBits";
import { TopBar } from "../../components/TopBar";
import { engineOptions, runEngine } from "../../engine/useEngine";
import type { SimGrid } from "../../engine/protocol";
import { BITS, bitById, compat, HEADS, machineById, MACHINES, materialById, PROJECTS, projectFits, TRACK, type Bit, type HeadId, type Intent, type Machine, type Project } from "../../lib/catalog";
import { defaultTabs, useDesign, type Design } from "../../state/design";
import { useActiveMachine, useWorkshop } from "../../state/workshop";
import { SimCanvas } from "../../stage/SimCanvas";
import { IntentChips } from "./Onboarding";
import { BitCardBody, cm } from "./parts";
import { AccountSetting } from "../../account/AccountChip";
import { Projects } from "./Projects";
import "./workshop.css";

type Tab = "first-cuts" | "projects" | "bits" | "settings";

export default function Workshop({ tab }: { tab: Tab }) {
  return (
    <div className="app app--plain">
      <TopBar variant="app" />
      <main className="ws-main">{tab === "first-cuts" ? <FirstCuts /> : tab === "projects" ? <Projects /> : tab === "bits" ? <Library /> : <Settings />}</main>
    </div>
  );
}

// ---------------------------------------------------------------- First cuts

/** Catalog project in the editor's format (same as what `openProject` builds). */
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
    tabs: defaultTabs(p.spec.thickness),
  };
}

interface Preview {
  sim: SimGrid | null;
  minutes: number | null;
  board: { width: number; height: number; thickness: number } | null;
  /** Outline of the finished part (without the stock margin), to clip the preview. */
  piece: { x: number; y: number }[][] | null;
}

// Preview simulations, cached while the app is open.
const cache = new Map<string, Preview>();
let queue: Promise<unknown> = Promise.resolve();

function previewKey(p: Project, m: Machine, head: HeadId) {
  return `${p.id}|${m.id}|${head}`;
}

/** Generates a project's preview (one at a time, so the worker doesn't stall). */
function loadPreview(p: Project, m: Machine, head: HeadId): Promise<Preview> {
  const key = previewKey(p, m, head);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const fits = projectFits(p, m);
  // If it doesn't fit, the preview is generated on a large machine just to show the part.
  const target = fits ? m : machineById("altmill-4x8");
  const tHead = fits ? head : target.defaultHead;
  const d = projectDesign(p);
  const job = queue.then(async () => {
    const w = p.spec.width;
    const h = p.spec.height;
    const r = await runEngine(d.spec, engineOptions(d, target.id, tHead, d.preset ?? target.preset), true, Math.max(0.5, Math.max(w, h) / 260));
    const b = r.result?.layout.stock;
    const out: Preview = {
      sim: r.sim,
      minutes: fits && r.result?.ok ? Math.max(1, Math.round((r.result.verification?.stats.estimatedTimeSec ?? 0) / 60)) : null,
      board: b ? { width: b.width, height: b.height, thickness: b.thickness } : null,
      piece: r.result?.layout.part ?? null,
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
            // Frame only the part (the stock has a 10 mm margin when there's a cutout).
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
          <div className="ws-skel" style={{ width: Math.min(box.w, (p.spec.width / p.spec.height) * box.h), height: Math.min(box.h, (p.spec.height / p.spec.width) * box.w) }} aria-label="Preparing preview" />
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
  const [tab, setTabRaw] = useState<"mine" | "all">("mine");
  // Bits removed while looking at My bits stay on screen (dimmed, with "Add back") until the tab changes,
  // so a card never vanishes from under the pointer.
  const [kept, setKept] = useState<string[]>([]);
  const setTab = (t: "mine" | "all") => {
    setTabRaw(t);
    setKept([]);
  };
  const [intent, setIntent] = useState<Intent | null>(null);
  const filtered = BITS.filter((b) => !intent || b.uses.includes(intent));
  const list = tab === "mine" ? filtered.filter((b) => bits.includes(b.id) || kept.includes(b.id)) : filtered;

  return (
    <div className="ws-page ws-page--wide" style={{ gap: 24 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
        <div className="ws-head">
          <h1 className="ws-title ws-title--sm">Bits</h1>
          <p className="ws-lead ws-lead--sm">Mark the bits you own so CarvCAM only suggests those. Fit is checked against your {head.name}.</p>
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

      <section className="bsection" aria-label="Bits CarvCAM works with">
        <div className="bsection__head">
          <h2 className="bsection__title">{tab === "mine" ? "In my workshop" : "Works with CarvCAM"}</h2>
          <span className="bsection__note">Speeds and feeds come from the Sienci table for each of these.</span>
        </div>
        {list.length === 0 ? (
          <div style={{ padding: 24, borderRadius: 14, border: "1px dashed rgba(255,255,255,.16)", font: "400 14px var(--font)", color: "var(--text-3)" }}>
            No bits here yet. Switch to All Sienci bits and mark the ones you have.
          </div>
        ) : null}
        <div className="bgrid">
          {list.map((b) => {
            const c = compat(b, headId);
            return (
              <BitCard
                key={b.id}
                bit={{ id: b.id, name: b.name, kind: bitKind(b), profile: b.profile, d: b.d, shank: b.shank, cut: b.cut, flutes: b.flutes, use: b.use, url: b.storeUrl, image: bitImage(b.id) }}
                placement="bit_library"
                compat={{ level: c.level, label: c.level === "fits" ? `Fits your ${head.name}` : c.label }}
                owned={bits.includes(b.id)}
                removed={tab === "mine" && !bits.includes(b.id)}
                onToggle={() => {
                  if (tab === "mine" && bits.includes(b.id) && !kept.includes(b.id)) setKept([...kept, b.id]);
                  toggleBit(b.id);
                }}
              />
            );
          })}
        </div>
      </section>

      {tab === "all" ? (
        <section className="bsection" aria-label="More from the Sienci store">
          <div className="bsection__head">
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <h2 className="bsection__title">More from the Sienci store</h2>
              <span className="bsection__note">3D carving, bowls, coated bits. CarvCAM doesn't plan toolpaths for these yet.</span>
            </div>
            <a className="bsection__all" href={sienciLink(STORE_CATEGORY_URL, "store_bits", "all-bits")} target="_blank" rel="noreferrer">
              Browse all bits <ArrowUpRight size={14} />
            </a>
          </div>
          <div className="bgrid">
            {STORE_BITS.map((b) => (
              <BitCard key={b.id} bit={b} placement="store_bits" />
            ))}
          </div>
        </section>
      ) : null}

      <p className="bdisclosure">
        {affiliateConfigured
          ? "Links to sienci.com carry a CarvCAM referral code. Sienci Labs may pay CarvCAM a commission on purchases, at no extra cost to you."
          : "Links to sienci.com tell Sienci Labs you came from CarvCAM."}
      </p>
    </div>
  );
}

/** Bit type on one line, for the card. */
function bitKind(b: Bit) {
  if (b.profile === "v") return `V-bit · ${b.angle ?? 60}°`;
  if (b.profile === "ball") return "Ball nose · upcut";
  if (b.profile === "compression") return "Compression";
  if (b.profile === "surfacing") return "Surfacing";
  return `Flat · ${b.flute}`;
}

// ---------------------------------------------------------------- Settings

function Settings() {
  const nav = useNavigate();
  const { machine, head, headId } = useActiveMachine();
  const { machines, active, setHead, removeMachine } = useWorkshop();
  const rows = [
    { k: "Spins the bit", v: `${head.name} · ${head.auto ? "automatic speed" : "dial by hand"}` },
    { k: "Profile travel", v: `${machine.area[0]} × ${machine.area[1]} mm · Z ${machine.z} mm` },
    { k: "Profile max speed", v: `${machine.maxSpeed.toLocaleString("en-US")} mm/min` },
  ];
  return (
    <div className="ws-page ws-page--narrow" style={{ paddingTop: 36, gap: 20 }}>
      <div className="ws-head" style={{ gap: 6 }}>
        <div className="ws-kicker">Settings</div>
        <h1 className="ws-title ws-title--sm">My machine</h1>
      </div>
      <MachineCard id={machine.id} wide placement="machine_settings" />
      <div className="ws-panel" style={{ overflow: "hidden" }}>
        {rows.map((r) => (
          <div key={r.k} className="ws-row">
            <span className="ws-row-k">{r.k}</span>
            <span className="ws-row-v">{r.v}</span>
          </div>
        ))}
      </div>
      <div style={{ font: "400 13px var(--font)", color: "var(--text-4)" }}>
        CarvCAM checks every project against the travel in the machine profile ({cm(machine.area)}). Firmware settings live in Settings → Advanced.
      </div>
      {machine.heads.length > 1 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="field-label" style={{ margin: 0 }}>
            What spins the bit
          </span>
          <Seg<HeadId> label="What spins the bit" size="lg" value={headId} onChange={setHead} options={machine.heads.map((h) => [h, HEADS[h].name] as [HeadId, string])} />
        </div>
      ) : null}
      <PanelSetting />
      <AccountSetting />
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

/** Panel mode for the gControl touchscreen. */
function PanelSetting() {
  const { panel, setPanel } = useWorkshop();
  const on = usePanelMode();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span className="field-label" style={{ margin: 0 }}>
        Touch panel mode (gControl)
      </span>
      <Seg<"auto" | "on" | "off">
        label="Touch panel mode"
        size="lg"
        value={panel}
        onChange={setPanel}
        options={[
          ["auto", "Automatic"],
          ["on", "Always on"],
          ["off", "Off"],
        ]}
      />
      <div style={{ font: "400 13px var(--font)", color: "var(--text-4)" }}>
        Bigger buttons for a touch screen next to the machine, a lighter preview for the gControl's processor, and a full-screen button. Automatic turns on when
        the main screen is touch. Now: {on ? "on" : "off"}.
      </div>
    </div>
  );
}
