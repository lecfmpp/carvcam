import { AlertTriangle, CheckCircle2, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { isDesktop } from "../desktop/bridge";
import { GsenderError, normalizeAddress, sendToGsender, type SendResult } from "../lib/gsender";
import { useWorkshop } from "../state/workshop";
import "./gsender.css";

type State = { k: "idle" } | { k: "sending" } | { k: "sent"; r: SendResult } | { k: "error"; message: string; fix?: string; code?: string };

const shortAddr = (a: string) => a.replace(/^https?:\/\//, "");

/** Botão "Send to gSender" do Preparar: carrega o G-code verificado no gSender e diz o próximo passo. */
export function SendToGsender({ name, gcode, disabled }: { name: string; gcode?: string; disabled: boolean }) {
  const address = useWorkshop((s) => s.gsenderAddress);
  const [st, setSt] = useState<State>({ k: "idle" });
  const [editing, setEditing] = useState(false);

  // G-code novo (outra velocidade, abas…): o que foi enviado antes já não é este.
  useEffect(() => setSt((s) => (s.k === "sending" ? s : { k: "idle" })), [gcode]);

  const send = async (addr = address) => {
    if (!gcode) return;
    setSt({ k: "sending" });
    try {
      const r = await sendToGsender({ gcode, name, address: addr, pageProtocol: typeof location === "undefined" ? undefined : location.protocol });
      setSt({ k: "sent", r });
      setEditing(false);
    } catch (e) {
      const ge = e instanceof GsenderError ? e : undefined;
      setSt({ k: "error", message: ge?.message ?? "Couldn't send to gSender.", fix: ge?.fix ?? "Try again, or Download the G-code.", code: ge?.code });
      if (ge && ge.code !== "busy") setEditing(true);
    }
  };

  return (
    <>
      <button className="btn btn--light gs-send" disabled={disabled || !gcode || st.k === "sending"} onClick={() => send()}>
        {st.k === "sending" ? <span className="gs-spinner" aria-hidden /> : st.k === "sent" ? <CheckCircle2 size={16} strokeWidth={2} /> : <Send size={16} strokeWidth={1.75} />}
        {st.k === "sending" ? "Sending to gSender…" : st.k === "sent" ? "Sent to gSender" : "Send to gSender"}
      </button>

      {st.k === "sent" ? (
        <div className="gs-status gs-status--ok" role="status">
          <CheckCircle2 size={16} />
          <span>
            {st.r.port ? (
              <>
                <b>Loaded as {st.r.fileName}.</b> Open gSender and press Start.
              </>
            ) : (
              <>
                <b>Loaded as {st.r.fileName}.</b> Connect your machine in gSender first, then press Start.
              </>
            )}
          </span>
        </div>
      ) : st.k === "error" ? (
        <div className="gs-status gs-status--err" role="alert">
          <AlertTriangle size={16} />
          <span>
            <b>{st.message}</b> {st.fix}
          </span>
        </div>
      ) : null}

      {editing ? (
        <GsenderAddressField
          compact
          onSaved={(a) => {
            void send(a);
          }}
          saveLabel="Save and send"
        />
      ) : (
        <div className="gs-where">
          <span>gSender: {address ? shortAddr(normalizeAddress(address) ?? address) : "this computer"}</span>
          <button className="gs-link" onClick={() => setEditing(true)}>
            Change
          </button>
        </div>
      )}
    </>
  );
}

/** Campo "gSender address" (Settings e Preparar). Vazio = este computador. */
export function GsenderAddressField({ compact, onSaved, saveLabel = "Save" }: { compact?: boolean; onSaved?: (address: string) => void; saveLabel?: string }) {
  const { gsenderAddress, setGsenderAddress } = useWorkshop();
  const [draft, setDraft] = useState(gsenderAddress);
  useEffect(() => setDraft(gsenderAddress), [gsenderAddress]);
  const bad = draft.trim() !== "" && !normalizeAddress(draft);
  const save = () => {
    if (bad) return;
    setGsenderAddress(draft);
    onSaved?.(draft.trim());
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {compact ? null : (
        <span className="field-label" style={{ margin: 0 }}>
          gSender address
        </span>
      )}
      <form
        className="gs-addr"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <input
          className="gs-input"
          aria-label="gSender address"
          placeholder={compact ? "192.168.1.50:8000" : "Empty = this computer, or like 192.168.1.50:8000"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={bad}
        />
        <button className="btn btn--outline btn--sm" type="submit" disabled={bad || (!onSaved && draft.trim() === gsenderAddress)}>
          {!onSaved && draft.trim() === gsenderAddress && gsenderAddress ? "Saved" : saveLabel}
        </button>
      </form>
      <div className="gs-help">
        {bad ? (
          <span style={{ color: "var(--alarm-text)" }}>Type it like 192.168.1.50:8000.</span>
        ) : compact ? (
          <>Turn on Remote Mode in gSender and copy the address it shows. Leave empty for this computer.</>
        ) : (
          <>
            In gSender, open Remote Mode, turn it on and copy the address it shows (port 8000 by default). Works with gSender on this computer or on another one on
            the same network, like a gControl.{isDesktop() ? "" : " In a web browser the connection may be blocked; the CarvCAM desktop app always works."}
          </>
        )}
      </div>
    </div>
  );
}
