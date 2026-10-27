import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Job-screen modal: dimmed backdrop, card with title and close, Escape closes. */
export function JobModal(props: { title: ReactNode; eyebrow?: ReactNode; label: string; onClose(): void; children: ReactNode; foot?: ReactNode; wide?: boolean }) {
  const { onClose } = props;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="jmodal" role="dialog" aria-modal="true" aria-label={props.label} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`jmodal__card${props.wide ? " jmodal__card--wide" : ""}`}>
        <header className="jmodal__head">
          <div>
            {props.eyebrow ? <div className="jmodal__eyebrow">{props.eyebrow}</div> : null}
            <h3 className="jmodal__title">{props.title}</h3>
          </div>
          <button className="jmodal__close" aria-label="Close" onClick={onClose}>
            <X size={18} strokeWidth={1.5} />
          </button>
        </header>
        <div className="jmodal__body">{props.children}</div>
        {props.foot ? <footer className="jmodal__foot">{props.foot}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
