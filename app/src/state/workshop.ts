import "../lib/storageKeys"; // renamed keys are moved before this store reads its saved state
import { migrateLegacyBitId, migrateLegacyProjectId } from "@carvcam/cam-engine";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { HEADS, KIT, machineById, type HeadId, type MachineId } from "../lib/catalog";

/** Shop-wide inputs of the cost calculator (Pro). Money in the user's currency. */
export interface ShopCost {
  currency: string;
  laborRate: number;
  machineRate: number;
  marginPct: number;
  fee: "none" | "etsy" | "custom";
  customFeePct: number;
  setupMin: number;
  /** Bit price and life (hours of cutting), by bit id; defaults come from the bit type. */
  bits: Record<string, { cost: number; lifeHours: number }>;
}

export const DEFAULT_SHOP_COST: ShopCost = { currency: "$", laborRate: 25, machineRate: 1.5, marginPct: 50, fee: "none", customFeePct: 0, setupMin: 15, bits: {} };

/** The user's workshop: machines, head, the bits they own and progress on the "Start here" track. */
export interface WorkshopState {
  onboarded: boolean;
  machines: { id: MachineId; head: HeadId }[];
  active: number;
  bits: string[];
  trackDone: string[];
  mode: "simple" | "pro";
  /** Panel mode (gControl touchscreen): automatic, always on or off. */
  panel: "auto" | "on" | "off";
  /** Connections already checked in the "Connect" wizard (key: machine|head|controller|cable). */
  wired: string[];
  /** Wizard choices per machine: controller (MK2 has two) and cable. */
  link: Record<string, { controller: string; link: "usb" | "ethernet" }>;
  cost: ShopCost;

  finishOnboarding(machine: MachineId, head: HeadId, bits: string[]): void;
  skipOnboarding(): void;
  setActive(i: number): void;
  addMachine(id: MachineId, head?: HeadId): void;
  removeMachine(i: number): void;
  setHead(head: HeadId): void;
  toggleBit(id: string): void;
  setBits(ids: string[]): void;
  markDone(trackId: string): void;
  setMode(mode: "simple" | "pro"): void;
  setPanel(panel: "auto" | "on" | "off"): void;
  markWired(key: string): void;
  setLink(machine: string, v: { controller: string; link: "usb" | "ethernet" }): void;
  setCost(p: Partial<ShopCost>): void;
}

export const useWorkshop = create<WorkshopState>()(
  persist(
    (set, get) => ({
      onboarded: false,
      machines: [{ id: "longmill-mk3-30x30", head: "autospin-t1" }],
      active: 0,
      bits: KIT.slice(),
      trackDone: [],
      mode: "simple",
      panel: "auto",
      wired: [],
      link: {},
      cost: DEFAULT_SHOP_COST,

      finishOnboarding: (machine, head, bits) => set({ onboarded: true, machines: [{ id: machine, head }], active: 0, bits }),
      skipOnboarding: () => set({ onboarded: true }),
      setActive: (i) => set({ active: i }),
      addMachine: (id, head) => {
        const m = machineById(id);
        set({ machines: [...get().machines, { id, head: head ?? m.defaultHead }], active: get().machines.length });
      },
      removeMachine: (i) => {
        const machines = get().machines.filter((_, k) => k !== i);
        if (machines.length === 0) return;
        set({ machines, active: Math.min(get().active, machines.length - 1) });
      },
      setHead: (head) => set({ machines: get().machines.map((m, k) => (k === get().active ? { ...m, head } : m)) }),
      toggleBit: (id) => {
        const bits = get().bits;
        set({ bits: bits.includes(id) ? bits.filter((b) => b !== id) : [...bits, id] });
      },
      setBits: (ids) => set({ bits: ids }),
      markDone: (trackId) => {
        if (!get().trackDone.includes(trackId)) set({ trackDone: [...get().trackDone, trackId] });
      },
      setMode: (mode) => set({ mode }),
      setPanel: (panel) => set({ panel }),
      markWired: (key) => {
        if (!get().wired.includes(key)) set({ wired: [...get().wired, key] });
      },
      setLink: (machine, v) => set({ link: { ...get().link, [machine]: v } }),
      setCost: (p) => set({ cost: { ...DEFAULT_SHOP_COST, ...get().cost, ...p } }),
    }),
    {
      name: "carvcam-workshop",
      version: 2,
      // v1 (0.1.0) stored Portuguese bit and project ids.
      migrate: (persisted, version) => {
        const st = persisted as Partial<WorkshopState>;
        if (version < 2) {
          if (st.bits) st.bits = st.bits.map(migrateLegacyBitId);
          if (st.trackDone) st.trackDone = st.trackDone.map(migrateLegacyProjectId);
        }
        return st as WorkshopState;
      },
    },
  ),
);

/** Active machine and head. */
export function useActiveMachine() {
  const { machines, active } = useWorkshop();
  const cur = machines[active] ?? machines[0];
  const machine = machineById(cur.id);
  return { machine, head: HEADS[cur.head], headId: cur.head };
}
