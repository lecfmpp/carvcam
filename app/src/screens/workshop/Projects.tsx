import { Copy, FolderOpen, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { materialById } from "../../lib/catalog";
import { useDesign } from "../../state/design";
import { useProjects, type SavedProject } from "../../state/projects";
import { toast } from "../../state/ui";
import { JobModal } from "../job/Modal";

const when = (t: number) => {
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

const count = (p: SavedProject) => {
  const s = p.design.spec;
  return (s.texts?.length ?? 0) + (s.shapes?.length ?? 0) + (s.icons?.length ?? 0) + (s.svgs?.length ?? 0);
};

/** My projects: designs saved in this browser. Open, duplicate, delete, or start a new one. */
export function Projects() {
  const nav = useNavigate();
  const projects = useProjects((s) => s.projects);
  const current = useDesign((s) => s.design.savedId);
  const [del, setDel] = useState<SavedProject | null>(null);

  const open = (p: SavedProject) => {
    useDesign.getState().setDesign(structuredClone(p.design));
    nav("/create");
  };
  const startNew = () => {
    useDesign.getState().newBlank();
    nav("/create");
  };

  return (
    <div className="ws-page ws-page--wide" style={{ gap: 28 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20 }}>
        <div className="ws-head">
          <h1 className="ws-title ws-title--sm">My projects</h1>
          <p className="ws-lead ws-lead--sm">Designs you saved. Once a design is saved, every change saves by itself. They're kept in this browser on this computer.</p>
        </div>
        <button className="btn btn--primary" onClick={startNew}>
          <Plus size={16} strokeWidth={2} /> New project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="proj-empty">
          <FolderOpen size={28} strokeWidth={1.5} color="var(--text-3)" />
          <div style={{ font: "600 16px var(--font)" }}>No saved projects yet</div>
          <div className="muted" style={{ maxWidth: 440, textAlign: "center" }}>
            In Create, press the save button next to the design name (or Ctrl+S). Your project shows up here and keeps saving as you work.
          </div>
          <button className="btn btn--outline" onClick={() => nav("/create")}>
            Go to Create
          </button>
        </div>
      ) : (
        <div className="ws-projects">
          {projects.map((p) => {
            const mat = materialById(p.design.material);
            const s = p.design.spec;
            const ar = s.width / Math.max(1, s.height);
            return (
              <article key={p.id} className="ws-proj">
                <button className="ws-proj-pv proj-card__pv" onClick={() => open(p)} aria-label={`Open ${p.name}`}>
                  {p.thumb ? (
                    <img src={p.thumb} alt="" style={{ maxWidth: "86%", maxHeight: 150, borderRadius: 6, boxShadow: "0 16px 24px rgba(0,0,0,.45)" }} />
                  ) : (
                    <span style={{ width: ar >= 1.6 ? 220 : 130 * ar, height: ar >= 1.6 ? 220 / ar : 130, background: mat.face, borderRadius: 6, boxShadow: "0 16px 24px rgba(0,0,0,.45)" }} />
                  )}
                  {current === p.id ? <span className="proj-card__open">Open now</span> : null}
                </button>
                <div className="ws-proj-body">
                  <div className="ws-proj-title">{p.name}</div>
                  <div className="tiny muted">
                    {s.width} × {s.height} × {s.thickness} mm {mat.id} · {count(p)} element{count(p) === 1 ? "" : "s"} · saved {when(p.updatedAt)}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
                    <button className="btn btn--primary btn--sm" onClick={() => open(p)}>
                      Open
                    </button>
                    <button
                      className="btn btn--outline btn--sm"
                      onClick={() => {
                        useProjects.getState().duplicate(p.id);
                        toast(`Copied “${p.name}”.`);
                      }}
                    >
                      <Copy size={14} /> Duplicate
                    </button>
                    <button className="btn btn--outline btn--sm" aria-label={`Delete ${p.name}`} title="Delete" onClick={() => setDel(p)} style={{ marginLeft: "auto" }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {del ? (
        <JobModal
          label="Delete project"
          title={`Delete “${del.name}”?`}
          onClose={() => setDel(null)}
          foot={
            <>
              <button className="btn btn--outline" onClick={() => setDel(null)}>
                Cancel
              </button>
              <button
                className="btn btn--danger"
                onClick={() => {
                  useProjects.getState().remove(del.id);
                  // The open design stays on the board, but no longer saves to the deleted entry.
                  if (useDesign.getState().design.savedId === del.id) useDesign.getState().markSaved(undefined);
                  setDel(null);
                  toast("Project deleted.");
                }}
              >
                Delete
              </button>
            </>
          }
        >
          <p className="proj-modal__text">It's removed from My projects for good. G-code files you downloaded aren't affected.</p>
        </JobModal>
      ) : null}
    </div>
  );
}
