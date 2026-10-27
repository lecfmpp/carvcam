import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "./video-theater.css";

/**
 * Theater mode: the tutorial video plays large over a dark backdrop so the user can focus on it.
 * Escape, the close button or a click outside the video closes it; the page behind doesn't scroll.
 */
export function VideoTheater(props: { title: string; src: string; range: string; onClose(): void }) {
  const { onClose } = props;
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, [onClose]);

  return createPortal(
    <div className="theater" role="dialog" aria-modal="true" aria-label={props.title} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="theater__stage">
        <header className="theater__head">
          <div>
            <span className="theater__eyebrow">Watch how · {props.range}</span>
            <h3 className="theater__title">{props.title}</h3>
          </div>
          <button ref={closeRef} className="theater__close" aria-label="Close video" onClick={onClose}>
            <X size={20} strokeWidth={1.75} />
          </button>
        </header>
        <div className="theater__frame">
          <iframe title={props.title} src={props.src} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
        </div>
        <p className="theater__hint">Press Esc or click outside the video to go back</p>
      </div>
    </div>,
    document.body,
  );
}
