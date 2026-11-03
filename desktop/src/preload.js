// Preload (sandboxed: only `electron`'s contextBridge/ipcRenderer are available here, no Node).
// Exposes exactly the CarvcamDesktop interface of gsender-ui/src/desktop/bridge.ts.
"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const arg = (name) => {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : "";
};

/** Copies only plain string fields, so nothing odd crosses into the main process. */
const cleanInit = (init) => {
  if (init == null) return undefined;
  if (typeof init !== "object") throw new TypeError("init must be an object");
  const out = {};
  if (init.method != null) out.method = String(init.method);
  if (init.body != null) out.body = String(init.body);
  if (init.timeoutMs != null) out.timeoutMs = Number(init.timeoutMs);
  if (init.headers != null) {
    out.headers = {};
    for (const [k, v] of Object.entries(init.headers)) out.headers[String(k)] = String(v);
  }
  return out;
};

/** The main process answers { ok, value } or { ok: false, error }. */
const call = async (channel, ...args) => {
  const res = await ipcRenderer.invoke(channel, ...args);
  if (!res || !res.ok) throw new Error((res && res.error) || "Desktop bridge error");
  return res.value;
};

contextBridge.exposeInMainWorld(
  "carvcamDesktop",
  Object.freeze({
    platform: process.platform,
    version: arg("carvcam-version"),
    request: async (url, init) => call("carvcam:request", String(url), cleanInit(init)),
    openExternal: async (url) => {
      await call("carvcam:open-external", String(url));
    },
  }),
);
