import { create } from "zustand";
import { persist } from "zustand/middleware";
import { HEADS, KIT, machineById, type HeadId, type MachineId } from "../lib/catalog";

/** A oficina da pessoa: máquinas, cabeçote, fresas que ela tem e progresso na trilha "Start here". */
export interface WorkshopState {
  onboarded: boolean;
  machines: { id: MachineId; head: HeadId }[];
  active: number;
  bits: string[];
  trackDone: string[];
  mode: "simple" | "pro";

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
    }),
    { name: "gsender-workshop", version: 1 },
  ),
);

/** Máquina e cabeçote ativos. */
export function useActiveMachine() {
  const { machines, active } = useWorkshop();
  const cur = machines[active] ?? machines[0];
  const machine = machineById(cur.id);
  return { machine, head: HEADS[cur.head], headId: cur.head };
}
