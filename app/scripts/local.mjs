#!/usr/bin/env node
// "npm run local": starts the built CarvCAM (vite preview) and carvcam-bridge together, so the app
// can connect to the machine over USB or Ethernet. "npm run dev" does the same with the dev server.
import { spawn } from "node:child_process";
import { startBridge } from "../bridge/server.mjs";

startBridge();
const dev = process.argv.includes("--dev");
const args = dev ? ["vite"] : ["vite", "preview", "--open"];
const vite = spawn(process.platform === "win32" ? "npx.cmd" : "npx", args, { stdio: "inherit", shell: process.platform === "win32" });
vite.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => vite.kill(sig));
