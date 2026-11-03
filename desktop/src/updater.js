// Auto-update through GitHub Releases (electron-updater). Off unless the build was made with a
// publish config (CARVCAM_UPDATES=1 in electron-builder.config.js), which is what writes
// resources/app-update.yml into the package. CARVCAM_DISABLE_UPDATES=1 turns it off at runtime.
// On macOS updates only install on a signed build (Squirrel.Mac checks the signature).
"use strict";

const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

function start() {
  if (!app.isPackaged || process.env.CARVCAM_DISABLE_UPDATES === "1") return;
  if (!fs.existsSync(path.join(process.resourcesPath, "app-update.yml"))) return;
  let autoUpdater;
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch {
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("error", (err) => console.warn("[updater]", err?.message || err));
  const check = () => autoUpdater.checkForUpdatesAndNotify().catch((err) => console.warn("[updater]", err?.message || err));
  setTimeout(check, 10_000);
  setInterval(check, 6 * 60 * 60 * 1000).unref?.();
}

module.exports = { start };
