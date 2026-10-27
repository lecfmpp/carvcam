import { migrateLegacyBitId, migrateLegacyProjectId, migrateLegacySpec, type PlateSpecInput } from "@gsender-next/cam-engine";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { materialById, PROJECTS, type Preset } from "../lib/catalog";

/**
 * O projeto em edição: a especificação que vai para o motor de CAM e as escolhas de
 * Preparar (velocidade, abas, segunda fresa). Persistido para sobreviver a recarregar a página.
 */
export interface Design {
  name: string;
  projectId?: string;
  /** Material na interface (MDF, Pine…); o motor recebe o id correspondente em `spec.material`. */
  material: string;
  spec: PlateSpecInput;
  bit: string;
  /** Segunda fresa (recortes e furos), quando ligada. */
  bit2?: string;
  useBit2: boolean;
  preset?: Preset;
  tabs: { count: number; height: number };
  /** Imagem de referência para decalcar: aparece sob o desenho e nunca é cortada. */
  tracing?: TracingImage;
}

export interface TracingImage {
  /** JPEG reduzido (data URL), para caber no armazenamento local. */
  src: string;
  name: string;
  /** Centro e largura em mm da peça; a altura segue `aspect` (altura ÷ largura). */
  x: number;
  y: number;
  width: number;
  aspect: number;
  opacity: number;
  visible: boolean;
}

export const BLANK: Design = {
  name: "Untitled sign",
  material: "MDF",
  spec: { type: "plate", width: 200, height: 120, thickness: 15, material: "mdf", texts: [], edge: { type: "rounded", radius: 8 }, frame: 0 },
  bit: "flat-1-8-upcut",
  useBit2: false,
  tabs: { count: 4, height: 3 },
};

interface DesignState {
  design: Design;
  /** Incrementa a cada mudança na especificação, para a interface saber quando regenerar. */
  rev: number;
  setDesign(d: Design): void;
  patch(p: Partial<Design>): void;
  patchSpec(fn: (s: PlateSpecInput) => PlateSpecInput): void;
  newBlank(): void;
  openProject(id: string): void;
  setMaterial(id: string, thickness?: number): void;
}

export const useDesign = create<DesignState>()(
  persist(
    (set, get) => ({
      design: BLANK,
      rev: 0,
      setDesign: (design) => set({ design, rev: get().rev + 1 }),
      patch: (p) => set({ design: { ...get().design, ...p }, rev: get().rev + 1 }),
      patchSpec: (fn) => set({ design: { ...get().design, spec: fn(structuredClone(get().design.spec)) }, rev: get().rev + 1 }),
      newBlank: () => set({ design: structuredClone(BLANK), rev: get().rev + 1 }),
      openProject: (id) => {
        const p = PROJECTS.find((x) => x.id === id);
        if (!p) return;
        const m = materialById(p.material);
        set({
          design: {
            name: p.title,
            projectId: p.id,
            material: m.id,
            spec: { ...structuredClone(p.spec), material: m.engine },
            bit: p.bits[0],
            bit2: p.bits[1],
            useBit2: p.bits.length > 1,
            preset: p.speed,
            tabs: { count: 4, height: Math.min(3, Math.round(p.spec.thickness * 0.35 * 10) / 10) },
          },
          rev: get().rev + 1,
        });
      },
      setMaterial: (id, thickness) => {
        const m = materialById(id);
        const d = get().design;
        const t = thickness ?? (m.thick.includes(d.spec.thickness) ? d.spec.thickness : m.thick.reduce((a, c) => (Math.abs(c - d.spec.thickness) < Math.abs(a - d.spec.thickness) ? c : a)));
        set({ design: { ...d, material: m.id, spec: { ...d.spec, material: m.engine, thickness: t } }, rev: get().rev + 1 });
      },
    }),
    {
      name: "gsender-design",
      version: 2,
      // v1 (0.1.0) stored the spec with Portuguese field names.
      migrate: (persisted, version) => {
        const st = persisted as Partial<DesignState>;
        if (version < 2 && st.design) st.design = migrateLegacyDesign(st.design);
        return st as DesignState;
      },
    },
  ),
);

/** Design saved by 0.1.0: Portuguese spec fields, bit ids and project id. */
export function migrateLegacyDesign(d: Design): Design {
  return {
    ...d,
    spec: migrateLegacySpec<PlateSpecInput>(d.spec),
    bit: migrateLegacyBitId(d.bit),
    bit2: d.bit2 && migrateLegacyBitId(d.bit2),
    projectId: d.projectId && migrateLegacyProjectId(d.projectId),
  };
}
