// CarvCAM desktop: main process.
// Loads the built gsender-ui from app://carvcam/ (or the Vite dev server with CARVCAM_DEV_URL),
// locks the window down (context isolation, sandbox, no Node in the page, no navigation away) and
// answers the two bridge calls from the preload: request (to gSender on the local network) and
// openExternal (system browser).
"use strict";

const { app, BrowserWindow, Menu, ipcMain, shell, session } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const { ORIGIN, registerScheme, handleScheme } = require("./protocol.js");
const { isExternalUrl } = require("./allowlist.js");
const { desktopRequest } = require("./http-request.js");
const windowState = require("./window-state.js");
const { buildMenu } = require("./menu.js");

const DEV_URL = process.env.CARVCAM_DEV_URL || "";
const isDev = !!DEV_URL;
const START_URL = isDev ? DEV_URL : `${ORIGIN}/index.html`;
const APP_ORIGIN = new URL(START_URL).origin;
const RENDERER_DIR = path.join(__dirname, "..", "renderer");

app.setName("CarvCAM");
if (process.platform === "win32") app.setAppUserModelId("com.carvcam.app");

registerScheme();

// One CarvCAM at a time: a second launch focuses the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });
  app.whenReady().then(start);
}

/** True when an IPC call comes from our own page (not an iframe such as a YouTube embed). */
function fromApp(event) {
  const frame = event.senderFrame;
  if (!frame || frame.parent) return false;
  try {
    return new URL(frame.url).origin === APP_ORIGIN;
  } catch {
    return false;
  }
}

function openExternalSafe(url) {
  if (!isExternalUrl(url)) return false;
  shell.openExternal(url).catch(() => undefined);
  return true;
}

function createWindow() {
  const state = windowState.load();
  const icon = path.join(__dirname, "..", "build", "icon.png");
  const win = new BrowserWindow({
    ...state,
    minWidth: windowState.MIN.width,
    minHeight: windowState.MIN.height,
    show: false,
    backgroundColor: "#111214",
    title: "CarvCAM",
    icon: process.platform === "linux" && fs.existsSync(icon) ? icon : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: false,
      additionalArguments: [`--carvcam-version=${app.getVersion()}`],
    },
  });
  windowState.track(win);
  if (state.maximized) win.maximize();
  win.once("ready-to-show", () => win.show());

  const wc = win.webContents;
  // window.open / target=_blank: http(s) goes to the system browser (e.g. carvcam.com/activate
  // for sign-in), nothing ever opens inside the app.
  wc.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url);
    return { action: "deny" };
  });
  // Navigating the main window away from the app is never allowed; external links go to the browser.
  const guard = (event, url) => {
    let origin = "";
    try {
      origin = new URL(url).origin;
    } catch {
      /* invalid */
    }
    if (origin === APP_ORIGIN) return;
    event.preventDefault();
    openExternalSafe(url);
  };
  wc.on("will-navigate", guard);
  wc.on("will-redirect", guard);
  wc.on("will-attach-webview", (event) => event.preventDefault());

  win.loadURL(START_URL);
  if (isDev) wc.openDevTools({ mode: "detach" });
  return win;
}

function start() {
  handleScheme(RENDERER_DIR);

  // The app needs no camera, microphone, location, notifications, etc. Clipboard writes and
  // fullscreen are harmless and used by the UI.
  const allowed = new Set(["clipboard-sanitized-write", "fullscreen"]);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));

  // Results travel as { ok, value | error } so the page gets a plain Error message (an exception
  // thrown here would arrive as "Error invoking remote method …").
  const answer = (fn) => async (event, ...args) => {
    if (!fromApp(event)) return { ok: false, error: "Not allowed" };
    try {
      return { ok: true, value: await fn(...args) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  };
  ipcMain.handle("carvcam:request", answer((url, init) => desktopRequest(url, init || {})));
  ipcMain.handle(
    "carvcam:open-external",
    answer((url) => {
      if (!openExternalSafe(url)) throw new Error("Only http(s) and mailto links can be opened");
    }),
  );

  Menu.setApplicationMenu(buildMenu({ isDev }));
  if (process.platform === "darwin") {
    app.setAboutPanelOptions({ applicationName: "CarvCAM", applicationVersion: app.getVersion(), copyright: "GPL-3.0", website: "https://www.carvcam.com" });
  }

  createWindow();
  if (!isDev) require("./updater.js").start();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

// Any other webContents (e.g. a YouTube iframe opening a popup) also never gets new windows.
app.on("web-contents-created", (_e, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url);
    return { action: "deny" };
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
