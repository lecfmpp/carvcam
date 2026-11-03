// Renders the hero video and the site's copy + poster in one go:
//   node render.mjs
// 1. hyperframes renders index.html to renders/hero-demo.mp4 (1920×1200, 30 fps, CRF 20; master, git-ignored)
// 2. ffmpeg makes assets/video/hero-demo.mp4 (1280×800 H.264, no audio, faststart) and hero-demo-poster.webp
// Needs: npx (hyperframes@0.8.181 is fetched on first run; it uses the system Chrome and ffmpeg).
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, "../../assets/video");
const master = join(here, "renders/hero-demo.mp4");
const POSTER_AT = 30.0; // seconds: the carved name tags, just before the outro

const run = (cmd, args) =>
  new Promise((ok, fail) => {
    const p = spawn(cmd, args, { cwd: here, stdio: "inherit" });
    p.on("exit", (c) => (c === 0 ? ok() : fail(new Error(`${cmd} exited ${c}`))));
  });

mkdirSync(join(here, "renders"), { recursive: true });
await run("npx", ["--yes", "hyperframes@0.8.181", "render", "-o", master, "--fps", "30", "--crf", "20"]);
await run("ffmpeg", ["-loglevel", "error", "-y", "-i", master, "-vf", "scale=1280:800", "-c:v", "libx264", "-preset", "slow", "-crf", "25", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", join(site, "hero-demo.mp4")]);
await run("ffmpeg", ["-loglevel", "error", "-y", "-ss", String(POSTER_AT), "-i", master, "-frames:v", "1", "-vf", "scale=1280:800", join(site, "hero-demo-poster.webp")]);
console.log("hero-demo.mp4 + poster ->", site);
