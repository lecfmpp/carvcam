import { create } from "zustand";
import { persist } from "zustand/middleware";
import "../lib/storageKeys";
import type { Design } from "./design";

/** The job step a project was last worked on, so it can reopen there. */
export type ProjectStep = "create" | "prepare" | "position" | "carve";

/** A design saved in My projects (this browser / this computer). */
export interface SavedProject {
  id: string;
  name: string;
  design: Design;
  /** Small JPEG of the simulated cut (data URL), when one was available at save time. */
  thumb?: string;
  updatedAt: number;
  /** Draft until a carve of it finishes; older entries (no status) count as drafts. */
  status?: "draft" | "carved";
  /** Where the user was when it was last saved. */
  step?: ProjectStep;
  carvedAt?: number;
}

interface ProjectsState {
  projects: SavedProject[];
  /** Saves the design (new entry, or the one in `design.savedId`) and returns its id. Throws when storage is full. */
  save(design: Design, thumb?: string, step?: ProjectStep): string;
  /** Marks a saved project as carved (a carve of it ran to the end). */
  markCarved(id: string): void;
  remove(id: string): void;
  duplicate(id: string): string | null;
}

const newId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const useProjects = create<ProjectsState>()(
  persist(
    (set, get) => ({
      projects: [],
      save: (design, thumb, step) => {
        const list = get().projects;
        const existing = design.savedId ? list.find((p) => p.id === design.savedId) : undefined;
        const id = existing?.id ?? newId();
        const entry: SavedProject = {
          id,
          name: design.name,
          design: { ...design, savedId: id },
          thumb: thumb ?? existing?.thumb,
          updatedAt: Date.now(),
          status: existing?.status ?? "draft",
          step: step ?? existing?.step ?? "create",
          carvedAt: existing?.carvedAt,
        };
        const next = existing ? list.map((p) => (p.id === id ? entry : p)) : [entry, ...list];
        // Check it fits before committing (a tracing photo can make a design large).
        localStorage.setItem("carvcam-projects-probe", JSON.stringify(entry));
        localStorage.removeItem("carvcam-projects-probe");
        set({ projects: next });
        return id;
      },
      markCarved: (id) => set({ projects: get().projects.map((p) => (p.id === id ? { ...p, status: "carved", step: "carve", carvedAt: Date.now(), updatedAt: Date.now() } : p)) }),
      remove: (id) => set({ projects: get().projects.filter((p) => p.id !== id) }),
      duplicate: (id) => {
        const p = get().projects.find((x) => x.id === id);
        if (!p) return null;
        const nid = newId();
        const copy: SavedProject = { ...structuredClone(p), id: nid, name: `${p.name} (copy)`, updatedAt: Date.now(), status: "draft", step: "create", carvedAt: undefined };
        copy.design = { ...copy.design, name: copy.name, savedId: nid };
        set({ projects: [copy, ...get().projects] });
        return nid;
      },
    }),
    { name: "carvcam-projects", version: 1 },
  ),
);

/** Small picture of the current simulated cut on the Create board, for the project card. */
export function captureThumb(): string | undefined {
  const c = document.querySelector<HTMLCanvasElement>(".create-piece canvas");
  if (!c || !c.width || !c.height) return undefined;
  try {
    const k = Math.min(1, 360 / Math.max(c.width, c.height));
    const t = document.createElement("canvas");
    t.width = Math.max(1, Math.round(c.width * k));
    t.height = Math.max(1, Math.round(c.height * k));
    t.getContext("2d")!.drawImage(c, 0, 0, t.width, t.height);
    return t.toDataURL("image/jpeg", 0.8);
  } catch {
    return undefined;
  }
}

/** True when the design has nothing on the board yet (a blank new project is not worth saving). */
export const isEmptyDesign = (d: Design) =>
  !d.tracing && !d.spec.texts?.length && !d.spec.shapes?.length && !d.spec.icons?.length && !d.spec.svgs?.length && !d.spec.holes?.length && !d.spec.slots?.length;
