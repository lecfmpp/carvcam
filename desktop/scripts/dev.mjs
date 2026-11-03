// npm run dev: starts the Vite dev server of gsender-ui (hot reload) and opens Electron on it.
// Extra arguments go to Electron (e.g. npm run dev -- --no-sandbox when running as root).
// If something already answers on CARVCAM_DEV_URL (default http://localhost:5173), uses it.
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const url = process.env.CARVCAM_DEV_URL || "http://localhost:5173/";
const isWin = process.platform === "win32";

const up = () => fetch(url).then((r) => r.ok, () => false);

let vite = null;
if (!(await up())) {
  vite = spawn(isWin ? "npx.cmd" : "npx", ["vite", "--port", new URL(url).port || "5173", "--strictPort"], {
    cwd: join(here, "..", "..", "gsender-ui"),
    stdio: "inherit",
    shell: isWin,
  });
  const deadline = Date.now() + 60_000;
  while (!(await up())) {
    if (Date.now() > deadline || vite.exitCode !== null) {
      console.error(`Vite dev server did not start at ${url}`);
      vite.kill();
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}

const electronBin = (await import("electron")).default;
const app = spawn(electronBin, [join(here, ".."), ...process.argv.slice(2)], { stdio: "inherit", env: { ...process.env, CARVCAM_DEV_URL: url } });
app.on("exit", (code) => {
  vite?.kill();
  process.exit(code ?? 0);
});
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => app.kill(sig));
