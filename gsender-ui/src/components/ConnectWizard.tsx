import { AlertTriangle, ArrowLeft, Cable, Check, ChevronDown, Network, Plug, Usb, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { machineName } from "../lib/catalog";
import { CONTROLLERS, controllersFor, fakePort, handshake, wiringSteps, type ControllerId, type ControllerInfo, type Link, type Step } from "../lib/connectGuide";
import { headInfo } from "../lib/headInfo";
import { bridgePorts, webSerial, type BridgePort } from "../machine/grbl/transport";
import { spinTestReal } from "../machine/real";
import { useMachine } from "../machine/store";
import { toast, useUi } from "../state/ui";
import { useActiveMachine, useWorkshop } from "../state/workshop";
import "./connect-wizard.css";

/**
 * Assistente "Connect": mostra onde vai cada cabo (energia, E-stop, router/spindle e USB ou
 * Ethernet), conecta e confere que a máquina responde de verdade (placa responde, E-stop solto,
 * um movimento pequeno no Z e, quando dá, girar o spindle). Abre no lugar do antigo "Connect".
 */
export function ConnectWizardHost() {
  const open = useUi((s) => s.connectOpen);
  return open ? <ConnectWizard /> : null;
}

type Phase = { kind: "setup" } | { kind: "wire"; i: number } | { kind: "connect" } | { kind: "verify" };

function ConnectWizard() {
  const close = useUi((s) => s.closeConnect);
  const { machine, headId } = useActiveMachine();
  const ws = useWorkshop();
  const options = controllersFor(machine.family);
  const saved = ws.link[machine.id];
  const [ctrlId, setCtrlId] = useState<ControllerId>((saved?.controller as ControllerId) ?? options[0]);
  const [link, setLink] = useState<Link>(saved?.link ?? "usb");
  const c = CONTROLLERS[ctrlId];
  const steps = useMemo(() => wiringSteps(c, headId, c.ethernet ? link : "usb"), [c, headId, link]);
  const key = `${machine.id}|${headId}|${ctrlId}|${link}`;
  const known = ws.wired.includes(key);
  const [phase, setPhase] = useState<Phase>(known ? { kind: "connect" } : { kind: "setup" });
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  // Barra de progresso: escolha + passos de cabo + conectar + conferir.
  const total = steps.length + 3;
  const at = phase.kind === "setup" ? 0 : phase.kind === "wire" ? phase.i + 1 : phase.kind === "connect" ? steps.length + 1 : steps.length + 2;
  const stepNow = phase.kind === "wire" ? steps[phase.i] : null;
  const doneIds = new Set(phase.kind === "wire" ? steps.slice(0, phase.i).map((s) => s.id) : phase.kind === "setup" ? [] : steps.map((s) => s.id));

  const saveChoice = () => ws.setLink(machine.id, { controller: ctrlId, link: c.ethernet ? link : "usb" });
  const back = () => {
    if (phase.kind === "wire") setPhase(phase.i === 0 ? { kind: "setup" } : { kind: "wire", i: phase.i - 1 });
    else if (phase.kind === "connect") setPhase(known ? { kind: "setup" } : { kind: "wire", i: steps.length - 1 });
    else if (phase.kind === "verify") setPhase({ kind: "connect" });
  };

  return createPortal(
    <div className="cw" role="dialog" aria-modal="true" aria-label="Connect your machine" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="cw__card">
        <header className="cw__head">
          <div className="cw__titles">
            <span className="cw__eyebrow">Connect · {machineName(machine)}</span>
            <h2 className="cw__title">{phase.kind === "setup" ? "Let's hook up your machine" : phase.kind === "wire" ? stepNow!.title : phase.kind === "connect" ? "Connect to CarvCAM" : "Make sure it's really connected"}</h2>
          </div>
          <button className="cw__close" aria-label="Close" onClick={close}>
            <X size={18} />
          </button>
        </header>
        <div className="cw__progress" aria-label={`Step ${at + 1} of ${total}`}>
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={i < at ? "is-done" : i === at ? "is-now" : ""} />
          ))}
        </div>

        <div className="cw__body">
          <div className="cw__map">
            <WiringMap
              c={c}
              headId={headId}
              link={c.ethernet ? link : "usb"}
              done={doneIds}
              current={stepNow?.id ?? (phase.kind === "connect" ? (c.ethernet && link === "ethernet" ? "ethernet" : "usb") : null)}
            />
            <div className="cw__legend">
              <span><i className="is-now" /> Now</span>
              <span><i className="is-done" /> Done</span>
              <span><i /> Later</span>
            </div>
          </div>

          <div className="cw__side">
            {phase.kind === "setup" ? (
              <Setup
                c={c}
                options={options}
                ctrlId={ctrlId}
                setCtrlId={setCtrlId}
                link={link}
                setLink={setLink}
                headName={headInfo(headId).name}
                onStart={() => {
                  saveChoice();
                  setChecked({});
                  setPhase({ kind: "wire", i: 0 });
                }}
                known={known}
                onSkip={() => {
                  saveChoice();
                  setPhase({ kind: "connect" });
                }}
              />
            ) : null}

            {phase.kind === "wire" ? (
              <WireStep
                step={stepNow!}
                checked={checked}
                setChecked={setChecked}
                onBack={back}
                onNext={() => setPhase(phase.i + 1 < steps.length ? { kind: "wire", i: phase.i + 1 } : { kind: "connect" })}
              />
            ) : null}

            {phase.kind === "connect" ? (
              <ConnectStep
                c={c}
                link={c.ethernet ? link : "usb"}
                known={known}
                onBack={back}
                onShowWiring={() => setPhase({ kind: "wire", i: 0 })}
                onConnected={() => setPhase({ kind: "verify" })}
              />
            ) : null}

            {phase.kind === "verify" ? (
              <Verify
                c={c}
                headId={headId}
                onBack={back}
                onDone={() => {
                  ws.markWired(key);
                  close();
                  toast("Connected and checked. Next: find machine home.");
                }}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ---------------- Passo 0: qual placa e qual cabo ---------------- */

function Setup(props: {
  c: ControllerInfo;
  options: ControllerId[];
  ctrlId: ControllerId;
  setCtrlId(id: ControllerId): void;
  link: Link;
  setLink(l: Link): void;
  headName: string;
  known: boolean;
  onStart(): void;
  onSkip(): void;
}) {
  const { c } = props;
  return (
    <div className="cw__pane">
      <p className="cw__lead">We'll go cable by cable. It takes about 5 minutes the first time. Have the machine, its controller box and your computer close by.</p>

      {props.options.length > 1 ? (
        <fieldset className="cw__field">
          <legend>Which controller does your LongMill have?</legend>
          <div className="cw__choices">
            {props.options.map((id) => (
              <button key={id} className="cw__choice" aria-pressed={props.ctrlId === id} onClick={() => props.setCtrlId(id)}>
                <span className="cw__choice-title">{CONTROLLERS[id].name}</span>
                <span className="cw__choice-sub">{id === "longboard" ? "Original board, USB only" : "Grey box with an E-stop, USB-C and Ethernet"}</span>
              </button>
            ))}
          </div>
        </fieldset>
      ) : (
        <div className="cw__fact">
          <span className="cw__fact-label">Controller</span>
          <span className="cw__fact-value">{c.name}</span>
          <span className="cw__fact-sub">Comes with your machine · {c.firmware}</span>
        </div>
      )}

      <div className="cw__fact">
        <span className="cw__fact-label">Spins the bit</span>
        <span className="cw__fact-value">{props.headName}</span>
        <span className="cw__fact-sub">Change it in Settings › My machine</span>
      </div>

      {c.ethernet ? (
        <fieldset className="cw__field">
          <legend>How will the computer talk to it?</legend>
          <div className="cw__choices">
            <button className="cw__choice" aria-pressed={props.link === "usb"} onClick={() => props.setLink("usb")}>
              <Usb size={18} />
              <span className="cw__choice-title">USB cable</span>
              <span className="cw__choice-sub">Easiest. Recommended to start.</span>
            </button>
            <button className="cw__choice" aria-pressed={props.link === "ethernet"} onClick={() => props.setLink("ethernet")}>
              <Network size={18} />
              <span className="cw__choice-title">Ethernet</span>
              <span className="cw__choice-sub">More robust, computer far away. Needs USB once.</span>
            </button>
          </div>
        </fieldset>
      ) : (
        <div className="cw__fact">
          <span className="cw__fact-label">Computer link</span>
          <span className="cw__fact-value">{c.usb} cable</span>
          <span className="cw__fact-sub">This controller connects over USB</span>
        </div>
      )}

      <div className="cw__actions">
        <button className="btn btn--primary btn--lg" onClick={props.onStart}>
          Show me the cables
        </button>
        <button className="link cw__skip" onClick={props.onSkip}>
          {props.known ? "Skip, it's all plugged in like last time" : "Everything is already plugged in"}
        </button>
      </div>
    </div>
  );
}

/* ---------------- Passos de cabo ---------------- */

function WireStep(props: { step: Step; checked: Record<string, boolean>; setChecked(v: Record<string, boolean>): void; onBack(): void; onNext(): void }) {
  const { step } = props;
  const [help, setHelp] = useState(false);
  const all = step.check.every((_, i) => props.checked[`${step.id}:${i}`]);
  useEffect(() => setHelp(false), [step.id]);
  return (
    <div className="cw__pane" key={step.id}>
      <p className="cw__lead">{step.lead}</p>
      <ol className="cw__do">
        {step.do.map((t, i) => (
          <li key={i}>
            <span className="cw__n">{i + 1}</span>
            <span>{t}</span>
          </li>
        ))}
      </ol>
      {step.caution ? (
        <div className="cw__caution">
          <AlertTriangle size={16} /> {step.caution}
        </div>
      ) : null}
      <div className="cw__check">
        <span className="cw__check-title">How to know it worked</span>
        {step.check.map((t, i) => {
          const k = `${step.id}:${i}`;
          return (
            <label key={k} className="cw__tick">
              <input type="checkbox" checked={!!props.checked[k]} onChange={(e) => props.setChecked({ ...props.checked, [k]: e.target.checked })} />
              <span className="cw__box" aria-hidden>
                <Check size={14} strokeWidth={3} />
              </span>
              <span>{t}</span>
            </label>
          );
        })}
      </div>
      <button className="cw__help-toggle" aria-expanded={help} onClick={() => setHelp(!help)}>
        Not working? <ChevronDown size={14} style={{ transform: help ? "rotate(180deg)" : undefined }} />
      </button>
      {help ? (
        <ul className="cw__help">
          {step.help.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      ) : null}
      <div className="cw__nav">
        <button className="btn btn--quiet" onClick={props.onBack}>
          <ArrowLeft size={16} /> Back
        </button>
        <button className="btn btn--primary" disabled={!all} onClick={props.onNext}>
          {all ? "Next" : "Tick the check above"}
        </button>
      </div>
    </div>
  );
}

/* ---------------- Conectar ---------------- */

type Pick = { kind: "bridge"; path: string } | { kind: "webserial" } | { kind: "tcp" } | { kind: "sim" };

function portName(p: BridgePort) {
  const vid = p.vendorId?.toLowerCase();
  const chip = vid === "0483" ? "STM32 (SuperLongBoard)" : vid === "1a86" ? "CH340 (LongBoard)" : vid === "2341" ? "Arduino (LongBoard)" : p.manufacturer;
  return chip ? `${chip}` : "USB serial device";
}

function ConnectStep(props: { c: ControllerInfo; link: Link; known: boolean; onBack(): void; onShowWiring(): void; onConnected(): void }) {
  const m = useMachine();
  const { machine } = useActiveMachine();
  const [ports, setPorts] = useState<BridgePort[] | null | undefined>(undefined);
  const [pick, setPick] = useState<Pick | null>(null);
  const [host, setHost] = useState("192.168.5.1");
  const [err, setErr] = useState<string | null>(null);
  const [simLog, setSimLog] = useState<string[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const connected = m.status !== "disconnected" && m.status !== "connecting";
  const hasWebSerial = !!webSerial();
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Procura a placa a cada 2 s pelo bridge (aparece sozinha quando o cabo é ligado).
  useEffect(() => {
    let alive = true;
    const look = async () => {
      const p = await bridgePorts();
      if (!alive) return;
      setPorts(p);
    };
    void look();
    const t = setInterval(look, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  useEffect(() => {
    if (pick || ports === undefined) return;
    if (props.link === "ethernet" && ports !== null) setPick({ kind: "tcp" });
    else if (ports?.length) setPick({ kind: "bridge", path: ports[0].path });
    else if (hasWebSerial) setPick({ kind: "webserial" });
  }, [ports, pick, hasWebSerial, props.link]);

  const go = async () => {
    if (!pick) return;
    setErr(null);
    setSimLog([]);
    m.setBed({ x: machine.area[0], y: machine.area[1], z: machine.z });
    try {
      if (pick.kind === "sim") {
        const port = fakePort(props.link);
        handshake(props.c, props.link, port).forEach((l, i) => timers.current.push(setTimeout(() => setSimLog((p) => [...p, l]), 120 + i * 160)));
        await m.connect(`Simulator · ${port}`);
      } else if (pick.kind === "bridge") await m.connectReal({ kind: "serial", path: pick.path, label: `USB · ${pick.path}` });
      else if (pick.kind === "tcp") {
        const [h, p] = host.trim().split(":");
        await m.connectReal({ kind: "tcp", host: h, port: Number(p) || 23, label: `Ethernet · ${host.trim()}` });
      }
      else {
        // O navegador mostra a lista de portas USB; a pessoa escolhe a da máquina.
        const port = await webSerial()!.requestPort();
        await m.connectReal({ kind: "webserial", port, label: "USB (browser)" });
      }
      setTimeout(props.onConnected, 900);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/No port selected|NotFoundError/i.test(msg)) return;
      setErr(/busy|access denied|resource busy|locked|EBUSY|Failed to open/i.test(msg) ? "The port is in use. Close gSender or any other program connected to the machine, then try again." : msg);
    }
  };

  const real = m.conn === "real";
  const logLines = real ? m.log.slice(-8).map((l) => (l.dir === "out" ? "> " : "") + l.text) : simLog;
  const noWay = ports === null && !hasWebSerial;

  return (
    <div className="cw__pane">
      <p className="cw__lead">
        {props.known ? "Your cables were checked before. " : ""}
        Turn the controller on, then pick it below. {props.link === "usb" ? "It shows up a few seconds after the USB cable is plugged in." : "It answers on its fixed IP address."}
      </p>
      <div className="cw__ports" role="radiogroup" aria-label="Found devices">
        {props.link === "ethernet" ? (
          <div className={`cw__port ${pick?.kind === "tcp" ? "is-on" : ""}`} role="radio" aria-checked={pick?.kind === "tcp"} tabIndex={0} onClick={() => setPick({ kind: "tcp" })}>
            <Network size={20} />
            <span className="cw__port-text">
              <span className="cw__port-name">{props.c.name} over Ethernet</span>
              <label className="cw__ip">
                <span>IP address</span>
                <input className="mono" value={host} onChange={(e) => setHost(e.target.value)} inputMode="decimal" aria-label="Controller IP address" />
              </label>
            </span>
          </div>
        ) : null}
        {props.link === "usb"
          ? (ports ?? []).map((p) => {
              const on = pick?.kind === "bridge" && pick.path === p.path;
              return (
                <div key={p.path} className={`cw__port ${on ? "is-on" : ""}`} role="radio" aria-checked={on} tabIndex={0} onClick={() => setPick({ kind: "bridge", path: p.path })}>
                  <Usb size={20} />
                  <span className="cw__port-text">
                    <span className="cw__port-name">{portName(p)}</span>
                    <span className="cw__port-sub mono">USB · {p.path}</span>
                  </span>
                  <span className="cw__port-dot" aria-hidden />
                </div>
              );
            })
          : null}
        {props.link === "usb" && hasWebSerial && !(ports && ports.length) ? (
          <div className={`cw__port ${pick?.kind === "webserial" ? "is-on" : ""}`} role="radio" aria-checked={pick?.kind === "webserial"} tabIndex={0} onClick={() => setPick({ kind: "webserial" })}>
            <Usb size={20} />
            <span className="cw__port-text">
              <span className="cw__port-name">Choose the USB port</span>
              <span className="cw__port-sub">Your browser shows the list after you press Connect</span>
            </span>
          </div>
        ) : null}
        {props.link === "usb" && ports && !ports.length && !hasWebSerial ? <div className="cw__note">No USB controller found yet. Check the cable and that the controller is on.</div> : null}
        {noWay ? (
          <div className="cw__note">
            To talk to the machine, start CarvCAM with <b>testar-carvcam</b> (it starts the CarvCAM bridge), or open it in Chrome or Edge.
          </div>
        ) : null}
        <div className={`cw__port cw__port--sim ${pick?.kind === "sim" ? "is-on" : ""}`} role="radio" aria-checked={pick?.kind === "sim"} tabIndex={0} onClick={() => setPick({ kind: "sim" })}>
          <Cable size={20} />
          <span className="cw__port-text">
            <span className="cw__port-name">Simulator</span>
            <span className="cw__port-sub">No machine: try the steps safely</span>
          </span>
        </div>
      </div>
      {err ? (
        <div className="cw__caution" role="alert">
          <AlertTriangle size={16} /> {err}
        </div>
      ) : null}
      {logLines.length ? (
        <pre className="cw__log mono" aria-live="polite">
          {logLines.join("\n")}
        </pre>
      ) : null}
      {connected ? (
        <div className="cw__ok" role="status">
          <Check size={16} /> {real ? `${m.firmware} answered.` : "The simulator answered."} Let's test it.
        </div>
      ) : null}
      <details className="cw__details">
        <summary>Don't see it?</summary>
        <ul className="cw__help">
          <li>Check the controller's power switch is ON and the E-stop is released.</li>
          <li>Unplug the {props.link === "usb" ? "USB" : "Ethernet"} cable, wait 5 seconds and plug it back in.</li>
          <li>Close gSender or any other program that may be holding the connection. Only one program can talk to the machine at a time.</li>
          {props.link === "usb" ? <li>Try another USB port or a cable you know carries data.</li> : <li>Check the computer's Ethernet address is 192.168.5.x (not .1).</li>}
        </ul>
        <button className="link" onClick={props.onShowWiring}>
          Go through the cables again
        </button>
      </details>
      <div className="cw__nav">
        <button className="btn btn--quiet" onClick={props.onBack}>
          <ArrowLeft size={16} /> Back
        </button>
        <button className="btn btn--primary" disabled={!pick || m.status === "connecting" || connected} onClick={go}>
          <Plug size={16} /> {m.status === "connecting" ? "Connecting…" : connected ? "Connected" : "Connect"}
        </button>
      </div>
    </div>
  );
}

/* ---------------- Conferir ---------------- */

type Ans = "yes" | "no" | null;

function Verify(props: { c: ControllerInfo; headId: string; onBack(): void; onDone(): void }) {
  const m = useMachine();
  const auto = props.headId !== "makita-rt0701";
  const [moved, setMoved] = useState(false);
  const [moveAns, setMoveAns] = useState<Ans>(null);
  const [spun, setSpun] = useState<"idle" | "spinning" | "done">("idle");
  const [spinAns, setSpinAns] = useState<Ans>(null);
  const alive = m.status === "idle" || m.status === "homing";

  const real = m.conn === "real";
  const autoChecks: [boolean, string, string][] = [
    [m.status !== "disconnected", "Controller answers", real ? `${m.firmware} on ${m.port}` : `${props.c.firmware} replied to CarvCAM`],
    [m.status !== "alarm", "Not locked", props.c.estop ? "The E-stop is released (no Alarm 10)" : "No alarm reported"],
    [alive, "Ready to move", "Machine state: Idle"],
  ];

  const nudge = () => {
    m.jog(0, 0, 2);
    setMoved(true);
  };
  const spin = async () => {
    setSpun("spinning");
    if (real) await spinTestReal(10000, 3000);
    else await new Promise((r) => setTimeout(r, 3000));
    setSpun("done");
  };
  const ready = autoChecks.every((a) => a[0]) && moveAns === "yes" && (!auto || spinAns !== null);

  return (
    <div className="cw__pane">
      <p className="cw__lead">A connected cable isn't enough: we check the machine really listens. Keep hands clear of the bit.</p>
      <ul className="cw__auto">
        {autoChecks.map(([ok, t, s]) => (
          <li key={t} className={ok ? "is-ok" : "is-bad"}>
            <span className="cw__auto-dot">{ok ? <Check size={13} strokeWidth={3} /> : "!"}</span>
            <span>
              <b>{t}</b>
              <span>{s}</span>
            </span>
          </li>
        ))}
      </ul>
      {m.status === "alarm" ? (
        <div className="cw__test cw__test--warn">
          <p>
            {m.alarm === "estop"
              ? "The E-stop is pressed. Twist it clockwise until it pops up, then unlock."
              : "Controllers start locked after power-on, for safety. Make sure the bed is clear, then unlock. You'll find home in the next step."}
          </p>
          <button className="btn btn--quiet" onClick={() => m.clearAlarm()}>
            Unlock the machine
          </button>
        </div>
      ) : null}

      <div className="cw__test">
        <div className="cw__test-head">
          <span className="cw__test-n">Test 1</span>
          <b>Move the bit up 2 mm</b>
        </div>
        <p>The router should lift a little. This proves the motors get power and follow commands.</p>
        <button className="btn btn--quiet" onClick={nudge} disabled={!alive}>
          <Cable size={16} /> {moved ? "Move up 2 mm again" : "Move up 2 mm"}
        </button>
        {moved ? <YesNo q="Did it move up?" value={moveAns} onChange={setMoveAns} /> : null}
        {moveAns === "no" ? (
          <ul className="cw__help">
            <li>Check the E-stop is twisted up and lit.</li>
            <li>Check the motor cables are clicked into the controller (Z is usually the one on the top).</li>
            <li>Turn the controller off and on, then connect again.</li>
          </ul>
        ) : null}
      </div>

      {auto ? (
        <div className="cw__test">
          <div className="cw__test-head">
            <span className="cw__test-n">Test 2</span>
            <b>Spin the {props.headId === "autospin-t1" ? "router" : "spindle"} for 3 seconds</b>
          </div>
          <p>Runs at 10,000 RPM, then stops. Proves the {props.headId === "autospin-t1" ? "signal cable" : "VFD data cable"} works.</p>
          <button className="btn btn--quiet" onClick={spin} disabled={!alive || spun === "spinning"}>
            {spun === "spinning" ? "Spinning…" : spun === "done" ? "Spin again" : "Spin for 3 s"}
          </button>
          {spun === "done" ? <YesNo q="Did it spin and stop?" value={spinAns} onChange={setSpinAns} /> : null}
          {spinAns === "no" ? (
            <ul className="cw__help">
              {props.headId === "autospin-t1" ? (
                <>
                  <li>Check the AutoSpin is plugged into the wall and in Spindle mode.</li>
                  <li>Re-seat the signal cable at the router and at the controller's SPINDLE port.</li>
                </>
              ) : (
                <>
                  <li>Check the VFD is on. If it shows r00.0 or F00.0 it isn't hearing the controller.</li>
                  <li>Make sure the data cable is in the back port of the controller, then power-cycle VFD and controller.</li>
                </>
              )}
              <li>You can still carve: CarvCAM will remind you to start it by hand.</li>
            </ul>
          ) : null}
        </div>
      ) : (
        <div className="cw__note">The Makita is switched on by hand, so there's nothing to test here. CarvCAM tells you when to turn it on and which dial number to use.</div>
      )}

      <div className="cw__nav">
        <button className="btn btn--quiet" onClick={props.onBack}>
          <ArrowLeft size={16} /> Back
        </button>
        <button className="btn btn--primary" disabled={!ready} onClick={props.onDone}>
          {ready ? "All good, continue" : "Finish the tests"}
        </button>
      </div>
    </div>
  );
}

function YesNo(props: { q: string; value: Ans; onChange(v: Ans): void }) {
  return (
    <div className="cw__yesno" role="radiogroup" aria-label={props.q}>
      <span>{props.q}</span>
      <button aria-pressed={props.value === "yes"} onClick={() => props.onChange("yes")}>
        Yes
      </button>
      <button aria-pressed={props.value === "no"} onClick={() => props.onChange("no")}>
        No
      </button>
    </div>
  );
}

/* ---------------- Mapa de ligação ---------------- */

/**
 * Desenho de onde vai cada cabo: computador, controladora (com as portas), fonte, tomada, E-stop
 * e o router/spindle. O cabo do passo atual fica laranja e animado; os feitos, verdes.
 */
function WiringMap(props: { c: ControllerInfo; headId: string; link: Link; done: Set<string>; current: string | null }) {
  const { c, link, done, current } = props;
  const isVfd = props.headId.startsWith("spindle");
  const isAuto = props.headId === "autospin-t1";
  const st = (id: string) => (current === id ? "now" : done.has(id) ? "done" : "later");
  const linkId = link === "usb" ? "usb" : "ethernet";
  const powerSt = st("power");
  const headSt = st("head");
  const linkSt = st(linkId);
  const estopSt = c.estop ? st("estop") : "later";
  const outletSt = powerSt === "now" || headSt === "now" ? "now" : powerSt === "done" ? "done" : "later";
  const spindlePort = isVfd ? (c.id === "slb-lite" ? "SPINDLE" : "RS485") : "SPINDLE";

  return (
    <svg viewBox="0 0 560 380" className="cw-map" role="img" aria-label="Wiring map">
      <defs>
        <pattern id="cw-dots" width="16" height="16" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="rgba(255,255,255,0.05)" />
        </pattern>
      </defs>
      <rect width="560" height="380" fill="url(#cw-dots)" />

      {/* cabos (atrás dos aparelhos) */}
      <path className={`cw-cable is-${linkSt}`} d={link === "usb" ? "M150 205 C 185 205, 190 186, 222 186" : "M150 215 C 185 215, 190 222, 222 222"} />
      <path className={`cw-cable is-${powerSt}`} d="M262 270 L262 306" />
      <path className={`cw-cable cw-cable--ac is-${powerSt}`} d="M292 322 C 380 322, 420 330, 470 330" />
      {c.estop ? <path className={`cw-cable is-${estopSt}`} d="M340 150 L340 104" /> : null}
      {isVfd ? (
        <>
          <path className={`cw-cable is-${headSt}`} d="M388 200 C 410 200, 412 228, 430 228" />
          <path className={`cw-cable cw-cable--thick is-${headSt}`} d="M478 210 L478 136" />
          <path className={`cw-cable cw-cable--ac is-${headSt}`} d="M500 246 C 520 270, 520 300, 506 312" />
        </>
      ) : (
        <>
          {isAuto ? <path className={`cw-cable is-${headSt}`} d="M388 186 C 430 186, 452 160, 464 136" /> : null}
          <path className={`cw-cable cw-cable--ac is-${headSt}`} d="M492 136 C 530 200, 530 280, 506 312" />
        </>
      )}

      {/* computador */}
      <g className="cw-dev">
        <rect x="40" y="150" width="110" height="74" rx="6" />
        <rect x="48" y="158" width="94" height="58" rx="3" className="cw-screen" />
        <path d="M28 232 H162 L154 242 H36 Z" />
        <text x="95" y="264" className="cw-label">Computer</text>
      </g>

      {/* controladora */}
      <g className="cw-dev cw-ctrl">
        <rect x="222" y="150" width="166" height="120" rx="10" />
        <text x="305" y="232" className="cw-label cw-label--in">{c.name}</text>
        <Jack x={222} y={186} side="left" label={c.usb} st={link === "usb" ? linkSt : "later"} />
        {c.ethernet ? <Jack x={222} y={222} side="left" label="ETH" st={link === "ethernet" ? linkSt : "later"} /> : null}
        <Jack x={262} y={270} side="bottom" label="POWER" st={powerSt} />
        {c.estop ? <Jack x={340} y={150} side="top" label="E-STOP" st={estopSt} /> : null}
        {isVfd || isAuto ? <Jack x={388} y={isVfd ? 200 : 186} side="right" label={spindlePort} st={headSt} /> : null}
        <circle cx="374" cy="258" r="4" className={`cw-led ${powerSt === "done" ? "is-on" : ""}`} />
      </g>

      {/* fonte e tomada */}
      <g className="cw-dev">
        <rect x="232" y="306" width="60" height="32" rx="6" />
        <text x="262" y="356" className="cw-label">{c.psu ? `Power supply ${c.psu}` : "Power supply"}</text>
      </g>
      <Outlet x={470} y={312} st={outletSt} />

      {/* E-stop */}
      {c.estop ? (
        <g className="cw-dev">
          <rect x="318" y="74" width="44" height="30" rx="5" />
          <circle cx="340" cy="80" r="12" className={`cw-estop is-${estopSt}`} />
          <text x="340" y="56" className="cw-label">E-stop</text>
        </g>
      ) : null}

      {/* router / spindle e VFD */}
      <g className="cw-dev">
        {isVfd ? (
          <>
            <rect x="460" y="48" width="36" height="88" rx="5" />
            {[0, 1, 2, 3, 4].map((i) => (
              <line key={i} x1="466" x2="490" y1={60 + i * 12} y2={60 + i * 12} className="cw-fin" />
            ))}
            <rect x="430" y="206" width="76" height="40" rx="6" />
            <text x="468" y="231" className="cw-label cw-label--in">VFD</text>
          </>
        ) : (
          <>
            <rect x="462" y="52" width="32" height="84" rx="12" />
            <circle cx="478" cy="74" r="5" className="cw-led is-on" />
          </>
        )}
        <line x1="478" y1="136" x2="478" y2="156" className="cw-bit" />
        <text x="478" y="40" className="cw-label">{isVfd ? "Spindle" : isAuto ? "AutoSpin T1" : "Makita router"}</text>
      </g>
    </svg>
  );
}

function Jack(props: { x: number; y: number; side: "left" | "right" | "bottom" | "top"; label: string; st: string }) {
  const { x, y, side } = props;
  const vert = side === "bottom" || side === "top";
  const w = vert ? 30 : 12;
  const h = vert ? 12 : 22;
  const rx = vert ? x - w / 2 : x - 6;
  const ry = vert ? y - 6 : y - h / 2;
  const tx = side === "left" ? x + 14 : side === "right" ? x - 14 : x;
  const ty = side === "bottom" ? y - 12 : side === "top" ? y + 20 : y + 4;
  return (
    <g className={`cw-jack is-${props.st}`}>
      <rect x={rx} y={ry} width={w} height={h} rx="3" />
      <text x={tx} y={ty} className="cw-port" textAnchor={side === "left" ? "start" : side === "right" ? "end" : "middle"}>
        {props.label}
      </text>
    </g>
  );
}

function Outlet(props: { x: number; y: number; st: string }) {
  return (
    <g className={`cw-dev cw-outlet is-${props.st}`}>
      <rect x={props.x} y={props.y} width="54" height="44" rx="8" />
      <rect x={props.x + 17} y={props.y + 12} width="4" height="10" rx="1" className="cw-slot" />
      <rect x={props.x + 33} y={props.y + 12} width="4" height="10" rx="1" className="cw-slot" />
      <text x={props.x + 27} y={props.y + 62} className="cw-label">Wall outlet</text>
    </g>
  );
}
