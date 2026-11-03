// Shared setup for the video captures: starts the app (Vite dev server of an app/ checkout, or uses --url),
// seeds the persisted stores and opens a 1440×900 @2x Playwright page.
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i < 0 ? d : process.argv[i + 1];
};

// Workshop: LongMill MK3 30×30 + AutoSpin T1, a starter bit kit, onboarding done. Keys and ids follow the
// app's stored schema (app/src/state/workshop.ts, version 2).
const BITS = ["flat-1-8-upcut", "flat-1-4-upcut", "flat-1-16-downcut", "flat-1-8-downcut", "vbit-60-15mm", "vbit-30-1-8", "flat-1-8-compression", "surfacing-22mm"];
const WORKSHOP = { state: { onboarded: true, machines: [{ id: "longmill-mk3-30x30", head: "autospin-t1" }], active: 0, bits: BITS, trackDone: ["surface", "depth-test"], mode: "simple", panel: "off", wired: [], link: {}, gsenderAddress: "" }, version: 2 };

// Design: the "Name tags ×6" board (app/src/state/design.ts, version 4) before it's personalised: six linked
// tags that all read NAME in Bebas Neue at 8 mm. The video types the name, picks the font, sizes it and fills
// in one name per copy.
const C = { rows: 3, cols: 2, dx: 78, dy: 36 };
const DESIGN = {
  state: {
    design: {
      name: "Name tags ×6",
      material: "Birch plywood",
      spec: {
        width: 170, height: 120, thickness: 6, material: "plywood", outerCutout: false, frame: 0,
        shapes: [
          { type: "rectangle", x: 46, y: 96, width: 70, height: 28, radius: 5, mode: "part", copies: C },
          { type: "circle", x: 18, y: 96, diameter: 6, mode: "cutout", copies: C },
        ],
        texts: [{ content: "NAME", font: "bebas-neue", size: 8, mode: "engrave", depth: 3, x: 52, y: 96, copies: { ...C } }],
      },
      bit: "vbit-60-15mm",
      bit2: "flat-1-8-upcut",
      useBit2: true,
      tabs: { count: 4, height: 2.1, width: 6, mode: "auto" },
    },
    rev: 1,
  },
  version: 4,
};

async function startApp() {
  const url = arg("url");
  if (url) return { base: url.replace(/\/$/, ""), stop: () => {} };
  const app = path.resolve(arg("app", path.join(__dirname, "../../../../app")));
  if (!fs.existsSync(path.join(app, "package.json"))) throw new Error(`No app at ${app}. Pass --app <checkout>/app or --url http://localhost:5173`);
  const port = 5198;
  const child = spawn("npx", ["vite", "--port", String(port), "--strictPort"], { cwd: app, stdio: ["ignore", "pipe", "inherit"], detached: true });
  await new Promise((ok, fail) => {
    child.stdout.on("data", (d) => /Local:/.test(String(d)) && ok());
    child.on("exit", (c) => fail(new Error(`vite exited ${c}`)));
  });
  return { base: `http://localhost:${port}`, stop: () => { try { process.kill(-child.pid); } catch {} } };
}

async function open(outDir) {
  const server = await startApp();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(([ws, d]) => {
    if (sessionStorage.getItem("cap")) return;
    sessionStorage.setItem("cap", "1");
    localStorage.setItem("carvcam-workshop", ws);
    localStorage.setItem("carvcam-design", d);
    // video only: no simulator fault bar, no blinking caret, no toasts
    document.addEventListener("DOMContentLoaded", () => {
      const st = document.createElement("style");
      st.textContent = ".simbar{display:none!important} *{caret-color:transparent!important}";
      document.head.appendChild(st);
    });
  }, [JSON.stringify(WORKSHOP), JSON.stringify(DESIGN)]);
  // "Send to gSender" talks to a stub that answers like gSender with a controller on COM3
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "content-type": "application/json" };
  await ctx.route(/:8000\/api\//, (route) => {
    const u = route.request().url();
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (u.includes("/api/controllers")) return route.fulfill({ headers: cors, body: JSON.stringify([{ port: "COM3", ready: true, workflow: { state: "idle" }, controller: { type: "grblHAL", state: { status: { activeState: "Idle" } } } }]) });
    if (u.includes("/api/signin")) return route.fulfill({ headers: cors, body: JSON.stringify({ token: "t" }) });
    return route.fulfill({ headers: cors, body: "{}" });
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("pageerror", e.message));
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of fs.readdirSync(outDir)) if (f.endsWith(".jpg")) fs.unlinkSync(path.join(outDir, f));
  const T = {};
  const bb = async (n, loc) => {
    const b = await loc.first().boundingBox();
    if (!b) throw new Error("no bbox " + n);
    T[n] = [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)];
    return T[n];
  };
  const shot = async (n, wait = 250) => {
    await page.waitForTimeout(wait);
    await page.screenshot({ path: path.join(outDir, `${n}.jpg`), type: "jpeg", quality: 86 });
    console.log("shot", n);
  };
  const save = (file) => fs.writeFileSync(file, JSON.stringify(T, null, 1) + "\n");
  const close = async () => {
    await browser.close();
    server.stop();
  };
  return { base: server.base, page, T, bb, shot, save, close };
}
module.exports = { open };
