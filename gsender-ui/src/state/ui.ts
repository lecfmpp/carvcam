import { create } from "zustand";

interface Toast {
  id: number;
  text: string;
}

interface UiState {
  toasts: Toast[];
  toast(text: string, ms?: number): void;
  /** Assistente de conexão (cabos, energia e teste) aberto. */
  connectOpen: boolean;
  openConnect(): void;
  closeConnect(): void;
}

let n = 0;

/** Avisos rápidos no rodapé ("Saved", "Connect the machine first"…). */
export const useUi = create<UiState>()((set, get) => ({
  toasts: [],
  connectOpen: false,
  openConnect: () => set({ connectOpen: true }),
  closeConnect: () => set({ connectOpen: false }),
  toast: (text, ms = 2800) => {
    const id = ++n;
    set({ toasts: [...get().toasts.slice(-2), { id, text }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), ms);
  },
}));

export const toast = (text: string, ms?: number) => useUi.getState().toast(text, ms);

/** Abre o assistente "Connect" em vez de conectar direto. */
export const openConnect = () => useUi.getState().openConnect();
