import type { PlateSpecInput } from "@carvcam/cam-engine";
import { AlertTriangle, ArrowUp, ChevronDown, ChevronUp, KeyRound, RotateCcw, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useNavigate } from "react-router-dom";
import { getAssistant, getClaudeKey, resetAssistant, setClaudeKey, type AssistantContext, type Check, type ProAction } from "../../assistant";
import { useAccount } from "../../account/pro";
import { machineName } from "../../lib/catalog";
import { useDesign, type Design } from "../../state/design";
import { toast } from "../../state/ui";
import { useActiveMachine, useWorkshop } from "../../state/workshop";
import type { UiIssue } from "./issues";

interface Msg {
  id: number;
  from: "user" | "ai";
  text: string;
  /** What the reply changed, one line each. */
  changes?: string[];
  /** Problems the engine reports that the reply caused and could not fix. */
  remaining?: Check[];
  options?: string[];
  action?: ProAction;
  error?: boolean;
  /** Undo: the design before and after this reply. */
  before?: Design;
  after?: Design;
  undone?: boolean;
}

let nextId = 1;

const ACTION_LABEL: Record<ProAction["feature"], string> = { inlay: "Open the inlay wizard", batch: "Go to Prepare (Batch)", cost: "Go to Prepare (Cost)" };

/**
 * Assistant bar in the bottom-left corner of the stage. It only edits the design (one reply = one
 * undo step); cutting always starts with the user. Hidden unless assistantEnabled().
 */
export function AssistantBar(props: { inputRef: RefObject<HTMLInputElement>; issues: UiIssue[]; onOpenInlay(ids: string[]): void }) {
  const { design, patchSpec, commit, undo } = useDesign();
  const { machine, headId } = useActiveMachine();
  const ownedBits = useWorkshop((s) => s.bits);
  const pro = useAccount().pro;
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [pending, setPending] = useState(false);
  const [key, setKey] = useState(getClaudeKey);
  const [keyDraft, setKeyDraft] = useState("");
  const [showKey, setShowKey] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const suggestions = props.issues.filter((i) => i.apply?.kind === "spec");

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs, pending, open]);

  const add = (m: Omit<Msg, "id">) => setMsgs((all) => [...all, { ...m, id: nextId++ }]);

  const send = async (raw: string) => {
    const message = raw.trim();
    if (!message || pending) return;
    setText("");
    setOpen(true);
    add({ from: "user", text: message });
    setPending(true);
    const before = useDesign.getState().design;
    const ctx: AssistantContext = {
      design: before,
      machine: { id: machine.id, name: machineName(machine), headId, travelX: machine.area[0], travelY: machine.area[1], travelZ: machine.z },
      ownedBits,
      pro,
    };
    try {
      const reply = await getAssistant().send(message, ctx);
      let after: Design | undefined;
      if (reply.design) {
        // The user may have edited the design while the assistant was thinking: don't overwrite that.
        if (useDesign.getState().design !== before) {
          add({ from: "ai", text: "The design changed while I was working, so I didn't apply my edit. Ask again and I'll start from the current design.", error: true });
          return;
        }
        after = reply.design;
        commit(after);
      }
      add({ from: "ai", text: reply.text, changes: reply.changes, remaining: reply.remaining, options: reply.question?.options, action: reply.action, before: after ? before : undefined, after });
    } catch (e) {
      add({ from: "ai", text: `Something went wrong: ${e instanceof Error ? e.message : String(e)}. Your design is unchanged.`, error: true });
    } finally {
      setPending(false);
    }
  };

  const undoReply = (m: Msg) => {
    if (!m.before) return;
    const st = useDesign.getState();
    // Still the assistant's result: step back in the undo history. Edited since: restore the design from before the reply.
    if (st.design === m.after) undo();
    else {
      commit(m.before);
      toast("Restored the design from before that reply (later edits were undone too).");
    }
    setMsgs((all) => all.map((x) => (x.id === m.id ? { ...x, undone: true } : x)));
  };

  const runAction = (a: ProAction) => {
    if (a.feature === "inlay") props.onOpenInlay(a.elementIds);
    else navigate("/prepare");
  };

  const chips = design.spec.type !== "lettering" ? ["Make the text fit", "Add a mounting hole in each corner", "Center everything"] : ["Make it a sign", "Thicker letters"];
  const usingClaude = !!key;

  return (
    <div className={`create-ai ${open ? "is-open" : ""}`}>
      {open ? (
        <div className="create-ai__panel" role="dialog" aria-label="Assistant">
          <div className="create-ai__head">
            <Sparkles size={15} strokeWidth={1.6} color="var(--accent)" />
            <span className="create-ai__title">
              <b>
                Assistant <span className={`badge ${usingClaude ? "badge--mint" : "badge--neutral"}`}>{usingClaude ? "Claude" : "Offline"}</span>
              </b>
              <span className="tiny muted">Edits the design only. Carving always starts with you.</span>
            </span>
            {msgs.length ? (
              <button
                className="create-ai__x"
                aria-label="New chat"
                title="New chat"
                onClick={() => {
                  resetAssistant();
                  setMsgs([]);
                }}
              >
                <RotateCcw size={14} />
              </button>
            ) : null}
            <button className="create-ai__x" aria-label="Close assistant" onClick={() => setOpen(false)}>
              <X size={15} />
            </button>
          </div>
          <div className="create-ai__list" ref={listRef}>
            {suggestions.map((s) => (
              <div key={s.key} className="create-ai__msg create-ai__msg--ai">
                <div>
                  <b>{s.title}.</b> {s.suggestion ? `${s.suggestion}?` : ""}
                </div>
                <div className="create-ai__acts">
                  <button className="btn btn--light btn--sm" onClick={() => s.apply?.kind === "spec" && (patchSpec(() => (s.apply as { spec: PlateSpecInput }).spec), toast("Suggestion applied. Re-checking…"))}>
                    Apply
                  </button>
                </div>
              </div>
            ))}
            {msgs.length === 0 && suggestions.length === 0 ? (
              <div className="create-ai__msg create-ai__msg--ai">
                Tell me what to change: text, font, sizes, raised or engraved, holes, copies, bits or the board.
                {usingClaude ? null : <div className="tiny muted">Offline mode understands simple requests. Connect Claude below for everything else.</div>}
              </div>
            ) : null}
            {msgs.map((m) => (
              <div key={m.id} className={`create-ai__msg create-ai__msg--${m.from}${m.error ? " create-ai__msg--error" : ""}`}>
                <div>{m.text}</div>
                {m.changes?.length ? (
                  <ul className={`create-ai__changes ${m.undone ? "is-undone" : ""}`} aria-label="What changed">
                    {m.changes.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                ) : null}
                {m.remaining?.length && !m.undone ? (
                  <ul className="create-ai__remaining" aria-label="Still to fix">
                    {m.remaining.map((c, i) => (
                      <li key={i}>
                        <AlertTriangle size={12} /> {c.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {m.options?.length || m.action || (m.before && !m.undone) ? (
                  <div className="create-ai__acts">
                    {m.options?.map((o) => (
                      <button key={o} className="btn btn--light btn--sm" disabled={pending} onClick={() => send(o)}>
                        {o}
                      </button>
                    ))}
                    {m.action ? (
                      <button className="btn btn--light btn--sm" onClick={() => runAction(m.action!)}>
                        {ACTION_LABEL[m.action.feature]}
                        {pro ? "" : " · Pro"}
                      </button>
                    ) : null}
                    {m.before && !m.undone ? (
                      <button className="btn btn--outline btn--sm" onClick={() => undoReply(m)}>
                        Undo
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {m.undone ? <div className="tiny muted">Undone.</div> : null}
              </div>
            ))}
            {pending ? <div className="create-ai__msg create-ai__msg--ai create-ai__pending">Updating the design and re-checking it…</div> : null}
          </div>
          <div className="create-ai__chips">
            {chips.map((c) => (
              <button key={c} className="create-add__chip" onClick={() => send(c)}>
                {c}
              </button>
            ))}
          </div>
          <div className="create-ai__key">
            {key ? (
              <>
                <span className="tiny muted">Claude is connected. The key stays in this browser.</span>
                <button
                  className="btn btn--quiet btn--sm"
                  onClick={() => {
                    setClaudeKey("");
                    setKey("");
                  }}
                >
                  Disconnect
                </button>
              </>
            ) : showKey ? (
              <form
                className="create-ai__keyform"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!keyDraft.trim()) return;
                  setClaudeKey(keyDraft);
                  setKey(keyDraft.trim());
                  setKeyDraft("");
                  setShowKey(false);
                  toast("Claude connected. The key stays in this browser.");
                }}
              >
                <input className="create-input" type="password" placeholder="sk-ant-…" aria-label="Anthropic API key" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} autoFocus />
                <button className="btn btn--light btn--sm" type="submit">
                  Connect
                </button>
              </form>
            ) : (
              <>
                <span className="tiny muted">Offline assistant: simple requests only.</span>
                <button className="btn btn--quiet btn--sm" onClick={() => setShowKey(true)}>
                  <KeyRound size={14} />
                  Connect Claude
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
      <form
        className="create-ai__bar"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <Sparkles size={16} strokeWidth={1.6} color="var(--text-3)" />
        <input
          ref={props.inputRef}
          className="create-ai__input"
          placeholder="Ask the assistant, e.g. “engrave the text 3 mm deep”"
          aria-label="Ask the assistant"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.currentTarget.blur();
              setOpen(false);
            }
          }}
        />
        <span className="kbd">⌘K</span>
        <button type="button" className="create-ai__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {suggestions.length ? `${suggestions.length} suggestion${suggestions.length > 1 ? "s" : ""}` : "Open chat"}
          {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
        <button type="submit" className="create-ai__send" aria-label="Send" disabled={!text.trim() || pending}>
          <ArrowUp size={18} strokeWidth={2} />
        </button>
      </form>
    </div>
  );
}
