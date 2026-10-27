import { migrateLegacyBitId, migrateLegacyProjectId, migrateLegacySpec, type KeepOutZone, type PlateSpecInput } from "@gsender-next/cam-engine";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { materialById, PROJECTS, type Preset } from "../lib/catalog";

/**
 * The project being edited: the spec sent to the CAM engine plus the Prepare choices
 * (speed, tabs, second bit). Persisted so it survives a page reload.
 */
export interface Design {
  name: string;
  projectId?: string;
  /** Material as shown in the UI (MDF, Pine…); the engine gets the matching id in `spec.material`. */
  material: string;
  spec: PlateSpecInput;
  bit: string;
  /** Second bit (cutouts and holes), when enabled. */
  bit2?: string;
  useBit2: boolean;
  preset?: Preset;
  tabs: { count: number; height: number };
  /** Reference image to trace over: shown under the design and never cut. */
  tracing?: TracingImage;
  /** Clamps and hold-downs the bit must stay away from, in stock coordinates (X0 Y0 = bottom-left of the board). */
  keepOut?: KeepOutZone[];
  /** Per-job inputs of the cost calculator (Pro). */
  jobCost?: JobCost;
}

/** Cost inputs that belong to one job (shop-wide rates live in the workshop store). */
export interface JobCost {
  boardCost: number;
  /** Board the parts come from, mm; defaults to the stock size when unset. */
  boardWidth?: number;
  boardHeight?: number;
  wastePct: number;
  quantity: number;
  finishingMin: number;
  extras: number;
}

export const DEFAULT_JOB_COST: JobCost = { boardCost: 12, wastePct: 10, quantity: 1, finishingMin: 10, extras: 0 };

export interface TracingImage {
  /** Downscaled JPEG (data URL), so it fits in local storage. */
  src: string;
  name: string;
  /** Center and width in mm on the stock; height follows `aspect` (height ÷ width). */
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
  /** Bumped on every spec change, so the UI knows when to regenerate. */
  rev: number;
  setDesign(d: Design): void;
  patch(p: Partial<Design>): void;
  patchSpec(fn: (s: PlateSpecInput) => PlateSpecInput): void;
  newBlank(): void;
  openProject(id: string): void;
  setMaterial(id: string, thickness?: number): void;
  setKeepOut(zones: KeepOutZone[]): void;
  /** Saves cost inputs without counting as a design change (no regeneration, checklist kept). */
  setJobCost(c: JobCost): void;
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
      setKeepOut: (zones) => set({ design: { ...get().design, keepOut: zones }, rev: get().rev + 1 }),
      setJobCost: (c) => set({ design: { ...get().design, jobCost: c } }),
    }),
    {
      name: "gsender-design",
      version: 3,
      // v1 (0.1.0) stored the spec with Portuguese field names. v3 adds keep-out zones and job costs
      // (both optional, so older designs load as they are).
      migrate: (persisted, version) => {
        const st = persisted as Partial<DesignState>;
        if (version < 2 && st.design) st.design = migrateLegacyDesign(st.design);
        if (version < 3 && st.design) st.design = migrateToV3(st.design);
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

/** v2 → v3: keep everything; drop a malformed keepOut list if one ever got in. */
export function migrateToV3(d: Design): Design {
  const keepOut = Array.isArray(d.keepOut) ? d.keepOut.filter((z) => z && [z.x, z.y, z.width, z.height].every(Number.isFinite)) : undefined;
  return { ...d, keepOut };
}
