// The main-process side of `window.carvcamDesktop.request`: an HTTP call to gSender that is not
// subject to the page's CORS rules, limited to loopback / private-network hosts. Uses Node's fetch
// (not Chromium's network stack), so a system proxy never sees shop-network traffic. No Electron
// imports: tested with node:test.
"use strict";

const { checkRequestUrl, ALLOWED_METHODS } = require("./allowlist.js");

const DEFAULT_TIMEOUT_MS = 8000;
const MAX_TIMEOUT_MS = 120000;
/** G-code for a large sign can be a few MB; 64 MB is far above any real job. */
const MAX_REQUEST_BODY = 64 * 1024 * 1024;
const MAX_RESPONSE_BODY = 32 * 1024 * 1024;
/** Hop-by-hop or connection-level headers the page must not set. */
const BLOCKED_HEADERS = new Set(["host", "connection", "content-length", "transfer-encoding", "keep-alive", "upgrade", "te", "trailer", "proxy-authorization", "proxy-connection"]);

/**
 * @param {string} rawUrl
 * @param {{method?: string, headers?: Record<string,string>, body?: string, timeoutMs?: number}} [init]
 * @returns {Promise<{status: number, headers: Record<string,string>, body: string}>}
 */
async function desktopRequest(rawUrl, init = {}) {
  const url = checkRequestUrl(rawUrl);
  const method = String(init.method || "GET").toUpperCase();
  if (!ALLOWED_METHODS.has(method)) throw new Error(`Method not allowed: ${method}`);

  const headers = {};
  for (const [k, v] of Object.entries(init.headers || {})) {
    const key = String(k).toLowerCase();
    if (BLOCKED_HEADERS.has(key) || !/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(key)) continue;
    headers[key] = String(v);
  }

  // The body is sent byte for byte as the caller built it (e.g. a multipart/form-data upload
  // with its own Content-Type and boundary): a string whose characters all fit in one byte is sent
  // as those bytes (latin1, so "binary strings" survive); anything else is sent as UTF-8. No
  // charset or Content-Type is added.
  let body;
  if (init.body != null && method !== "GET" && method !== "HEAD") {
    const text = String(init.body);
    body = Buffer.from(text, /[^\u0000-\u00ff]/.test(text) ? "utf8" : "latin1");
    if (body.byteLength > MAX_REQUEST_BODY) throw new Error(`Request body too large (max ${MAX_REQUEST_BODY / 1048576} MB)`);
  }

  const requested = Number(init.timeoutMs);
  const timeoutMs = Number.isFinite(requested) && requested > 0 ? Math.min(requested, MAX_TIMEOUT_MS) : DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // redirect: "manual" so a local server cannot bounce the call to the internet.
    const res = await fetch(url, { method, headers, body, redirect: "manual", signal: controller.signal });
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_RESPONSE_BODY) {
      controller.abort();
      throw new Error(`Response too large (max ${MAX_RESPONSE_BODY / 1048576} MB)`);
    }
    const chunks = [];
    let size = 0;
    if (res.body) {
      for await (const chunk of res.body) {
        size += chunk.byteLength;
        if (size > MAX_RESPONSE_BODY) {
          controller.abort();
          throw new Error(`Response too large (max ${MAX_RESPONSE_BODY / 1048576} MB)`);
        }
        chunks.push(Buffer.from(chunk));
      }
    }
    const outHeaders = {};
    res.headers.forEach((value, key) => {
      outHeaders[key] = value;
    });
    return { status: res.status, headers: outHeaders, body: Buffer.concat(chunks).toString("utf8") };
  } catch (err) {
    if (controller.signal.aborted && !(err instanceof Error && /too large/.test(err.message))) {
      throw new Error(`Request timed out after ${timeoutMs} ms (${url.origin})`);
    }
    if (err instanceof Error && err.message === "fetch failed" && err.cause) {
      const cause = /** @type {any} */ (err.cause);
      throw new Error(`Could not reach ${url.host}: ${cause.code || cause.message || "network error"}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { desktopRequest, DEFAULT_TIMEOUT_MS, MAX_REQUEST_BODY, MAX_RESPONSE_BODY };
