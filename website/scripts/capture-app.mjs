// Captures the website's app screenshots from a CarvCAM checkout, reproducibly.
//
//   node scripts/capture-app.mjs --app <path to a checkout's app/ folder> [--only a,b] [--url http://localhost:5173] [--convert] [--list]
//
// It starts the app's Vite dev server (the dev build exposes window.__machine, which the carve
// shots use to speed up the simulator), seeds localStorage for each shot (onboarded workshop,
// machine, head, bits; Pro forced on with carvcam-force-pro=1 only for Pro screens), drives the app
// to the screen state and saves a 1440×900 PNG per shot to website/.capture/ (git-ignored).
// --convert then runs the usual image pipeline (scripts/images.mjs) into
// assets/screens/<name>.webp + <name>-800.webp. `--list` prints every shot and what it shows.
//
// Adding a shot: add one entry to SHOTS below: { name, what, ws?, pro?, fresh?, run(h) }.
//   ws       overrides of the seeded workshop ({ machine: { id, head }, bits, extra: {…} })
//   pro      true: force Pro on (it also shows a PRO pill in the top bar, so only for Pro screens)
//   fresh    true: no seeded workshop (onboarding)
//   run(h)   drives the page; h has go(route), nav(route), make(projectTitle), pickRow(text),
//            verified(), connectWizard(), finishConnect(), position(step), primary(), save(), …
// Shot names are the file names the site uses (src/data.mjs, src/docs.mjs, build.mjs).
//
// Needs: playwright (globally installed; chromium.launch() with no options), the app's npm deps
// installed (cd cam-engine && npm install; cd ../app && npm install). No network: the Sienci
// photos ship in app/public/{machines,heads,bits}.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "..");

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i < 0 ? d : process.argv[i + 1];
};
const flag = (k) => process.argv.includes(`--${k}`);
const OUT = resolve(arg("out", join(site, ".capture")));
const APP = resolve(arg("app", join(site, "../app")));
const ONLY = arg("only", "")?.split(",").filter(Boolean);

/* ------------------------------------------------------------------ seed state */

const MK3 = { id: "longmill-mk3-30x30", head: "autospin-t1" };
/** A sensible owner's kit: the Starter set plus a V-bit, a fine downcut and the surfacing bit. */
const BITS = ["flat-1-8-upcut", "flat-1-4-upcut", "flat-1-16-downcut", "flat-1-8-downcut", "vbit-60-15mm", "vbit-30-1-8", "flat-1-8-compression", "surfacing-22mm"];
const workshop = (o = {}) => ({
  state: {
    onboarded: true,
    machines: [o.machine ?? MK3],
    active: 0,
    bits: o.bits ?? BITS,
    trackDone: o.trackDone ?? ["surface", "depth-test"],
    mode: "simple",
    panel: "off",
    wired: o.wired ?? [],
    link: o.link ?? {},
    ...(o.extra ?? {}),
  },
  version: 2,
});

/* ------------------------------------------------------------------ helpers */

function helpers(p, base) {
  const h = {
    p,
    /** Waits for the splash screen to go away. */
    boot: async () => {
      await p.waitForSelector("#boot", { state: "detached", timeout: 90000 });
      await p.waitForTimeout(600);
    },
    go: async (route, wait = 1500) => {
      await p.goto(`${base}/#/${route}`);
      await h.boot();
      await p.waitForTimeout(wait);
    },
    /** In-app navigation (keeps the stores and the simulator). */
    nav: async (route, wait = 1500) => {
      await p.evaluate((r) => (location.hash = `#/${r}`), route);
      await p.waitForTimeout(wait);
    },
    /** Opens a First cuts project by its card title and waits for the Create preview. */
    make: async (title, wait = 2500) => {
      await h.go("workshop", 800);
      await p.locator(".ws-proj", { hasText: title }).getByRole("button", { name: "Make this project" }).click();
      await p.waitForTimeout(wait);
    },
    btn: (name) => p.getByRole("button", { name }),
    /** Opens a panel section (AccItem) by its title. */
    section: async (title) => {
      const head = p.locator(".acc-item, [class*=acc]").filter({ hasText: title }).first();
      await p.getByText(title, { exact: true }).first().click();
      await p.waitForTimeout(600);
      return head;
    },
    /** Connect wizard: ticks every cable step, picks the simulator and connects. Stops at the verify step. */
    connectWizard: async ({ stopAt } = {}) => {
      await p.getByRole("button", { name: /Not connected/ }).click();
      await p.waitForTimeout(700);
      if (stopAt === "start") return;
      await h.btn("Show me the cables").click();
      await p.waitForTimeout(500);
      while (await p.locator(".cw__tick").count()) {
        const title = await p.locator(".cw__title").innerText();
        if (stopAt && stopAt.test?.(title)) return;
        for (const t of await p.locator(".cw__tick input").all()) await t.check({ force: true });
        await p.locator(".cw__nav .btn--primary").click();
        await p.waitForTimeout(450);
      }
      await p.waitForTimeout(800);
      if (stopAt === "port") return;
      await p.getByText("Simulator", { exact: true }).click();
      await p.locator(".cw__nav .btn--primary").click();
      await p.waitForTimeout(2500);
      await p.evaluate(() => window.__machine?.setState({ speedup: 4 }));
    },
    /** Runs the wizard's checks and closes it, connected. */
    finishConnect: async () => {
      await p.getByRole("button", { name: /Move up 2 mm/ }).click();
      await p.waitForTimeout(600);
      await h.btn("Yes").first().click();
      await p.getByRole("button", { name: /Spin for 3 s/ }).click();
      await p.waitForTimeout(1500);
      await h.btn("Yes").nth(1).click();
      await p.waitForTimeout(400);
      await p.getByRole("button", { name: /All good/ }).click();
      await p.waitForTimeout(900);
    },
    /** Position side panel: the big primary button. */
    primary: () => p.locator(".btn--primary.btn--lg").first(),
    /** From the Position screen, connected: home, clamp, touch plate, measure, zero, up to the given point. */
    position: async (until) => {
      const order = ["home", "clamp", "plate", "probe", "zero"];
      const stop = order.indexOf(until);
      await h.primary().click(); // Find home
      await p.waitForTimeout(2500);
      if (stop === 0) return;
      await h.primary().click(); // My board is clamped
      await p.waitForTimeout(800);
      if (stop === 1) return;
      await p.getByRole("button", { name: "Use plate", exact: true }).first().click(); // Z with the touch plate
      await p.waitForTimeout(500);
      if (stop === 2) return;
      await h.primary().click(); // Measure height
      await p.waitForTimeout(2500);
      if (stop === 3) return;
      await h.primary().click(); // Set zero here
      await p.waitForTimeout(800);
    },
    /** Waits until Prepare has a verified toolpath. */
    verified: async () => {
      await p.getByText(/G-code verified/).first().waitFor({ timeout: 60000 });
      await p.waitForTimeout(1200);
    },
    /** Selects a Create element by clicking its row in the panel. */
    pickRow: async (text) => {
      await p.locator(".create-row__head", { hasText: text }).first().click();
      await p.waitForTimeout(700);
    },
    /** Onboarding: pick the LongMill MK3 30×30 card. */
    pickMk3: async () => {
      const card = p.locator(".mcard", { hasText: "LongMill MK3 30×30" }).first();
      await card.scrollIntoViewIfNeeded();
      await card.click();
      await p.waitForTimeout(500);
      return card;
    },
    /** Saves the open design to My projects. */
    save: async () => {
      await p.locator('button[aria-label="Save to My projects"]').click();
      await p.waitForTimeout(700);
    },
    /** Scrolls the page and every scrolling panel back to the top. */
    toTop: async () => {
      await p.evaluate(() => {
        window.scrollTo(0, 0);
        for (const e of document.querySelectorAll("*")) if (e.scrollTop > 0) e.scrollTop = 0;
      });
      await p.waitForTimeout(500);
    },
    hideToasts: () => p.addStyleTag({ content: ".toasts,.toast,[class*=toast]{display:none!important}" }),
  };
  return h;
}

/* ------------------------------------------------------------------ the shots */
// Each entry: name (file name on the site), what (what it shows), optional ws (workshop overrides),
// pro (force Pro on with carvcam-force-pro=1; only where a Pro screen is shown, since it adds a PRO pill to the top bar), viewport, run(h).
const ALTMILL = { id: "altmill-4x4", head: "spindle-2-2kw-er20" };
const MK2 = { id: "longmill-mk2-30x30", head: "makita-rt0701" };

export const SHOTS = [
  // ---------------- start
  {
    name: "splash",
    what: "Loading screen while CarvCAM starts",
    fresh: true,
    run: async ({ p }, base) => {
      // Hold the app's JavaScript so the splash stays, then let its intro animation finish.
      await p.route(/\/src\/main\.tsx|\/assets\/index-.*\.js/, () => {});
      await p.goto(`${base}/#/`, { waitUntil: "commit" });
      await p.waitForTimeout(3000);
      await p.evaluate(() => {
        const f = document.querySelector("#boot .boot-fill");
        if (f) f.style.width = "62%";
        const l = document.querySelector("#boot .boot-label");
        if (l) l.textContent = "Preparing the CAM engine…";
      });
      await p.waitForTimeout(400);
    },
  },
  {
    name: "pick-machine",
    what: "Onboarding 1/3: machine cards with Sienci photos, LongMill MK3 30×30 selected",
    fresh: true,
    run: async (h) => {
      await h.go("workshop/onboarding", 1500);
      const card = await h.pickMk3();
      await card.evaluate((e) => e.scrollIntoView({ block: "center" }));
      await h.p.waitForTimeout(600);
    },
  },
  {
    name: "pick-router",
    what: "Onboarding 2/3: what spins the bit (AutoSpin, Makita, spindles) with photos",
    fresh: true,
    run: async (h) => {
      await h.go("workshop/onboarding", 1500);
      await h.pickMk3();
      await h.btn("Continue").click();
      await h.p.waitForTimeout(1500);
      await h.toTop();
    },
  },
  {
    name: "pick-bits",
    what: "Onboarding 3/3: tick the bits you own, or a whole Sienci set",
    fresh: true,
    run: async (h) => {
      await h.go("workshop/onboarding", 1500);
      await h.pickMk3();
      await h.btn("Continue").click();
      await h.p.waitForTimeout(800);
      await h.btn("Continue").click();
      await h.p.waitForTimeout(1500);
      await h.toTop();
    },
  },
  {
    name: "workshop",
    what: "First cuts: Start here track and project cards (Name tags ×6 and Heart inlay coaster first)",
    run: async (h) => {
      await h.go("workshop", 1000);
      await h.p.waitForFunction(() => document.querySelectorAll(".ws-skel").length === 0, null, { timeout: 60000 }).catch(() => {});
      await h.p.waitForTimeout(1500);
    },
  },
  {
    name: "my-projects",
    what: "My projects: saved designs with thumbnails",
    run: async (h) => {
      for (const t of ["Raised door sign", "Name tags", "Heart inlay coaster", "Pet name plaque"]) {
        await h.make(t, 3500);
        await h.save();
      }
      await h.go("workshop/projects", 2500);
    },
  },
  {
    name: "bit-library",
    what: "My bits › All Sienci bits, Sign Maker set selected, I have this set chip, Official/Estimated badges",
    run: async (h) => {
      await h.go("workshop/bits", 1500);
      await h.p.getByRole("tab", { name: /All Sienci bits/ }).click();
      await h.p.locator("select").first().selectOption({ label: "Sign Maker End Mill Set" });
      await h.p.waitForTimeout(2000);
    },
  },
  {
    name: "settings",
    what: "Settings (scrolled to the end): what spins the bit, touch panel mode, CarvCAM account",
    run: async (h) => {
      await h.go("workshop/settings", 2000);
      await h.p.evaluate(() => {
        const m = document.querySelector(".ws-main");
        m.scrollTop = m.scrollHeight;
      });
      await h.p.waitForTimeout(800);
    },
  },
  {
    name: "account-signin",
    what: "Sign in to CarvCAM dialog (email and password)",
    run: async (h) => {
      await h.go("workshop", 1500);
      await h.p.getByRole("button", { name: /Sign in/ }).first().click();
      await h.p.waitForTimeout(1200);
    },
  },
  // ---------------- create
  {
    name: "design",
    what: "Create: Name tags ×6 (ready to carve, no warnings) with the AVA text selected: font and letter height",
    run: async (h) => {
      await h.make("Name tags", 4500);
      await h.pickRow("AVA");
      await h.p.waitForTimeout(1500);
    },
  },
  {
    name: "name-tags",
    what: "Create: the Name tags ×6 project, nothing selected",
    run: (h) => h.make("Name tags", 4500),
  },
  {
    name: "copies-panel",
    what: "Create: Make copies popover on Name tags ×6 (3×2 grid, one name per copy)",
    run: async (h) => {
      await h.make("Name tags", 3500);
      await h.p.mouse.click(260, 365);
      await h.p.waitForTimeout(600);
      await h.p.locator('button[aria-label="Make copies"]').first().click();
      await h.p.waitForTimeout(1500);
    },
  },
  {
    name: "inlay-wizard",
    pro: true,
    what: "Create: guided V-carve inlay (Pro), step 2 Bits and gaps with the cross-section",
    run: async (h) => {
      await h.make("Coaster with", 3500);
      await h.pickRow("Text ·");
      await h.p.locator('button[aria-label="Guided inlay"]').first().click();
      await h.p.waitForTimeout(1000);
      await h.p.locator(".inlay-steps button").nth(1).click();
      await h.p.waitForTimeout(1500);
    },
  },
  {
    name: "inlay-guide",
    pro: true,
    what: "Create: guided V-carve inlay (Pro), step 3 Cut guide",
    run: async (h) => {
      await h.make("Coaster with", 3500);
      await h.pickRow("Text ·");
      await h.p.locator('button[aria-label="Guided inlay"]').first().click();
      await h.p.waitForTimeout(1000);
      await h.p.locator(".inlay-steps button").nth(2).click();
      await h.p.waitForTimeout(1500);
    },
  },
  {
    name: "inlay-card",
    what: "Create: Heart inlay coaster (pocket part) with the Inlay card at the top of the panel",
    run: (h) => h.make("Heart inlay coaster", 4500),
  },
  {
    name: "element-library",
    what: "Create: element library (icons, frames, dividers)",
    run: async (h) => {
      await h.make("Raised door sign", 2500);
      await h.btn(/Library/).first().click();
      await h.p.waitForTimeout(1500);
    },
  },
  {
    name: "image-to-vector",
    what: "Create: convert a picture to a carvable drawing",
    run: async (h) => {
      await h.make("Coaster with", 2500);
      await h.p.getByText("Upload design", { exact: true }).click();
      await h.p.waitForTimeout(500);
      const chooser = h.p.waitForEvent("filechooser");
      await h.btn(/Choose image/).click();
      await (await chooser).setFiles(h.samplePng);
      await h.p.waitForTimeout(1500);
      await h.btn(/Convert to vector/).click();
      await h.p.waitForTimeout(3000);
    },
  },
  {
    name: "trace-polish",
    what: "Create › Upload design: Convert image to vector with Polish = Medium",
    run: async (h) => {
      await h.make("Coaster with", 2500);
      await h.p.getByText("Upload design", { exact: true }).click();
      await h.p.waitForTimeout(500);
      const chooser = h.p.waitForEvent("filechooser");
      await h.btn(/Choose image/).click();
      await (await chooser).setFiles(h.samplePng);
      await h.p.waitForTimeout(1500);
      await h.btn(/Convert to vector/).click();
      await h.p.waitForTimeout(2000);
      await h.p.locator('[role="dialog"]').getByRole("button", { name: "Medium", exact: true }).click();
      await h.p.waitForTimeout(3000);
    },
  },
  // ---------------- prepare
  {
    name: "prepare",
    what: "Prepare: speed presets from the Sienci table, toolpath preview, Download G-code, no post-processor",
    run: async (h) => {
      await h.make("Raised door sign", 2500);
      await h.nav("prepare", 1000);
      await h.verified();
    },
  },
  {
    name: "setup-sheet",
    what: "Prepare › Time & G-code › Print setup sheet",
    run: async (h) => {
      await h.make("Pet name plaque", 2500);
      await h.nav("prepare", 1000);
      await h.verified();
      await h.p.getByText("Time & G-code", { exact: true }).click();
      await h.p.waitForTimeout(800);
      await h.btn(/Print setup sheet/).click();
      await h.p.waitForTimeout(2000);
    },
  },
  {
    name: "cost-price",
    pro: true,
    what: "Prepare › Batch & pricing: Cost & price (Pro) expanded for 6 name tags, suggested price",
    run: async (h) => {
      await h.make("Name tags", 2500);
      await h.nav("prepare", 1000);
      await h.verified();
      await h.p.getByText("Batch & pricing", { exact: true }).click();
      await h.p.waitForTimeout(700);
      const head = h.p.locator(".cost-head");
      if ((await head.getAttribute("aria-expanded")) !== "true") await head.click();
      await h.p.waitForTimeout(800);
      await head.evaluate((e) => e.scrollIntoView({ block: "start" }));
      await h.p.waitForTimeout(500);
    },
  },
  {
    name: "batch-csv",
    pro: true,
    what: "Prepare › Batch from CSV (Pro): {{name}} plaque, five names pasted, files generated",
    run: async (h) => {
      await h.make("Pet name plaque", 3000);
      await h.pickRow("BISCUIT");
      const inputs = h.p.locator(".create-input");
      for (let i = 0; i < (await inputs.count()); i++) {
        if ((await inputs.nth(i).inputValue().catch(() => "")) === "BISCUIT") {
          await inputs.nth(i).fill("{{name}}");
          break;
        }
      }
      await h.p.waitForTimeout(1500);
      await h.nav("prepare", 1000);
      await h.verified();
      await h.p.getByText("Batch & pricing", { exact: true }).click();
      await h.p.waitForTimeout(700);
      await h.p.locator(".batch-launch").click();
      await h.p.waitForTimeout(800);
      await h.p.locator('textarea[aria-label="CSV text"]').fill(["name", "BISCUIT", "MAPLE", "ZIGGY", "PEPPER", "OTIS"].join("\n"));
      await h.p.waitForTimeout(800);
      await h.btn(/^Generate \d+ files?/).click();
      await h.p.getByRole("button", { name: /^Generate \d+ files?/ }).waitFor({ timeout: 90000 });
      await h.p.waitForTimeout(2000);
    },
  },
  // ---------------- connect wizard
  {
    name: "connect-start",
    what: "Connect wizard, first screen: knows the MK3's SLB-LITE and AutoSpin T1",
    run: async (h) => {
      await h.make("Coaster with", 1500);
      await h.nav("position", 1500);
      await h.connectWizard({ stopAt: "start" });
    },
  },
  {
    name: "connect-power",
    what: "Connect wizard: Power step (LongMill MK2, LongBoard, Makita)",
    ws: { machine: MK2 },
    run: async (h) => {
      await h.make("Coaster with", 1500);
      await h.nav("position", 1500);
      await h.connectWizard({ stopAt: /Power/ });
    },
  },
  {
    name: "connect-spindle",
    what: "Connect wizard: Spindle and VFD step (AltMill 4×4, 2.2 kW spindle)",
    ws: { machine: ALTMILL },
    run: async (h) => {
      await h.make("Coaster with", 1500);
      await h.nav("position", 1500);
      await h.connectWizard({ stopAt: /Spindle|VFD/ });
    },
  },
  {
    name: "connect-ethernet",
    what: "Connect wizard: Ethernet cable step (AltMill, SLB-EXT)",
    ws: { machine: ALTMILL },
    run: async (h) => {
      await h.make("Coaster with", 1500);
      await h.nav("position", 1500);
      await h.p.getByRole("button", { name: /Not connected/ }).click();
      await h.p.waitForTimeout(600);
      await h.p.getByText("Ethernet", { exact: true }).first().click();
      await h.p.waitForTimeout(300);
      await h.btn("Show me the cables").click();
      await h.p.waitForTimeout(500);
      while (await h.p.locator(".cw__tick").count()) {
        if (/Ethernet/.test(await h.p.locator(".cw__title").innerText())) return;
        for (const t of await h.p.locator(".cw__tick input").all()) await t.check({ force: true });
        await h.p.locator(".cw__nav .btn--primary").click();
        await h.p.waitForTimeout(450);
      }
    },
  },
  {
    name: "connect-port",
    what: "Connect wizard: pick the USB port (or the simulator)",
    run: async (h) => {
      await h.make("Coaster with", 1500);
      await h.nav("position", 1500);
      await h.connectWizard({ stopAt: "port" });
    },
  },
  {
    name: "connect-tests",
    what: "Connect wizard: real checks (controller answers, Z moves 2 mm, spindle spins)",
    run: async (h) => {
      await h.make("Coaster with", 1500);
      await h.nav("position", 1500);
      await h.connectWizard();
      await h.p.getByRole("button", { name: /Move up 2 mm/ }).click();
      await h.p.waitForTimeout(600);
      await h.btn("Yes").first().click();
      await h.p.waitForTimeout(500);
    },
  },
  // ---------------- position
  {
    name: "position-home",
    what: "Position: connected, Find home on the live bed view",
    run: async (h) => {
      await h.make("Raised door sign", 1500);
      await h.nav("position", 1500);
      await h.connectWizard();
      await h.finishConnect();
      await h.p.waitForTimeout(800);
    },
  },
  {
    name: "position-clamp",
    what: "Position: place and clamp the board (minimum size shown on the bed)",
    run: async (h) => {
      await h.make("Raised door sign", 1500);
      await h.nav("position", 1500);
      await h.connectWizard();
      await h.finishConnect();
      await h.position("home");
    },
  },
  {
    name: "touch-plate",
    what: "Position: measure the bit with the touch plate",
    run: async (h) => {
      await h.make("Raised door sign", 1500);
      await h.nav("position", 1500);
      await h.connectWizard();
      await h.finishConnect();
      await h.position("plate");
      await h.p.getByRole("button", { name: "Board & clamps" }).click();
      await h.p.waitForTimeout(1000);
    },
  },
  {
    name: "work-zero",
    what: "Position: bit measured, set X/Y zero on the board corner",
    run: async (h) => {
      await h.make("Raised door sign", 1500);
      await h.nav("position", 1500);
      await h.connectWizard();
      await h.finishConnect();
      await h.position("probe");
      await h.p.getByRole("button", { name: "Board & clamps" }).click();
      await h.p.waitForTimeout(1000);
    },
  },
  {
    name: "keep-out",
    what: "Position › Board & clamps: two clamp zones, Clamps & keep-out zones panel open",
    run: async (h) => {
      await h.make("Raised door sign", 1500);
      await h.nav("position", 1500);
      await h.p.getByText("Clamps & keep-out zones", { exact: true }).click();
      await h.p.waitForTimeout(600);
      await h.btn(/Add clamp/).click();
      await h.p.waitForTimeout(400);
      await h.btn(/Add clamp/).click();
      await h.p.waitForTimeout(400);
      await h.p.getByRole("button", { name: "Board & clamps" }).click().catch(() => {});
      await h.p.waitForTimeout(1200);
    },
  },
  // ---------------- carve
  {
    name: "carve-checklist",
    what: "Carve: pre-carve checklist (fits, zero, bit to confirm, AutoSpin speed, tabs)",
    run: async (h) => {
      await h.make("Coaster with", 1500);
      await h.nav("position", 1500);
      await h.connectWizard();
      await h.finishConnect();
      await h.position("zero");
      await h.primary().click(); // Continue to Carve
      await h.p.waitForTimeout(2000);
    },
  },
  {
    name: "carving",
    what: "Carve: running, progress, time left, overrides, live preview",
    run: async (h) => {
      await h.make("Coaster with", 1500);
      await h.nav("position", 1500);
      await h.connectWizard();
      await h.finishConnect();
      await h.position("zero");
      await h.primary().click();
      await h.p.waitForTimeout(1500);
      await h.btn("It's in").click();
      await h.p.waitForTimeout(400);
      await h.primary().click(); // Start carving
      await h.p.waitForTimeout(300);
      await h.p.evaluate(() => window.__machine?.setState({ speedup: 6 }));
      await h.p.waitForTimeout(5000);
    },
  },
  {
    name: "carved",
    what: "Carve: done, 3D view of the finished piece with the finishing steps",
    run: async (h) => {
      await h.make("Coaster with", 1500);
      await h.nav("position", 1500);
      await h.connectWizard();
      await h.finishConnect();
      await h.position("zero");
      await h.primary().click();
      await h.p.waitForTimeout(1500);
      await h.btn("It's in").click();
      await h.p.waitForTimeout(400);
      await h.primary().click();
      await h.p.waitForTimeout(300);
      await h.p.evaluate(() => window.__machine?.setState({ speedup: 200 }));
      for (let k = 0; k < 120; k++) {
        if (/Done/.test(await h.p.locator(".pill").first().innerText().catch(() => ""))) break;
        await h.p.waitForTimeout(1000);
      }
      await h.p.waitForTimeout(800);
      await h.p.getByRole("button", { name: "3D", exact: true }).click().catch(() => {});
      await h.p.waitForTimeout(2500);
    },
  },
];

/* ------------------------------------------------------------------ runner */

async function startServer() {
  const url = arg("url");
  if (url) return { base: url, stop: () => {} };
  if (!existsSync(join(APP, "package.json"))) throw new Error(`No app at ${APP}. Pass --app <checkout>/app`);
  const port = 5199;
  const child = spawn("npx", ["vite", "--port", String(port), "--strictPort"], { cwd: APP, stdio: ["ignore", "pipe", "inherit"], detached: true });
  await new Promise((ok, fail) => {
    child.stdout.on("data", (d) => /Local:/.test(String(d)) && ok());
    child.on("exit", (c) => fail(new Error(`vite exited ${c}`)));
  });
  return { base: `http://localhost:${port}`, stop: () => { try { process.kill(-child.pid); } catch {} } };
}

async function samplePng() {
  // A simple logo to trace: a heart with a star, drawn as SVG and rendered by sharp.
  const sharp = require("sharp");
  const file = join(OUT, "_sample-logo.png");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="540"><rect width="600" height="540" fill="#fff"/><path d="M300 500 C 60 330 20 190 110 110 C 190 40 270 80 300 140 C 330 80 410 40 490 110 C 580 190 540 330 300 500 Z" fill="#e8542a"/><path d="M300 170 l26 62 66 4 -51 42 17 64 -58 -36 -58 36 17 -64 -51 -42 66 -4 z" fill="#fff"/></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
  return file;
}

async function main() {
  if (flag("list")) {
    for (const s of SHOTS) console.log(`${s.name.padEnd(18)} ${s.what}`);
    return;
  }
  await mkdir(OUT, { recursive: true });
  const sample = await samplePng();
  const server = await startServer();
  const browser = await chromium.launch();
  const failed = [];
  try {
    for (const s of SHOTS.filter((s) => !ONLY?.length || ONLY.includes(s.name))) {
      const ctx = await browser.newContext({ viewport: s.viewport ?? { width: 1440, height: 900 }, deviceScaleFactor: 1 });
      const ws = s.fresh ? null : JSON.stringify(workshop(s.ws));
      await ctx.addInitScript(
        ([ws, pro]) => {
          if (sessionStorage.getItem("cap")) return;
          sessionStorage.setItem("cap", "1");
          if (ws) localStorage.setItem("carvcam-workshop", ws);
          if (pro) localStorage.setItem("carvcam-force-pro", "1");
          // Screenshots only: no simulator fault bar, no blinking caret.
          document.addEventListener("DOMContentLoaded", () => {
            const st = document.createElement("style");
            st.textContent = ".simbar{display:none!important} *{caret-color:transparent!important}";
            document.head.appendChild(st);
          });
        },
        [ws, s.pro === true],
      );
      const p = await ctx.newPage();
      p.on("pageerror", (e) => console.log(`  [${s.name}] pageerror: ${e.message}`));
      const h = helpers(p, server.base);
      h.samplePng = sample;
      try {
        await s.run(h, server.base);
        await p.mouse.move(1430, 890); // no hover states
        await p.waitForTimeout(300);
        await p.screenshot({ path: join(OUT, `${s.name}.png`) });
        console.log(`ok   ${s.name.padEnd(18)} ${s.what}`);
      } catch (e) {
        failed.push(s.name);
        await p.screenshot({ path: join(OUT, `_fail-${s.name}.png`) }).catch(() => {});
        console.log(`FAIL ${s.name.padEnd(18)} ${e.message.split("\n")[0]}`);
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.stop();
  }
  await writeFile(join(OUT, "_shots.json"), JSON.stringify(SHOTS.map(({ name, what }) => ({ name, what })), null, 1));
  if (failed.length) console.log(`\n${failed.length} failed: ${failed.join(", ")}`);
  if (flag("convert")) {
    const conv = spawn("node", [join(here, "images.mjs"), OUT], { stdio: "inherit" });
    await new Promise((ok) => conv.on("exit", ok));
  }
  if (failed.length) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
