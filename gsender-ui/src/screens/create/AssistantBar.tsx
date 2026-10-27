import type { PlateSpecInput } from "@gsender-next/cam-engine";
import { ArrowUp, ChevronDown, ChevronUp, KeyRound, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { getAssistant, getClaudeKey, setClaudeKey, type ChatTurn } from "../../assistant";
import { useDesign } from "../../state/design";
import { toast } from "../../state/ui";
import type { UiIssue } from "./issues";

interface Msg extends ChatTurn {
  id: number;
  /** Desfazer: a especificação de antes desta resposta. */
  undo?: PlateSpecInput;
  undone?: boolean;
}

let nextId = 1;

/**
 * Barra do assistente no canto inferior esquerdo do palco. Só edita o desenho;
 * cortar sempre começa com a pessoa.
 */
export function AssistantBar(props: { inputRef: RefObject<HTMLInputElement>; issues: UiIssue[]; bitName: string; materialName: string; machineName: string }) {
  const { design, patchSpec } = useDesign();
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

  const send = async (raw: string) => {
    const message = raw.trim();
    if (!message || pending) return;
    setText("");
    setOpen(true);
    const history = msgs.map(({ from, text }) => ({ from, text }));
    setMsgs((m) => [...m, { id: nextId++, from: "user", text: message }]);
    setPending(true);
    const before = useDesign.getState().design.spec;
    try {
      const reply = await getAssistant().send(
        message,
        { spec: before, material: props.materialName, bitName: props.bitName, machineName: props.machineName, issues: props.issues.map((i) => `${i.level}: ${i.title}`) },
        history,
      );
      if (reply.spec) {
        const next = reply.spec;
        patchSpec(() => next);
      }
      setMsgs((m) => [...m, { id: nextId++, from: "ai", text: reply.text, undo: reply.spec ? before : undefined }]);
    } catch (e) {
      setMsgs((m) => [...m, { id: nextId++, from: "ai", text: `Something went wrong: ${e instanceof Error ? e.message : String(e)}. Your design is unchanged.` }]);
    } finally {
      setPending(false);
    }
  };

  const chips = design.spec.type !== "lettering" ? ["Thicker letters", "Add a heart", "Make it cut-out lettering"] : ["Make it a sign", "Thicker letters"];

  return (
    <div className={`create-ai ${open ? "is-open" : ""}`}>
      {open ? (
        <div className="create-ai__panel" role="dialog" aria-label="Assistant">
          <div className="create-ai__head">
            <Sparkles size={15} strokeWidth={1.6} color="var(--accent)" />
            <span className="create-ai__title">
              <b>Assistant</b>
              <span className="tiny muted">Creates the design only. Carving always starts with you.</span>
            </span>
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
              <div className="create-ai__msg create-ai__msg--ai">Tell me what to change: the text, font, letter size, edge, an icon, holes or the sign size.</div>
            ) : null}
            {msgs.map((m) => (
              <div key={m.id} className={`create-ai__msg create-ai__msg--${m.from}`}>
                <div>{m.text}</div>
                {m.undo && !m.undone ? (
                  <div className="create-ai__acts">
                    <button
                      className="btn btn--outline btn--sm"
                      onClick={() => {
                        const prev = m.undo!;
                        patchSpec(() => prev);
                        setMsgs((all) => all.map((x) => (x.id === m.id ? { ...x, undone: true } : x)));
                      }}
                    >
                      Undo
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
            {pending ? <div className="create-ai__msg create-ai__msg--ai create-ai__pending">Updating the design and re-checking it for the {props.bitName} bit…</div> : null}
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
                <span className="badge badge--mint">Claude connected</span>
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
                <span className="tiny muted">Built-in assistant, works offline.</span>
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
          placeholder="Ask the assistant, e.g. “add a heart”"
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
