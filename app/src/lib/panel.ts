import { useEffect, useState } from "react";
import { useWorkshop } from "../state/workshop";

/**
 * Panel mode: UI for the gControl touchscreen (15.6″, 1920×1080, Windows at 125–150% scaling).
 * Turns on by itself on a large touchscreen (phones and small tablets get the mobile layout instead),
 * via the option in Settings, or with `?panel=1` in the URL.
 */
const TOUCH_PANEL = "(pointer: coarse) and (min-width: 1000px)";
export function detectTouchPanel() {
  if (typeof window === "undefined") return false;
  if (new URLSearchParams(window.location.search).get("panel") === "1") return true;
  return window.matchMedia(TOUCH_PANEL).matches;
}

export function isPanelMode(setting = useWorkshop.getState().panel) {
  return setting === "on" || (setting === "auto" && detectTouchPanel());
}

/** Applies the mode to the document (`html[data-panel="1"]`) and returns the current state. */
export function usePanelMode() {
  const setting = useWorkshop((s) => s.panel);
  const [on, setOn] = useState(() => isPanelMode(setting));
  useEffect(() => {
    const update = () => setOn(isPanelMode(setting));
    update();
    const mq = window.matchMedia(TOUCH_PANEL);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [setting]);
  useEffect(() => {
    if (on) document.documentElement.dataset.panel = "1";
    else delete document.documentElement.dataset.panel;
  }, [on]);
  return on;
}
