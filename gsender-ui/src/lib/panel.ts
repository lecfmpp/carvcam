import { useEffect, useState } from "react";
import { useWorkshop } from "../state/workshop";

/**
 * Modo Painel: interface para a tela touch do gControl (15,6″, 1920×1080, Windows com escala
 * de 125–150%). Liga sozinho quando o dispositivo principal é touch, ou pela opção em Settings,
 * ou com `?panel=1` na URL.
 */
export function detectTouchPanel() {
  if (typeof window === "undefined") return false;
  if (new URLSearchParams(window.location.search).get("panel") === "1") return true;
  return window.matchMedia("(pointer: coarse)").matches;
}

export function isPanelMode(setting = useWorkshop.getState().panel) {
  return setting === "on" || (setting === "auto" && detectTouchPanel());
}

/** Aplica o modo no documento (`html[data-panel="1"]`) e devolve o estado atual. */
export function usePanelMode() {
  const setting = useWorkshop((s) => s.panel);
  const [on, setOn] = useState(() => isPanelMode(setting));
  useEffect(() => {
    const update = () => setOn(isPanelMode(setting));
    update();
    const mq = window.matchMedia("(pointer: coarse)");
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [setting]);
  useEffect(() => {
    if (on) document.documentElement.dataset.panel = "1";
    else delete document.documentElement.dataset.panel;
  }, [on]);
  return on;
}
