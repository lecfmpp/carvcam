// Remembers the window size, position and maximized state between launches
// (userData/window-state.json). If the saved spot is off every screen (monitor unplugged), the
// window opens centered instead.
"use strict";

const { app, screen } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULTS = { width: 1440, height: 900 };
const MIN = { width: 960, height: 640 };

const file = () => path.join(app.getPath("userData"), "window-state.json");

function load() {
  try {
    const s = JSON.parse(fs.readFileSync(file(), "utf8"));
    const ok = (n) => Number.isFinite(n);
    if (!ok(s.width) || !ok(s.height)) return { ...DEFAULTS };
    const state = { width: Math.max(MIN.width, s.width), height: Math.max(MIN.height, s.height), maximized: !!s.maximized };
    if (ok(s.x) && ok(s.y)) {
      // Keep the position only if the title bar area is on some display.
      const visible = screen.getAllDisplays().some(({ workArea: a }) => s.x + 100 > a.x && s.x < a.x + a.width - 100 && s.y >= a.y - 10 && s.y < a.y + a.height - 50);
      if (visible) Object.assign(state, { x: s.x, y: s.y });
    }
    return state;
  } catch {
    return { ...DEFAULTS };
  }
}

/** Saves the state of `win` whenever it moves/resizes (debounced) and on close. */
function track(win) {
  let timer = null;
  const save = () => {
    if (win.isDestroyed()) return;
    const b = win.isMaximized() || win.isFullScreen() ? win.getNormalBounds() : win.getBounds();
    try {
      fs.mkdirSync(path.dirname(file()), { recursive: true });
      fs.writeFileSync(file(), JSON.stringify({ ...b, maximized: win.isMaximized() }));
    } catch {
      // Not worth bothering the user about.
    }
  };
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(save, 400);
  };
  win.on("resize", later);
  win.on("move", later);
  win.on("close", () => {
    clearTimeout(timer);
    save();
  });
}

module.exports = { load, track, MIN };
