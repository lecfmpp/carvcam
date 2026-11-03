// Renders the home page feature clips (clip.html?scene=...) frame by frame and produces, for each one,
// assets/video/feature-<scene>.mp4 (1280x800, no audio, looping) + the .webp poster.
//   node render.mjs [design prepare connect carve]
// Uses the globally installed playwright and the system ffmpeg.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "../../assets/video");
const FPS = 30;
const scenes = process.argv.slice(2).length ? process.argv.slice(2) : ["design", "prepare", "connect", "carve"];

const ffmpeg = (args, input) =>
  new Promise((ok, fail) => {
    const p = spawn("ffmpeg", ["-loglevel", "error", "-y", ...args], { stdio: [input ? "pipe" : "ignore", "inherit", "inherit"] });
    p.on("exit", (c) => (c === 0 ? ok() : fail(new Error("ffmpeg " + c))));
    if (input) input(p.stdin);
  });

const browser = await chromium.launch();
for (const scene of scenes) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1200 } });
  await page.goto(`file://${join(here, "clip.html")}?scene=${scene}`, { waitUntil: "load" });
  await page.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode())]));
  const dur = await page.evaluate(() => window.__duration);
  const frames = Math.round(dur * FPS);
  const file = join(out, `feature-${scene}.mp4`);
  let feed;
  const done = ffmpeg(
    ["-f", "image2pipe", "-framerate", String(FPS), "-i", "-", "-vf", "scale=1280:800", "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", file],
    (stdin) => (feed = stdin),
  );
  for (let f = 0; f < frames; f++) {
    await page.evaluate((s) => {
      window.__timelines.main.seek(s);
    }, f / FPS);
    const buf = await page.screenshot({ type: "jpeg", quality: 92 });
    if (!feed.write(buf)) await new Promise((r) => feed.once("drain", r));
  }
  feed.end();
  await done;
  await ffmpeg(["-i", file, "-frames:v", "1", "-c:v", "libwebp", "-quality", "80", join(out, `feature-${scene}-poster.webp`)]);
  console.log(`${scene}: ${dur.toFixed(2)} s, ${frames} frames -> ${file}`);
  await page.close();
}
await browser.close();
