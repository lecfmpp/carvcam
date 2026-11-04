import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useDesign } from "../state/design";
import { captureThumb, isEmptyDesign, useProjects, type ProjectStep } from "../state/projects";
import { toast } from "../state/ui";

const STEPS: Record<string, ProjectStep> = { "/create": "create", "/prepare": "prepare", "/position": "position", "/carve": "carve" };

/** Saves the open design to My projects; false when the browser storage is full. */
export function saveNow(step?: ProjectStep): boolean {
  const d = useDesign.getState().design;
  try {
    const id = useProjects.getState().save(d, captureThumb(), step);
    if (d.savedId !== id) useDesign.getState().markSaved(id);
    return true;
  } catch {
    return false;
  }
}

/**
 * Keeps the open project in My projects without the user asking: it is saved as a draft as soon as
 * there is something on the board, then again after every change and every step (Create, Prepare,
 * Position, Carve), so closing the app never loses work and the project reopens where it was left.
 */
export function Autosave() {
  const { pathname } = useLocation();
  const step = STEPS[pathname];
  const design = useDesign((s) => s.design);
  const warned = useRef(false);
  const announced = useRef<string | null>(null);

  useEffect(() => {
    if (!step) return;
    const d = useDesign.getState().design;
    if (!d.savedId && isEmptyDesign(d)) return;
    const isNew = !d.savedId || !useProjects.getState().projects.some((p) => p.id === d.savedId);
    // A new step is saved right away; edits wait for a short pause so dragging doesn't write each move.
    const t = setTimeout(
      () => {
        if (saveNow(step)) {
          warned.current = false;
          const id = useDesign.getState().design.savedId ?? null;
          if (isNew && id && announced.current !== id) {
            announced.current = id;
            toast("Saved as a draft in My projects. Every change saves by itself.");
          }
        } else if (!warned.current) {
          warned.current = true;
          toast("Couldn't save: this browser's storage is full. Delete old projects or remove the tracing image.", 6000);
        }
      },
      isNew ? 300 : 1200,
    );
    return () => clearTimeout(t);
  }, [design, step]);

  // Leaving the job steps (to the workshop, say) or closing the window: save the last edits at once.
  const lastStep = useRef(step);
  useEffect(() => {
    const prev = lastStep.current;
    lastStep.current = step;
    if (!step && prev && useDesign.getState().design.savedId) saveNow(prev);
  }, [step]);
  useEffect(() => {
    const flush = () => {
      const s = lastStep.current;
      const d = useDesign.getState().design;
      if (s && (d.savedId || !isEmptyDesign(d))) saveNow(s);
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  return null;
}
