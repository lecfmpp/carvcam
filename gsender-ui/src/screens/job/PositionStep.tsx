import { ArrowDown, ArrowUp, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Plug } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Seg, SidePanel, VideoCard } from "../../components/ui";
import { machineName, materialById } from "../../lib/catalog";
import { useMachine, workPos } from "../../machine/store";
import { openConnect, toast } from "../../state/ui";
import { useWorkshop } from "../../state/workshop";
import { fitScale, Stage } from "../../stage/Stage";
import type { JobCtx } from "./Job";
import { useFlow } from "./jobUtil";

/** Onde a pessoa prende o bloco, em coordenadas de máquina (canto inferior esquerdo). */
export const STOCK_AT = { x: 60, y: 60 };
const PLATE = 15; // espessura da placa de toque (mm)

type Sub = "connect" | "home" | "stock" | "zero" | "done";

export function PositionStep({ ctx }: { ctx: JobCtx }) {
  const nav = useNavigate();
  const m = useMachine();
  const flow = useFlow();
  const mode = useWorkshop((s) => s.mode);
  const { machine, design, result } = ctx;
  const [probing, setProbing] = useState(false);
  const bedRef = useRef<HTMLDivElement>(null);

  const connected = m.status !== "disconnected" && m.status !== "connecting";
  const sub: Sub = !connected ? "connect" : !m.homed ? "home" : !flow.stockOk ? "stock" : !flow.zeroSet ? "zero" : "done";
  const stock = result?.layout.stock ?? { width: design.spec.width, height: design.spec.height, thickness: design.spec.thickness };
  const margin = result ? (stock.width - design.spec.width) / 2 : 0;
  const atCorner = Math.abs(m.pos.x - STOCK_AT.x) < 0.05 && Math.abs(m.pos.y - STOCK_AT.y) < 0.05;
  const stockW = Math.round(stock.width * 10) / 10;
  const stockH = Math.round(stock.height * 10) / 10;

  // Teclado: setas movem em X/Y, PageUp/PageDown em Z.
  useEffect(() => {
    if (sub !== "zero" || flow.probeOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea")) return;
      const j = useFlow.getState().jogStep;
      const map: Record<string, [number, number, number]> = { ArrowLeft: [-j, 0, 0], ArrowRight: [j, 0, 0], ArrowUp: [0, j, 0], ArrowDown: [0, -j, 0], PageUp: [0, 0, j], PageDown: [0, 0, -j] };
      const d = map[e.key];
      if (!d) return;
      e.preventDefault();
      useMachine.getState().jog(...d);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sub, flow.probeOpen]);

  const jog = (dx: number, dy: number, dz: number) => {
    if (!m.homed) return toast("Find machine home first, so moves are safe.");
    m.jog(dx * flow.jogStep, dy * flow.jogStep, dz * flow.jogStep);
  };

  const measure = async () => {
    setProbing(true);
    await useMachine.getState().probeZ(PLATE);
    setProbing(false);
    flow.set({ probeOpen: false });
  };

  let primary: { label: string; click(): void; enabled: boolean } = { label: "", click: () => {}, enabled: false };
  let hint = "";
  if (sub === "connect") primary = { label: m.status === "connecting" ? "Connecting…" : "Connect", click: openConnect, enabled: m.status !== "connecting" };
  if (sub === "home") primary = { label: m.status === "homing" ? "Finding home…" : "Find home", click: () => m.home(), enabled: m.status === "idle" };
  if (sub === "stock") primary = { label: "My board is clamped", click: () => flow.set({ stockOk: true }), enabled: true };
  if (sub === "zero") {
    if (flow.probeOpen) primary = { label: probing ? "Measuring…" : "Measure height", click: measure, enabled: !probing && m.status === "idle" };
    else {
      primary = {
        label: "Set zero here",
        click: () => {
          if (!atCorner) toast("Zero set where the bit is now. The sign will be carved from this point.");
          m.setWorkZero(["x", "y"]);
          flow.set({ zeroSet: true });
        },
        enabled: m.zMeasured,
      };
      hint = m.zMeasured ? (atCorner ? "The bit is on the corner." : "Click the board corner on the preview to move there.") : "Measure the tool height first.";
    }
  }
  if (sub === "done") primary = { label: "Continue to Carve →", click: () => nav("/carve"), enabled: true };

  const steps: [Sub, string, string][] = [
    ["connect", "Connect", `${machineName(machine)} over USB`],
    ["home", "Find machine home", "So the machine knows where it is"],
    ["stock", "Place your board", `At least ${stockW} × ${stockH} mm`],
    ["zero", "Set work zero", "Bottom-left corner, top face"],
  ];
  const order: Sub[] = ["connect", "home", "stock", "zero", "done"];
  const ci = order.indexOf(sub);
  const video = sub === "zero" && flow.probeOpen ? "position-probe" : `position-${sub === "done" ? "zero" : sub}`;
  const wp = workPos(m);
  const showStock = flow.stockOk || sub === "stock";
  const mat = materialById(design.material);
  // Antes de conectar, a posição é desconhecida: o marcador fica no meio da cama.
  const bitAt = connected ? m.pos : { x: machine.area[0] / 2, y: machine.area[1] / 2, z: 0 };

  return (
    <>
      <Stage
        noViewToggle
        caption={sub === "zero" ? "Click the board corner to move the bit there" : `Machine bed · top view · ${machineName(machine)} (${machine.area[0]} × ${machine.area[1]} mm)`}
        render={(api) => {
          const s = fitScale(api.size, machine.area[0], machine.area[1], { x: 140, y: 200 });
          const px = (v: number) => v * s;
          const clickable = sub === "zero" && !flow.probeOpen;
          return (
            <div style={{ transform: `scale(${api.zoom})`, transition: "transform 180ms var(--ease)" }}>
              <div
                ref={bedRef}
                className="bed"
                style={{ width: px(machine.area[0]), height: px(machine.area[1]), cursor: clickable ? "crosshair" : "default" }}
                onClick={(e) => {
                  if (!clickable) return;
                  const r = bedRef.current!.getBoundingClientRect();
                  const k = r.width / machine.area[0];
                  let x = (e.clientX - r.left) / k;
                  let y = machine.area[1] - (e.clientY - r.top) / k;
                  if (Math.abs(x - STOCK_AT.x) < 16 && Math.abs(y - STOCK_AT.y) < 16) [x, y] = [STOCK_AT.x, STOCK_AT.y];
                  m.moveTo(x, y);
                }}
              >
                <div className="bed__grid" />
                {showStock ? (
                  <>
                    <div
                      className="bed__stock"
                      style={{ left: px(STOCK_AT.x), bottom: px(STOCK_AT.y), width: px(stock.width), height: px(stock.height), background: mat.face, opacity: flow.stockOk ? 1 : 0.45, border: flow.stockOk ? "none" : "1.5px dashed var(--text)" }}
                    >
                      {margin > 0 ? <div className="bed__ghost" style={{ inset: px(margin) }} /> : null}
                    </div>
                    <div className="bed__corner" style={{ left: px(STOCK_AT.x) - 9, bottom: px(STOCK_AT.y) - 9, background: flow.zeroSet ? "var(--accent)" : "rgba(255,91,31,.2)" }} />
                    <div className="bed__corner-label" style={{ left: px(STOCK_AT.x) - 4, top: px(machine.area[1] - STOCK_AT.y) + 14 }}>
                      Work zero · bottom-left, top face
                    </div>
                  </>
                ) : null}
                <div
                  className="bed__bit"
                  style={{ left: px(bitAt.x) - 11, bottom: px(bitAt.y) - 11, background: `rgba(255,91,31,${0.15 + 0.35 * Math.min(1, -bitAt.z / machine.z)})` }}
                />
                <div className="bed__tag mono" style={{ left: px(bitAt.x) + 16, bottom: px(bitAt.y) + 10 }}>
                  {!connected || !m.homed
                    ? "Position unknown"
                    : flow.zeroSet
                      ? `X ${wp.x.toFixed(1)}  Y ${wp.y.toFixed(1)}  Z ${m.zMeasured ? wp.z.toFixed(1) : "—"}`
                      : `X ${m.pos.x.toFixed(1)}  Y ${m.pos.y.toFixed(1)}  Z ${m.pos.z.toFixed(1)}`}
                </div>
                <div className="bed__label mono" style={{ left: 10, bottom: -30 }}>
                  Front of machine
                </div>
                <div className="bed__label mono" style={{ right: 10, top: -30 }}>
                  Home · back right
                </div>
              </div>
            </div>
          );
        }}
      />
      <SidePanel
        title="Position"
        sub={design.name}
        foot={
          <>
            {hint ? <div className="sidepanel__hint">{hint}</div> : null}
            <button className="btn btn--primary btn--lg" disabled={!primary.enabled} onClick={primary.click}>
              {primary.label}
            </button>
          </>
        }
      >
        <div className="substeps">
          {steps.map(([k, label, subText], i) => (
            <div key={k} className="substep">
              <span className={`num ${i < ci ? "num--done" : i === ci ? "num--current" : ""}`}>{i < ci ? "✓" : i + 1}</span>
              <span className="substep__text">
                <span className={i === ci ? "substep__label substep__label--current" : i > ci ? "substep__label substep__label--todo" : "substep__label"}>{label}</span>
                <span className="substep__sub">{subText}</span>
              </span>
            </div>
          ))}
        </div>

        {sub === "connect" ? (
          <div className="job-sec">
            <div className="job-body">{m.status === "connecting" ? `Connecting to ${machineName(machine)}…` : "We'll show you where each cable goes, connect, and test that the machine really answers."}</div>
            <div className="port">
              <Plug size={20} strokeWidth={1.5} color="var(--text-3)" />
              <span style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ font: "500 14px var(--font)" }}>{machineName(machine)}</span>
                <span className="mono tiny muted">Power · E-stop · router · USB or Ethernet</span>
              </span>
            </div>
          </div>
        ) : null}

        {sub === "home" ? (
          <div className="job-sec">
            <div className="job-body">The machine moves to the back-right corner, touches its sensors and stops. This is how it learns where it is. Takes about 30 seconds. Keep the bed clear.</div>
            <div className="illus">line illustration · gantry travelling to the back-right sensors</div>
            {m.status === "homing" ? (
              <div role="status" className="mono job-live">
                Moving to the sensors… Z ✓ · X · Y
              </div>
            ) : null}
            <button className="link" style={{ alignSelf: "flex-start", color: "var(--text-2)" }} onClick={() => toast("Without sensors, jog to the back-right corner by hand and set it as home in Settings.")}>
              My machine has no limit sensors
            </button>
          </div>
        ) : null}

        {sub === "stock" ? (
          <div className="job-sec">
            <div className="job-body">Clamp a board anywhere on the bed. It needs at least {margin > 0 ? `${margin} mm of margin around the sign` : "the size of the sign"}.</div>
            <div className="job-row job-row--box">
              <span>Minimum board</span>
              <span className="mono" style={{ font: "500 15px var(--mono)", color: "var(--text)" }}>
                {stockW} × {stockH} × {stock.thickness} mm
              </span>
            </div>
            <ZeroIllustration face={mat.face} recess={mat.recess} side={mat.side} />
          </div>
        ) : null}

        {sub === "zero" && !flow.probeOpen ? (
          <div className="job-sec">
            <div className="job-body">
              Move the bit to the <b style={{ color: "var(--text)", fontWeight: 600 }}>bottom-left corner of the board, on the top face</b>. Click the corner on the preview, then fine-tune with the arrows.
            </div>
            <div className="jog">
              <div className="jog__pad">
                <span />
                <button className="jog__btn" aria-label="Move back (Y+)" onClick={() => jog(0, 1, 0)}>
                  <ChevronUp size={18} strokeWidth={1.75} />
                </button>
                <span />
                <button className="jog__btn" aria-label="Move left (X−)" onClick={() => jog(-1, 0, 0)}>
                  <ChevronLeft size={18} strokeWidth={1.75} />
                </button>
                <span className="jog__xy mono">XY</span>
                <button className="jog__btn" aria-label="Move right (X+)" onClick={() => jog(1, 0, 0)}>
                  <ChevronRight size={18} strokeWidth={1.75} />
                </button>
                <span />
                <button className="jog__btn" aria-label="Move forward (Y−)" onClick={() => jog(0, -1, 0)}>
                  <ChevronDown size={18} strokeWidth={1.75} />
                </button>
                <span />
              </div>
              <div className="jog__z">
                <button className="jog__btn jog__btn--z mono" aria-label="Raise bit (Z+)" onClick={() => jog(0, 0, 1)}>
                  <ArrowUp size={18} strokeWidth={1.75} />
                  Up
                </button>
                <button className="jog__btn jog__btn--z mono" aria-label="Lower bit (Z−)" onClick={() => jog(0, 0, -1)}>
                  <ArrowDown size={18} strokeWidth={1.75} />
                  Down
                </button>
              </div>
            </div>
            <Seg<string>
              label="Step size"
              size="lg"
              value={String(flow.jogStep)}
              onChange={(v) => flow.set({ jogStep: Number(v) })}
              options={[
                ["0.1", <span className="mono">0.1 mm</span>],
                ["1", <span className="mono">1 mm</span>],
                ["10", <span className="mono">10 mm</span>],
              ]}
            />
            {mode === "pro" ? (
              <div className="readout mono">
                <span className="readout__k">Work</span>
                <span>{flow.zeroSet ? wp.x.toFixed(3) : "—"}</span>
                <span>{flow.zeroSet ? wp.y.toFixed(3) : "—"}</span>
                <span>{m.zMeasured ? wp.z.toFixed(3) : "—"}</span>
                <span className="readout__k">Machine</span>
                <span>{m.pos.x.toFixed(3)}</span>
                <span>{m.pos.y.toFixed(3)}</span>
                <span>{m.pos.z.toFixed(3)}</span>
              </div>
            ) : null}
            <div className="tool-height">
              <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ font: "500 14px var(--font)" }}>Tool height</span>
                <span className="small muted">{m.zMeasured ? "Measured · top of the board" : "Not measured yet"}</span>
              </span>
              <button className="btn btn--outline btn--sm" onClick={() => flow.set({ probeOpen: true })}>
                Use touch plate
              </button>
            </div>
          </div>
        ) : null}

        {sub === "zero" && flow.probeOpen ? (
          <div className="job-sec">
            <div style={{ font: "600 15px var(--font)" }}>
              Measure height with the touch plate <span className="mono" style={{ font: "400 11px var(--mono)", color: "var(--text-4)" }}>probe Z</span>
            </div>
            <div className="probe-grid">
              <div className="illus illus--sm">1 · plate on the board, under the bit</div>
              <div className="illus illus--sm">2 · magnet clip on the bit</div>
              <div className="illus illus--sm">3 · touch, then lift</div>
            </div>
            <div className="job-body">The bit will lower slowly until it touches the plate, then lift 5 mm.</div>
            {probing ? (
              <div role="status" className="mono job-live">
                Lowering… waiting for contact
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn--outline btn--sm" onClick={() => toast("Contact detected. The plate is working.")}>
                Test contact
              </button>
              <button className="link" style={{ color: "var(--text-2)" }} onClick={() => flow.set({ probeOpen: false })}>
                Back
              </button>
            </div>
          </div>
        ) : null}

        {sub === "done" ? (
          <div className="job-sec">
            <div className="job-ok">
              <CheckCircle2 size={18} color="var(--ready-text)" strokeWidth={1.75} />
              <span>Work zero is set on the bottom-left corner of the board. The sign will be carved from there.</span>
            </div>
            <button className="link" style={{ alignSelf: "flex-start", color: "var(--text-2)" }} onClick={() => flow.set({ zeroSet: false })}>
              Set zero again
            </button>
          </div>
        ) : null}

        <VideoCard id={video} />
      </SidePanel>
    </>
  );
}

/** Desenho do bloco com o zero no canto inferior esquerdo da face de cima (do protótipo). */
function ZeroIllustration({ face, recess, side }: { face: string; recess: string; side: string }) {
  return (
    <div className="zero-illus">
      <div style={{ position: "absolute", left: 96, top: 44, width: 170, height: 62, background: face, transform: "skewX(-40deg)", transformOrigin: "bottom left" }} />
      <div style={{ position: "absolute", left: 96, top: 106, width: 170, height: 30, background: recess }} />
      <div style={{ position: "absolute", left: 266, top: 106, width: 52, height: 30, background: side, transform: "skewY(-50deg)", transformOrigin: "top left" }} />
      <div style={{ position: "absolute", left: 96, top: 106, width: 66, height: 2, background: "var(--text)" }} />
      <div className="mono" style={{ position: "absolute", left: 164, top: 99, font: "600 12px var(--mono)" }}>
        X
      </div>
      <div style={{ position: "absolute", left: 96, top: 106, width: 60, height: 2, background: "var(--text)", transform: "rotate(-50deg)", transformOrigin: "left center" }} />
      <div className="mono" style={{ position: "absolute", left: 134, top: 52, font: "600 12px var(--mono)" }}>
        Y
      </div>
      <div style={{ position: "absolute", left: 95, top: 52, width: 2, height: 54, background: "var(--text)" }} />
      <div className="mono" style={{ position: "absolute", left: 84, top: 34, font: "600 12px var(--mono)" }}>
        Z
      </div>
      <div style={{ position: "absolute", left: 87, top: 97, width: 18, height: 18, borderRadius: "50%", background: "var(--accent)", boxShadow: "0 0 0 4px rgba(255,91,31,.25)" }} />
      <div style={{ position: "absolute", left: 16, bottom: 12, font: "500 12px var(--font)" }}>Work zero = bottom-left corner, on the top face</div>
    </div>
  );
}
