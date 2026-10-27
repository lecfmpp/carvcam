import { create } from "zustand";
import { persist } from "zustand/middleware";

interface Toast {
  id: number;
  text: string;
}

interface UiState {
  toasts: Toast[];
  toast(text: string, ms?: number): void;
  /** Connection wizard (cables, power and test) is open. */
  connectOpen: boolean;
  openConnect(): void;
  closeConnect(): void;
  /** Element to select when Create opens (an issue's "Select it" from another screen). */
  pendingSel: string | null;
  /** Bumped to ask Create to open the bit menu. */
  bitMenuReq: number;
  request(p: Partial<Pick<UiState, "pendingSel" | "bitMenuReq">>): void;
}

let n = 0;

/** Quick notices at the bottom ("Saved", "Connect the machine first"…). */
export const useUi = create<UiState>()((set, get) => ({
  toasts: [],
  connectOpen: false,
  pendingSel: null,
  bitMenuReq: 0,
  request: (p) => set(p),
  openConnect: () => set({ connectOpen: true }),
  closeConnect: () => set({ connectOpen: false }),
  toast: (text, ms = 2800) => {
    const id = ++n;
    set({ toasts: [...get().toasts.slice(-2), { id, text }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), ms);
  },
}));

export const toast = (text: string, ms?: number) => useUi.getState().toast(text, ms);

/** Opens the "Connect" wizard instead of connecting directly. */
export const openConnect = () => useUi.getState().openConnect();

/** Canvas helpers (rulers and the invisible snapping grid), remembered between sessions. */
interface CanvasPrefs {
  /** null = follow the mode (on in Pro, off in Simple) until the user toggles it. */
  rulers: boolean | null;
  /** Snapping grid step in mm. */
  snapGrid: number;
  setRulers(on: boolean): void;
  setSnapGrid(mm: number): void;
}

export const useCanvasPrefs = create<CanvasPrefs>()(
  persist(
    (set) => ({
      rulers: null,
      snapGrid: 1,
      setRulers: (rulers) => set({ rulers }),
      setSnapGrid: (snapGrid) => set({ snapGrid }),
    }),
    { name: "carvcam-canvas", partialize: (s) => ({ rulers: s.rulers, snapGrid: s.snapGrid }) },
  ),
);
