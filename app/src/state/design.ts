import "../lib/storageKeys"; // renamed keys are moved before this store reads its saved state
import { migrateLegacyBitId, migrateLegacyProjectId, migrateLegacySpec, type KeepOutZone, type PlateSpecInput } from "@carvcam/cam-engine";
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
  tabs: Tabs;
  /** Reference image to trace over: shown under the design and never cut. */
  tracing?: TracingImage;
  /** Clamps and hold-downs the bit must stay away from, in stock coordinates (X0 Y0 = bottom-left of the board). */
  keepOut?: KeepOutZone[];
  /** Per-job inputs of the cost calculator (Pro). */
  jobCost?: JobCost;
}

/**
 * Holding tabs on the outer cut. Auto: `count` tabs spread evenly by the engine. Manual: one tab at
 * each of `positions` (fractions 0–1 of the outline, counter-clockwise from its lowest-left point;
 * see the engine's cam/tabs.ts), placed by dragging on the canvas.
 */
export interface Tabs {
  count: number;
  /** How tall the tab stays (mm above the bottom of the board). */
  height: number;
  /** Length of wood left along the edge (mm). */
  width: number;
  mode: "auto" | "manual";
  positions?: number[];
}

export const DEFAULT_TAB_WIDTH = 6;
export const MAX_TABS = 12;

/** Tabs for a new project: 4 tabs, 35% of the thickness (3 mm at most), 6 mm wide. */
export const defaultTabs = (thickness: number): Tabs => ({ count: 4, height: Math.min(3, Math.round(thickness * 0.35 * 10) / 10), width: DEFAULT_TAB_WIDTH, mode: "auto" });

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
  tabs: { count: 4, height: 3, width: DEFAULT_TAB_WIDTH, mode: "auto" },
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
  /** Earlier versions of the design (this session only, newest last), for "Undo last change". */
  past: Design[];
  undo(): boolean;
  /** Last design the engine accepted without errors (this session only). */
  lastGood: Design | null;
  markGood(d: Design): void;
  restoreLastGood(): boolean;
}

const MAX_UNDO = 50;

export const useDesign = create<DesignState>()(
  persist(
    (rawSet, get) => {
      // Every design change keeps the version before it, so the user can always step back.
      // Rapid changes (dragging, typing) count as one step.
      let lastPush = 0;
      const set = (p: { design: Design; rev: number }) => {
        const now = Date.now();
        const merge = now - lastPush < 600 && get().past.length > 0;
        lastPush = now;
        rawSet(merge ? p : { ...p, past: [...get().past, get().design].slice(-MAX_UNDO) });
      };
      return {
      design: BLANK,
      rev: 0,
      past: [],
      lastGood: null,
      undo: () => {
        const past = get().past;
        if (!past.length) return false;
        rawSet({ design: past[past.length - 1], past: past.slice(0, -1), rev: get().rev + 1 });
        return true;
      },
      markGood: (d) => {
        if (get().lastGood !== d) rawSet({ lastGood: d });
      },
      restoreLastGood: () => {
        const g = get().lastGood;
        if (!g || g === get().design) return false;
        set({ design: g, rev: get().rev + 1 });
        return true;
      },
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
            tabs: defaultTabs(p.spec.thickness),
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
      setJobCost: (c) => rawSet({ design: { ...get().design, jobCost: c } }),
    };
    },
    {
      name: "carvcam-design",
      version: 4,
      // Undo history and the last good design live only in this session.
      partialize: (s) => ({ design: s.design, rev: s.rev }) as DesignState,
      // v1 (0.1.0) stored the spec with Portuguese field names. v3 adds keep-out zones and job costs
      // (both optional, so older designs load as they are). v4 adds the tab width and Auto/Manual placement.
      migrate: (persisted, version) => {
        const st = persisted as Partial<DesignState>;
        if (version < 2 && st.design) st.design = migrateLegacyDesign(st.design);
        if (version < 3 && st.design) st.design = migrateToV3(st.design);
        if (version < 4 && st.design) st.design = migrateToV4(st.design);
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

/** v3 → v4: tabs get a width (the engine's default, 6 mm) and Auto placement, so the G-code is unchanged. */
export function migrateToV4(d: Design): Design {
  const t = (d.tabs ?? {}) as Partial<Tabs>;
  const count = Number.isFinite(t.count) ? (t.count as number) : 4;
  const height = Number.isFinite(t.height) ? (t.height as number) : 3;
  const width = Number.isFinite(t.width) && (t.width as number) > 0 ? (t.width as number) : DEFAULT_TAB_WIDTH;
  const positions = Array.isArray(t.positions) ? t.positions.filter((x) => Number.isFinite(x)) : undefined;
  const mode = t.mode === "manual" && positions ? "manual" : "auto";
  return { ...d, tabs: { count, height, width, mode, ...(mode === "manual" ? { positions } : {}) } };
}
