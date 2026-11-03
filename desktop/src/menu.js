// Application menu. The Edit menu matters on macOS: without it Cmd+C / Cmd+V / Cmd+Z do nothing
// in text fields.
"use strict";

const { app, Menu, shell, dialog, BrowserWindow } = require("electron");

const DOCS_URL = "https://www.carvcam.com/docs/";
const SITE_URL = "https://www.carvcam.com/";

function showAbout() {
  const win = BrowserWindow.getFocusedWindow();
  const detail = [
    `Version ${app.getVersion()}`,
    `Electron ${process.versions.electron} · Chromium ${process.versions.chrome}`,
    "",
    "Signs and plaques CAM for Sienci Labs machines, sending jobs to gSender.",
    "License: GPL-3.0",
  ].join("\n");
  const opts = { type: "info", title: "About CarvCAM", message: "CarvCAM", detail, buttons: ["OK"] };
  return win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts);
}

function buildMenu({ isDev }) {
  const isMac = process.platform === "darwin";
  const about = isMac ? { role: "about" } : { label: "About CarvCAM", click: showAbout };

  /** @type {Electron.MenuItemConstructorOptions[]} */
  const template = [
    ...(isMac
      ? [{ label: app.name, submenu: [{ role: "about" }, { type: "separator" }, { role: "services" }, { type: "separator" }, { role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, { type: "separator" }, { role: "quit" }] }]
      : []),
    { label: "File", submenu: [isMac ? { role: "close" } : { role: "quit" }] },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        ...(isDev || !app.isPackaged ? [{ role: "toggleDevTools" }] : []),
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        { label: "CarvCAM Documentation", click: () => shell.openExternal(DOCS_URL) },
        { label: "carvcam.com", click: () => shell.openExternal(SITE_URL) },
        ...(isMac ? [] : [{ type: "separator" }, about]),
      ],
    },
  ];
  return Menu.buildFromTemplate(template);
}

module.exports = { buildMenu, showAbout, DOCS_URL };
