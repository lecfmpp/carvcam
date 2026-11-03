import { Check, FolderOpen, Plus, RotateCcw, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDesign, type Design } from "../../state/design";
import { captureThumb, useProjects } from "../../state/projects";
import { toast } from "../../state/ui";
import { JobModal } from "../job/Modal";

const isEmpty = (d: Design) => !d.tracing && !d.spec.texts?.length && !d.spec.shapes?.length && !d.spec.icons?.length && !d.spec.svgs?.length && !d.spec.holes?.length && !d.spec.slots?.length;

/** Saves the design to My projects; false (with a message) when the browser storage is full. */
export function saveDesign(d: Design): boolean {
  try {
    const id = useProjects.getState().save(d, captureThumb());
    if (d.savedId !== id) useDesign.getState().markSaved(id);
    return true;
  } catch {
    toast("Couldn't save: this browser's storage is full. Delete old projects or remove the tracing image.", 6000);
    return false;
  }
}

/**
 * Create panel header buttons: Save (then auto-save), Clear the board, New project and My projects.
 * Clear and New ask first; New offers to save an unsaved design.
 */
export function ProjectActions({ onReset }: { onReset(): void }) {
  const nav = useNavigate();
  const design = useDesign((s) => s.design);
  const [ask, setAsk] = useState<null | "clear" | "new">(null);
  const saved = useProjects((s) => !!design.savedId && s.projects.some((p) => p.id === design.savedId));

  // Once saved, every change is saved again (after a short pause, so dragging doesn't write each step).
  useEffect(() => {
    if (!design.savedId) return;
    const t = setTimeout(() => saveDesign(useDesign.getState().design), 1500);
    return () => clearTimeout(t);
  }, [design]);

  // Ctrl/Cmd+S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (saveDesign(useDesign.getState().design)) toast("Saved to My projects. Changes now save automatically.");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const startNew = () => {
    useDesign.getState().newBlank();
    onReset();
    setAsk(null);
    toast("New project: a blank board. Pick the wood and add text or shapes.");
  };
  const clear = () => {
    useDesign.getState().clearBoard();
    onReset();
    setAsk(null);
    toast("Board cleared. Ctrl+Z brings it back.");
  };

  return (
    <>
      <div className="proj-actions">
        {saved ? (
          <span className="proj-actions__saved" title="Saved in My projects; changes save automatically">
            <Check size={14} strokeWidth={2.2} /> Saved
          </span>
        ) : (
          <button className="proj-actions__btn" title="Save to My projects (Ctrl+S)" aria-label="Save to My projects" onClick={() => saveDesign(design) && toast("Saved to My projects. Changes now save automatically.")}>
            <Save size={15} strokeWidth={1.75} />
          </button>
        )}
        <span className="proj-actions__group">
          <button className="proj-actions__btn proj-actions__btn--text" title="Clear the board" onClick={() => (isEmpty(design) ? toast("The board is already empty.") : setAsk("clear"))}>
            <RotateCcw size={14} strokeWidth={1.75} /> Clear
          </button>
          <button className="proj-actions__btn" title="New project" aria-label="New project" onClick={() => (isEmpty(design) && !design.savedId ? startNew() : setAsk("new"))}>
            <Plus size={16} strokeWidth={2} />
          </button>
        </span>
        <button className="proj-actions__btn" title="My projects" aria-label="My projects" onClick={() => nav("/workshop/projects")}>
          <FolderOpen size={15} strokeWidth={1.75} />
        </button>
      </div>

      {ask === "clear" ? (
        <JobModal
          label="Clear the board"
          title="Clear the board?"
          onClose={() => setAsk(null)}
          foot={
            <>
              <button className="btn btn--outline" onClick={() => setAsk(null)}>
                Cancel
              </button>
              <button className="btn btn--danger" onClick={clear}>
                Clear board
              </button>
            </>
          }
        >
          <p className="proj-modal__text">
            Removes every element and the tracing image from “{design.name}”. The board size, wood, bit and settings stay. Ctrl+Z brings it all back.
          </p>
        </JobModal>
      ) : null}

      {ask === "new" ? (
        <JobModal
          label="New project"
          title="Start a new project?"
          onClose={() => setAsk(null)}
          foot={
            saved ? (
              <>
                <button className="btn btn--outline" onClick={() => setAsk(null)}>
                  Cancel
                </button>
                <button className="btn btn--primary" onClick={startNew}>
                  Start new project
                </button>
              </>
            ) : (
              <>
                <button className="btn btn--outline" onClick={() => setAsk(null)}>
                  Cancel
                </button>
                <button className="btn btn--outline" onClick={startNew}>
                  Don't save
                </button>
                <button className="btn btn--primary" onClick={() => saveDesign(design) && startNew()}>
                  Save and start new
                </button>
              </>
            )
          }
        >
          <p className="proj-modal__text">
            {saved
              ? `“${design.name}” is saved in My projects, so you can open it again any time.`
              : `“${design.name}” isn't saved yet. Save it to My projects to come back to it later, or start over without saving.`}
          </p>
        </JobModal>
      ) : null}
    </>
  );
}
