// Captures every frame of the hero video and the home page feature clips from the current app.
//   node cap.cjs --app <checkout>/app        (starts the app's Vite dev server itself)
//   node cap.cjs --url http://localhost:5173 (uses an app that is already running)
// Writes ../assets/shots/*.jpg (1440×900 @2x), targets.json and ../assets/targets.js (button boxes in app CSS px, which the
// compositions use for the cursor and the clicks). The simulator plays the machine.
const path = require("path");
const { open } = require("./lib.cjs");

(async () => {
  const { base, page: p, bb, shot, save, close, T } = await open(path.join(__dirname, "../assets/shots"));
  const boot = async () => {
    await p.waitForSelector("#boot", { state: "detached", timeout: 90000 });
    await p.waitForTimeout(600);
  };
  const status = () => p.locator(".create-panel, aside").first().innerText().then((t) => t.split("\n").slice(0, 4).join(" | ")).catch(() => "");
  const btn = (name) => p.getByRole("button", { name });
  const prim = () => p.locator(".btn--primary.btn--lg").first();
  const pill = () => p.locator(".pill").first().innerText().catch(() => "");
  const setRange = (loc, v) =>
    loc.evaluate((el, v) => {
      const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      s.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, String(v));
  // waits for the simulated cut to settle after a change ("Re-checking…" gone)
  const settle = async (min = 500) => {
    await p.waitForTimeout(min);
    for (let i = 0; i < 40; i++) {
      if (!(await p.getByText(/Re-checking/).count())) break;
      await p.waitForTimeout(150);
    }
    await p.waitForTimeout(250);
  };

  // ===== A: design (Name tags: type the name, pick the font, size it, one name per copy) =====
  await p.goto(`${base}/#/create`);
  await boot();
  await settle(2500);
  await shot("a0-start");
  T.tagText = [205, 345, 110, 40]; // the first tag's text on the canvas
  await p.mouse.click(260, 365);
  await settle(700);
  await shot("a1-select");
  const content = p.locator(".create-input").first();
  await bb("content", content);
  await content.click();
  for (const [k, t] of [["t1", "A"], ["t2", "AV"], ["t3", "AVA"]]) {
    await content.fill(t);
    await settle(400);
    await shot("a2-" + k);
  }
  const font = p.locator("button", { hasText: "Archivo Black" }).first();
  await bb("fontArchivo", font);
  await font.click();
  await settle(900);
  await shot("a3-font");
  const slider = p.locator('input[type="range"]').first();
  await bb("height", slider);
  console.log("height range", await slider.evaluate((el) => [el.min, el.max, el.value]));
  for (const [k, v] of [["h1", 9], ["h2", 10]]) {
    await setRange(slider, v);
    await settle(600);
    await shot("a3-" + k);
  }
  const copiesBtn = p.locator('button[aria-label="Make copies"]').first();
  await bb("copies", copiesBtn);
  await copiesBtn.click();
  await settle(900);
  await shot("a4-copies");
  const ta = p.locator(".copies-pop textarea");
  await bb("names", ta);
  await ta.click();
  const names = ["AVA", "BEN", "CLARA", "DEV", "ELLA", "FINN"];
  for (let i = 2; i <= names.length; i++) {
    await ta.fill(names.slice(0, i).join("\n"));
    await settle(500);
    await shot("a5-n" + i);
  }
  const done = p.locator(".copies-pop").getByRole("button", { name: "Done", exact: true });
  await bb("copiesDone", done);
  await done.click();
  await settle(700);
  T.blank = [800, 640, 40, 40]; // empty canvas next to the board: clears the selection
  await p.mouse.click(820, 660);
  await p.keyboard.press("Escape");
  await settle(800);
  await shot("a6-done");
  console.log("design:", await status());
  await bb("continue", btn(/Continue to Prepare/));

  // ===== B: prepare (toolpath, 3D, no post-processor) =====
  await btn(/Continue to Prepare/).click();
  await p.getByText(/G-code verified/).first().waitFor({ timeout: 60000 });
  await p.waitForTimeout(1200);
  await shot("b0-prepare");
  await bb("play", btn(/Play toolpath/));
  await bb("btn3d", p.getByRole("button", { name: "3D", exact: true }));
  await bb("contPos", btn(/Continue to Position/));
  await bb("noPost", p.getByText(/No post-processor to pick/));
  await bb("checked", p.getByText(/Everything below is checked/));
  await bb("download", btn(/Download G-code/));
  await bb("pill", btn(/Not connected/));
  await btn(/Play toolpath/).click();
  for (let i = 1; i <= 7; i++) await shot("b1-play" + i, 600);
  await p.waitForTimeout(3500);
  await shot("b1-playend");
  await p.getByRole("button", { name: "3D", exact: true }).click();
  await shot("b2-3d", 1800);

  // ===== C: connect (cables, port, real tests) =====
  await btn(/Not connected/).click();
  await p.waitForTimeout(800);
  await shot("c0-wiz");
  await bb("cables", btn("Show me the cables"));
  await btn("Show me the cables").click();
  await p.waitForTimeout(600);
  let i = 0;
  while (await p.locator(".cw__tick").count()) {
    await shot("c1-step" + i, 300);
    const ticks = await p.locator(".cw__tick input").all();
    for (let j = 0; j < ticks.length; j++) {
      await bb("tick" + i + "_" + j, p.locator(".cw__tick").nth(j));
      await ticks[j].check({ force: true });
      await shot("c1-step" + i + "-t" + j, 150);
    }
    await bb("next" + i, p.locator(".cw__nav .btn--primary"));
    await p.locator(".cw__nav .btn--primary").click();
    await p.waitForTimeout(500);
    i++;
  }
  T.steps = i;
  await p.waitForTimeout(1200);
  // "Choose the USB port" is picked by default: that is what the video shows. The simulator runs underneath.
  await shot("c2-ports");
  await bb("connect", p.locator(".cw__nav .btn--primary"));
  await p.getByText("Simulator", { exact: true }).click();
  await p.locator(".cw__nav .btn--primary").click();
  await p.waitForTimeout(2600);
  await p.evaluate(() => window.__machine?.setState({ speedup: 3 }));
  await shot("c4-verify");
  await bb("moveUp", btn(/Move up 2 mm/));
  await btn(/Move up 2 mm/).click();
  await p.waitForTimeout(600);
  await bb("yes1", btn("Yes").first());
  await btn("Yes").first().click();
  await shot("c5-yes1");
  await bb("spin", btn(/Spin for 3 s/));
  await btn(/Spin for 3 s/).click();
  await shot("c6-spinning", 700);
  await p.waitForTimeout(3000);
  await bb("yes2", btn("Yes").nth(1));
  await btn("Yes").nth(1).click();
  await shot("c7-ok");
  await bb("allgood", btn(/All good/));
  await btn(/All good/).click();
  await p.waitForTimeout(900);
  await shot("c8-connected");
  await bb("pillReady", p.locator(".pill").first());

  // ===== D: position =====
  await p.evaluate(() => (location.hash = "#/position"));
  await p.waitForTimeout(2000);
  await shot("d0-home");
  await bb("prim", prim());
  await prim().click(); // Find home
  await shot("d1-homing", 700);
  await p.waitForTimeout(1800);
  await shot("d1-homed");
  await bb("prim2", prim());
  await prim().click(); // board clamped
  await p.waitForTimeout(900);
  await btn("Use plate").first().evaluate((e) => e.scrollIntoView({ block: "center" }));
  await shot("d2-plate", 600);
  await bb("touch", btn("Use plate").first());
  await btn("Use plate").first().click();
  await shot("d3-touch", 500);
  await bb("measure", prim());
  await prim().click(); // Measure height
  await shot("d4-probing", 700);
  await p.waitForTimeout(1800);
  await shot("d4-probed");
  await bb("setZero", prim());
  await prim().click(); // Set zero here
  await p.waitForTimeout(800);
  await shot("d5-zero");
  await bb("toCarve", prim());
  await prim().click(); // Continue to Carve
  await p.waitForTimeout(1800);
  await shot("d6-check");
  await bb("chkin", btn("It's in"));
  await btn("It's in").click();
  await shot("d6-check-in", 400);

  // ===== E: carve (V-bit, guided bit change, cut-outs, done) =====
  await bb("start", prim());
  await prim().click(); // Start carving
  await p.waitForTimeout(300);
  await p.evaluate(() => window.__machine?.setState({ speedup: 45 }));
  let k = 1;
  for (; k <= 24; k++) {
    await shot("e-run" + String(k).padStart(2, "0"), 380);
    if (/Change|Done/.test(await pill())) break;
  }
  T.runFrames = k;
  await p.evaluate(() => window.__machine?.setState({ speedup: 200 }));
  for (let w = 0; w < 120 && !/Change|Done/.test(await pill()); w++) await p.waitForTimeout(500);
  await p.waitForTimeout(1500);
  await shot("e-change");
  await bb("swapped", prim());
  await prim().click(); // Bit is swapped
  await shot("e-change1", 900);
  await bb("measure2", prim());
  await prim().click(); // Measure height
  await p.waitForTimeout(2500);
  await shot("e-change2");
  await bb("continue2", prim());
  await p.evaluate(() => window.__machine?.setState({ speedup: 12 }));
  await prim().click(); // Done, continue
  let m = 1;
  for (; m <= 12; m++) {
    await shot("e-cut" + String(m).padStart(2, "0"), 450);
    if (/Done/.test(await pill())) break;
  }
  T.cutFrames = m;
  await p.evaluate(() => window.__machine?.setState({ speedup: 200 }));
  for (let w = 0; w < 120 && !/Done/.test(await pill()); w++) await p.waitForTimeout(500);
  await shot("e-done", 2500);
  await bb("doneCard", p.locator("aside, .sidepanel").first());
  save(path.join(__dirname, "targets.json"));
  // the compositions (../index.html, ../../features/clip.html) load the same boxes from here
  require("fs").writeFileSync(path.join(__dirname, "../assets/targets.js"), "// written by capture/cap.cjs: button boxes [x, y, w, h] in app CSS px (1440x900)\nwindow.TARGETS = " + JSON.stringify(T) + ";\n");
  console.log(JSON.stringify(T));
  await close();
})().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
