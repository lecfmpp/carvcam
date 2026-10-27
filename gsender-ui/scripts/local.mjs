#!/usr/bin/env node
// "npm run local": abre o CarvCAM já compilado (vite preview) e o carvcam-bridge juntos, para
// conectar na máquina por USB ou Ethernet. "npm run dev" faz o mesmo com o servidor de desenvolvimento.
import { spawn } from "node:child_process";
import { startBridge } from "../bridge/server.mjs";

startBridge();
const dev = process.argv.includes("--dev");
const args = dev ? ["vite"] : ["vite", "preview", "--open"];
const vite = spawn(process.platform === "win32" ? "npx.cmd" : "npx", args, { stdio: "inherit", shell: process.platform === "win32" });
vite.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => vite.kill(sig));
