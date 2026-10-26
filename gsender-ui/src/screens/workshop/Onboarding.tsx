import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { sienciLink } from "../../lib/referral";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MachineCard } from "../../components/MachineCard";
import { TopBar } from "../../components/TopBar";
import { MACHINE_GROUPS } from "../../lib/machineInfo";
import { BITS, HEADS, INTENTS, KIT, MACHINES, machineById, type HeadId, type Intent, type MachineId } from "../../lib/catalog";
import { detectGsenderProfile } from "../../lib/gsenderProfile";
import { toast } from "../../state/ui";
import { useWorkshop } from "../../state/workshop";
import { BitCardBody, cm, Dial } from "./parts";
import "./workshop.css";

type View = "machine" | "head" | "bits" | "ready";
const STEPS: [View, string][] = [
  ["machine", "Machine"],
  ["head", "Router"],
  ["bits", "Bits"],
];

/** Primeiro uso: máquina → o que gira a fresa → fresas → pronto. `?add=1` acrescenta outra máquina. */
export default function Onboarding() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const adding = params.get("add") === "1";
  const ws = useWorkshop();
  const detected = useMemo(() => (adding ? null : detectGsenderProfile()), [adding]);

  const [view, setView] = useState<View>("machine");
  const [showOlder, setShowOlder] = useState(false);
  const [machineId, setMachineId] = useState<MachineId | null>(null);
  const [head, setHead] = useState<HeadId | null>(null);
  const [bits, setBits] = useState<string[]>(ws.onboarded ? ws.bits : []);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [showDetected, setShowDetected] = useState(true);

  const M = machineId ? machineById(machineId) : null;
  const H = head ? HEADS[head] : null;
  const obi = STEPS.findIndex(([v]) => v === view);
  const kitOn = KIT.every((k) => bits.includes(k));

  const pickMachine = (id: MachineId) => {
    const m = machineById(id);
    setMachineId(id);
    setHead((h) => (h && m.heads.includes(h) ? h : m.defaultHead));
  };

  const finish = (mId = machineId, hId = head) => {
    if (!mId || !hId) return;
    if (adding) {
      ws.addMachine(mId, hId);
      ws.setBits(bits);
    } else if (ws.onboarded) {
      // Trocar a máquina ativa (Settings › Change machine).
      useWorkshop.setState({ machines: ws.machines.map((m, i) => (i === ws.active ? { id: mId, head: hId } : m)), bits });
    } else ws.finishOnboarding(mId, hId, bits);
    setView("ready");
  };

  const skip = () => {
    if (!ws.onboarded && !machineId) {
      const def = machineById("longmill-mk3-30x30");
      ws.finishOnboarding(def.id, def.defaultHead, KIT.slice());
    } else if (machineId && head) finish();
    else ws.skipOnboarding();
    nav("/workshop");
  };

  const canNext = view === "machine" ? !!machineId : view === "head" ? !!head : view === "bits";
  const next = () => (view === "bits" ? finish() : setView(STEPS[obi + 1][0]));
  const footHint = view === "machine" ? (M ? `${M.family} ${M.size} · ${cm(M.area)}` : "Pick your machine to continue") : view === "head" ? (H?.name ?? "") : `${bits.length} bits selected`;
  const toggleBit = (id: string) => setBits((b) => (b.includes(id) ? b.filter((x) => x !== id) : [...b, id]));
  const filtered = BITS.filter((b) => !intent || b.uses.includes(intent));

  return (
    <div className="app app--plain">
      <TopBar
        variant="onboarding"
        center={
          view !== "ready" ? (
            <nav aria-label="Setup steps" className="ws-obsteps">
              {STEPS.map(([v, l], i) => (
                <div key={v} className={`ws-obstep ${i < obi ? "is-done" : ""} ${i === obi ? "is-on" : ""}`} aria-current={i === obi ? "step" : undefined}>
                  <span className="ws-obdot">{i < obi ? "✓" : i + 1}</span>
                  {l}
                </div>
              ))}
            </nav>
          ) : null
        }
        right={
          view !== "ready" ? (
            <button className="btn btn--sm" style={{ height: 40, background: "transparent", border: 0, color: "var(--text-3)" }} onClick={skip}>
              Set up later
            </button>
          ) : null
        }
      />

      <main className="ws-main">
        {view === "machine" ? (
          <div className="ws-page ws-page--mid">
            <div className="ws-head">
              <div className="ws-kicker">Your workshop · 1 of 3</div>
              <h1 className="ws-title">Which machine do you have?</h1>
              <p className="ws-lead">We use it to draw the real bed, choose safe speeds and check that every project fits.</p>
            </div>
            {detected && showDetected && !machineId ? (
              <div className="ws-detected">
                <CheckCircle2 size={20} color="var(--ready-text)" strokeWidth={1.75} />
                <span style={{ flex: 1, font: "400 15px/1.4 var(--font)" }}>
                  We found a <b style={{ fontWeight: 600 }}>{machineById(detected.machine).family} {machineById(detected.machine).size}</b> in your gSender profile. Is that it?
                </span>
                <button
                  className="btn btn--light"
                  style={{ fontSize: 14 }}
                  onClick={() => {
                    pickMachine(detected.machine);
                    if (detected.head) setHead(detected.head);
                    setShowDetected(false);
                  }}
                >
                  Yes, that's it
                </button>
                <button className="btn btn--outline" style={{ fontSize: 14, fontWeight: 500 }} onClick={() => setShowDetected(false)}>
                  Choose another
                </button>
              </div>
            ) : null}
            {MACHINE_GROUPS.map((g) => {
              const open = !g.collapsed || showOlder || g.ids.includes(machineId as MachineId);
              return (
                <section key={g.title} className="mgroup" aria-label={g.title}>
                  <div className="mgroup__head">
                    <h2 className="mgroup__title">{g.title}</h2>
                    <span className="mgroup__note">{g.note}</span>
                  </div>
                  {open ? (
                    <div className="mgrid" role="radiogroup" aria-label={g.title}>
                      {g.ids.map((id) => (
                        <MachineCard
                          key={id}
                          id={id}
                          placement="onboarding"
                          selected={machineId === id}
                          onSelect={() => {
                            pickMachine(id);
                            setShowDetected(false);
                          }}
                        />
                      ))}
                    </div>
                  ) : (
                    <button className="mgroup__toggle" onClick={() => setShowOlder(true)}>
                      I have a {g.title} ({g.ids.map((id) => MACHINES.find((m) => m.id === id)!.size).join(", ")})
                    </button>
                  )}
                </section>
              );
            })}
            <button className="ws-quiet-link" onClick={() => toast("Generic GRBL machines skip the profile. You will enter the bed size in Settings → Advanced.", 3200)}>
              Other machine (generic GRBL)
            </button>
          </div>
        ) : null}

        {view === "head" && M ? (
          <div className="ws-page ws-page--mid">
            <div className="ws-head">
              <div className="ws-kicker">Your workshop · 2 of 3</div>
              <h1 className="ws-title">What spins the bit?</h1>
              <p className="ws-lead">
                {M.family} {M.size} works with these. We marked the one it usually ships with.
              </p>
            </div>
            <div className="ws-grid2">
              {M.heads.map((id) => {
                const h = HEADS[id];
                const collets = id === "makita-rt0701" ? "Collets: 1/4″ · 1/8″ collet sold separately" : h.kind === "Spindle" ? "ER20 collets: 1/8″, 1/4″ · 3/8″, 1/2″ sold separately" : "ER11 collets: 1/8″, 1/4″ included";
                return (
                  <button key={id} className="ws-card ws-head-card" aria-pressed={head === id} onClick={() => setHead(id)}>
                    {h.auto ? (
                      <div className="dial" style={{ width: 96, height: 96 }} aria-hidden="true">
                        <span style={{ font: "600 22px var(--mono)" }}>AUTO</span>
                      </div>
                    ) : (
                      <Dial size={96} />
                    )}
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, textAlign: "left" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span className="ws-fam-name">{h.name}</span>
                        {M.defaultHead === id ? <span className="ws-pill">Default for {M.family}</span> : null}
                      </div>
                      <span className="ws-fam-blurb" style={{ lineHeight: 1.45 }}>
                        {h.note}
                      </span>
                      <span className="ws-fam-sizes">
                        {collets} · {h.rpm[0].toLocaleString("en-US")}–{h.rpm[1].toLocaleString("en-US")} RPM
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {view === "bits" && head ? (
          <div className="ws-page" style={{ maxWidth: 1260, paddingTop: 36, gap: 20 }}>
            <div className="ws-head">
              <div className="ws-kicker">Your workshop · 3 of 3</div>
              <h1 className="ws-title">Which bits do you have?</h1>
              <p className="ws-lead">When you design, we only offer the bits you have and that fit your {H?.name}. You can change this any time in My bits.</p>
            </div>
            <button className="ws-card ws-kit" aria-pressed={kitOn} onClick={() => setBits(kitOn ? bits.filter((b) => !KIT.includes(b)) : [...new Set([...bits, ...KIT])])}>
              <span className={`ws-check ${kitOn ? "is-on" : ""}`} style={{ width: 28, height: 28, borderRadius: 8, fontSize: 15 }}>
                {kitOn ? "✓" : ""}
              </span>
              <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, textAlign: "left" }}>
                <span style={{ font: "600 16px var(--font)" }}>I have the Starter End Mill Set (Beginner's Kit)</span>
                <span className="small muted">Marks the {KIT.length} bits in the kit at once</span>
              </span>
            </button>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <IntentChips value={intent} onChange={setIntent} />
              <span style={{ font: "500 13px var(--font)", color: "var(--text-2)" }}>{bits.length} selected</span>
            </div>
            <div className="ws-grid4">
              {filtered.map((b) => {
                const on = bits.includes(b.id);
                return (
                  <button key={b.id} className="ws-card ws-bit" aria-pressed={on} onClick={() => toggleBit(b.id)}>
                    <BitCardBody bit={b} head={head} corner={<span className={`ws-check ${on ? "is-on" : ""}`}>{on ? "✓" : ""}</span>} />
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {view === "ready" && M && H ? (
          <div className="ws-page ws-page--narrow" style={{ paddingTop: 56 }}>
            <div className="ws-head">
              <h1 className="ws-title">Your workshop is ready</h1>
              <p className="ws-lead">Change any of this later in Settings → My machine.</p>
            </div>
            <div className="ws-grid3" style={{ gap: 10 }}>
              {[
                { k: "Machine", v: `${M.family} ${M.size}`, s: cm(M.area) },
                { k: "Spins the bit", v: H.name, s: H.auto ? "Automatic speed" : "Dial by hand, 1–6" },
                { k: "Bits", v: `${bits.length} bits`, s: kitOn ? "Includes the Beginner's Kit" : "Your selection" },
              ].map((x) => (
                <div key={x.k} className="ws-summary">
                  <span className="small muted">{x.k}</span>
                  <span style={{ font: "600 17px var(--font)" }}>{x.v}</span>
                  <span className="ws-fam-sizes">{x.s}</span>
                </div>
              ))}
            </div>
            <div className="ws-panel" style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 20, padding: 20, borderColor: "rgba(255,255,255,.1)" }}>
              <div className="ws-illus" aria-hidden="true">
                <SurfacingIllustration />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div className="ws-kicker">First step</div>
                <div style={{ font: "600 22px/1.25 var(--font)" }}>Surface the bed</div>
                <div style={{ font: "400 15px/1.5 var(--font)", color: "var(--text-2)" }}>Flattens the spoilboard so every carve has the same depth everywhere on the bed. Uses the 22 mm surfacing bit.</div>
                {!bits.includes("aplainar-22mm") ? (
                  <div className="ws-warn">
                    <AlertTriangle size={16} color="var(--paused)" strokeWidth={1.75} />
                    <span style={{ flex: 1 }}>You haven't marked the 22 mm surfacing bit.</span>
                    <a href={sienciLink("https://sienci.com/product/22mm-surfacing-bit/", "onboarding", "aplainar-22mm")} target="_blank" rel="noreferrer">
                      <button>See in store</button>
                    </a>
                  </div>
                ) : null}
                <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                  <button className="ws-btn ws-btn--primary" onClick={() => nav("/surfacing")}>
                    Open Surfacing
                  </button>
                  <button className="ws-btn ws-btn--ghost" onClick={() => nav("/workshop")}>
                    Skip to first cuts
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </main>

      {view !== "ready" ? (
        <footer className="ws-foot">
          <div className="ws-foot-hint">{footHint}</div>
          <div style={{ display: "flex", gap: 10 }}>
            {obi > 0 ? (
              <button className="ws-btn ws-btn--ghost" onClick={() => setView(STEPS[obi - 1][0])}>
                Back
              </button>
            ) : null}
            {canNext ? (
              <button className="ws-btn ws-btn--primary" onClick={next}>
                {view === "bits" ? "Finish setup" : "Continue"}
              </button>
            ) : null}
          </div>
        </footer>
      ) : null}
    </div>
  );
}

export function IntentChips({ value, onChange }: { value: Intent | null; onChange(v: Intent | null): void }) {
  return (
    <div role="group" aria-label="Filter by use" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {([[null, "All"], ...INTENTS] as [Intent | null, string][]).map(([k, l]) => (
        <button key={l} className="ws-chip" aria-pressed={value === k} onClick={() => onChange(k)}>
          {l}
        </button>
      ))}
    </div>
  );
}

/** Ilustração em linha: fresa larga varrendo a mesa em passadas sobrepostas. */
function SurfacingIllustration() {
  return (
    <svg width="220" height="140" viewBox="0 0 220 140" fill="none" stroke="#A4A29D" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 110 L110 130 L200 100 L110 80 Z" />
      {[0, 1, 2, 3, 4].map((i) => (
        <path key={i} d={`M${38 + i * 18} ${106 - i * 4} L${128 + i * 18} ${126 - i * 4}`} stroke={i < 3 ? "#FF5B1F" : "#6E6C68"} strokeOpacity={i < 3 ? 0.8 : 0.6} />
      ))}
      <path d="M118 30 v34" strokeWidth="6" stroke="#6E6C68" />
      <rect x="104" y="64" width="28" height="9" rx="2" fill="#D6D3CD" stroke="none" />
      <path d="M90 76 h56" strokeDasharray="3 4" />
    </svg>
  );
}
