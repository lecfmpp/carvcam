// CarvCAM for desktop (Electron): a main process that
//  1. starts carvcam-bridge (USB through serialport, and Ethernet on the SLB's port 23) on 127.0.0.1:8765;
//  2. serves the built app (app/) at http://127.0.0.1:4173, always on the same port, because
//     projects and the workshop live in browser storage, which is separate per address;
//  3. opens the window. External links (Sienci store, docs) open in the system browser.
import { app, BrowserWindow, Menu, shell, dialog, session } from "electron";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import updater from "electron-updater";
import { startBridge } from "./bridge/server.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const APP_DIR = join(here, "app");
const PORTS = [4173, 4183, 4193];
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".wasm": "application/wasm", ".ico": "image/x-icon", ".txt": "text/plain" };

// Single window: opening the shortcut again brings up the existing window.
if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
let origin = null;

function serveApp(port) {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url, "http://127.0.0.1");
        let path = normalize(join(APP_DIR, decodeURIComponent(url.pathname)));
        if (!path.startsWith(APP_DIR + sep) && path !== APP_DIR) throw Object.assign(new Error("forbidden"), { code: 403 });
        if ((await stat(path).catch(() => null))?.isDirectory()) path = join(path, "index.html");
        const body = await readFile(path).catch(() => (extname(path) ? null : readFile(join(APP_DIR, "index.html"))));
        if (!body) throw Object.assign(new Error("not found"), { code: 404 });
        res.writeHead(200, { "Content-Type": TYPES[extname(path)] || "application/octet-stream", "Cache-Control": "no-cache" });
        res.end(body);
      } catch (e) {
        res.writeHead(e.code || 500).end(String(e.message));
      }
    });
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

async function start() {
  // Bridge: if the port is already in use (another CarvCAM, or dev mode), carry on without it.
  try {
    const wss = startBridge({ log: (m) => console.log(m) });
    wss.on("error", (e) => console.warn("[bridge]", e.message));
  } catch (e) {
    console.warn("[bridge] not started:", e.message);
  }
  for (const p of PORTS) {
    try {
      await serveApp(p);
      origin = `http://127.0.0.1:${p}`;
      break;
    } catch {
      /* port in use: try the next one */
    }
  }
  if (!origin) {
    dialog.showErrorBox("CarvCAM", "CarvCAM could not start its local server. Close other copies of CarvCAM and try again.");
    app.quit();
    return;
  }

  // Web Serial (alternative to the bridge): Electron doesn't show a port picker by itself, so we
  // pick the first known controller (USB chips used by CNC controllers) and grant access.
  const KNOWN_VIDS = ["2E8A", "16C0", "1D50", "0403", "2341", "0042", "1A86", "10C4", "067B", "03EB", "16D0", "0483"];
  session.defaultSession.on("select-serial-port", (e, ports, _wc, pick) => {
    e.preventDefault();
    // Electron passes vendorId as a string; accept decimal ("9025") or hexadecimal ("2341").
    const known = (v) => !!v && (KNOWN_VIDS.includes(String(v).toUpperCase()) || KNOWN_VIDS.includes(Number(v).toString(16).padStart(4, "0").toUpperCase()));
    const best = ports.find((p) => known(p.vendorId)) || ports[0];
    pick(best ? best.portId : "");
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission, reqOrigin) => permission === "serial" ? reqOrigin.startsWith(origin) : true);
  session.defaultSession.setDevicePermissionHandler((d) => d.deviceType === "serial" && d.origin.startsWith(origin));

  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#111214",
    title: "CarvCAM",
    show: false,
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  win.once("ready-to-show", () => {
    win.maximize();
    win.show();
  });
  // Anything that isn't the app itself opens in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(origin)) {
      e.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });
  win.on("closed", () => (win = null));
  await win.loadURL(origin + "/");

  // Automatic updates from GitHub Releases (installed app only).
  if (app.isPackaged) {
    updater.autoUpdater.checkForUpdatesAndNotify().catch((e) => console.warn("[update]", e.message));
  }
}

app.on("second-instance", () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});
app.on("window-all-closed", () => app.quit());
app.whenReady().then(start);
