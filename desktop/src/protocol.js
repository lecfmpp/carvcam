// Serves the built gsender-ui (desktop/renderer, copied from gsender-ui/dist) at app://carvcam/.
// A real scheme (standard + secure) instead of file:// gives the app a proper origin, so
// localStorage, IndexedDB, fetch, module workers and WebCrypto (crypto.subtle) behave like on https.
"use strict";

const { protocol } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const SCHEME = "app";
const HOST = "carvcam";
const ORIGIN = `${SCHEME}://${HOST}`;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".stl": "model/stl",
  ".glb": "model/gltf-binary",
};

/** Must run before app "ready". */
function registerScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, allowServiceWorkers: true, stream: true, codeCache: true },
    },
  ]);
}

/**
 * Content-Security-Policy for the app. Inline <script> blocks of index.html (the boot screen) are
 * allowed by hash, not by 'unsafe-inline'. Network: https for the account (Supabase) and images;
 * gSender on the local network goes through window.carvcamDesktop.request in the main process,
 * so the page itself never needs http://.
 */
function buildCsp(indexHtml) {
  const hashes = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(indexHtml))) {
    hashes.push(`'sha256-${crypto.createHash("sha256").update(m[1], "utf8").digest("base64")}'`);
  }
  return [
    "default-src 'self'",
    `script-src 'self' 'wasm-unsafe-eval' ${hashes.join(" ")}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "media-src 'self' blob: https:",
    "connect-src 'self' https: data: blob:",
    "worker-src 'self' blob:",
    "frame-src https://www.youtube-nocookie.com https://www.youtube.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** Registers the handler for app://carvcam/… (call after "ready"). */
function handleScheme(rendererDir) {
  const root = path.resolve(rendererDir);
  let csp = "default-src 'self'";
  try {
    csp = buildCsp(fs.readFileSync(path.join(root, "index.html"), "utf8"));
  } catch {
    // No build yet: the 404 below explains it.
  }

  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.host !== HOST) return new Response("Not found", { status: 404 });
    let rel = decodeURIComponent(url.pathname);
    if (rel === "/" || rel === "") rel = "/index.html";
    const file = path.resolve(root, "." + rel);
    if (file !== root && !file.startsWith(root + path.sep)) return new Response("Forbidden", { status: 403 });
    try {
      const data = await fs.promises.readFile(file);
      const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
      const headers = { "Content-Type": type, "X-Content-Type-Options": "nosniff" };
      if (type.startsWith("text/html")) headers["Content-Security-Policy"] = csp;
      if (path.basename(file) === "sw.js") headers["Cache-Control"] = "no-cache";
      return new Response(data, { status: 200, headers });
    } catch {
      const hint = rel === "/index.html" ? " (run `npm run renderer` in desktop/ to copy gsender-ui/dist)" : "";
      return new Response(`Not found: ${rel}${hint}`, { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  });
}

module.exports = { SCHEME, HOST, ORIGIN, registerScheme, handleScheme, buildCsp };
