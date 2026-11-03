"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { desktopRequest } = require("../src/http-request.js");

/** Tiny stand-in for gSender's HTTP API on 127.0.0.1. */
function startServer() {
  const server = http.createServer((req, res) => {
    let body = "";
    req.setEncoding("latin1"); // one char per byte, so the tests see the exact bytes sent
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.url === "/slow") return setTimeout(() => res.end("late"), 2000);
      if (req.url === "/redirect") {
        res.writeHead(302, { Location: "https://example.com/" });
        return res.end();
      }
      if (req.url === "/huge") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        const chunk = Buffer.alloc(1024 * 1024, 120);
        let sent = 0;
        const push = () => {
          while (sent < 40) {
            sent++;
            if (!res.write(chunk)) return res.once("drain", push);
          }
          res.end();
        };
        return push();
      }
      if (req.url === "/missing") {
        res.writeHead(404, { "Content-Type": "text/plain" });
        return res.end("nope");
      }
      if (req.url === "/upload") {
        return res.end(JSON.stringify({ length: body.length, bytes: [...body.slice(0, 4)].map((c) => c.charCodeAt(0)), contentType: req.headers["content-type"], tail: body.slice(-40) }));
      }
      res.writeHead(201, { "Content-Type": "application/json", "X-Test": "yes" });
      res.end(JSON.stringify({ method: req.method, url: req.url, body, contentType: req.headers["content-type"] || null }));
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

test("request reaches a local server and returns status, headers and body", async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  const res = await desktopRequest(`${base}/api/gcode`, { method: "post", headers: { "Content-Type": "text/plain", Host: "evil" }, body: "G0 X0\n" });
  assert.equal(res.status, 201);
  assert.equal(res.headers["x-test"], "yes");
  const echo = JSON.parse(res.body);
  assert.deepEqual(echo, { method: "POST", url: "/api/gcode", body: "G0 X0\n", contentType: "text/plain" });

  const viaLocalhost = await desktopRequest(`http://localhost:${server.address().port}/x`);
  assert.equal(JSON.parse(viaLocalhost.body).method, "GET");
});

test("redirects are not followed", async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const res = await desktopRequest(`http://127.0.0.1:${server.address().port}/redirect`);
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, "https://example.com/");
});

test("timeout", async (t) => {
  const server = await startServer();
  t.after(() => server.closeAllConnections?.() ?? server.close());
  await assert.rejects(desktopRequest(`http://127.0.0.1:${server.address().port}/slow`, { timeoutMs: 200 }), /Request timed out after 200 ms/);
});

test("response size cap", async (t) => {
  const server = await startServer();
  t.after(() => server.closeAllConnections?.() ?? server.close());
  await assert.rejects(desktopRequest(`http://127.0.0.1:${server.address().port}/huge`), /Response too large/);
});

test("public hosts and bad methods are refused before any network call", async () => {
  await assert.rejects(desktopRequest("https://www.carvcam.com/"), /Host not allowed/);
  await assert.rejects(desktopRequest("http://127.0.0.1:1/", { method: "TRACE" }), /Method not allowed/);
});

test("unreachable local port gives a readable error", async () => {
  await assert.rejects(desktopRequest("http://127.0.0.1:1/"), /Could not reach 127\.0\.0\.1:1/);
});

test("4xx/5xx resolve with the response (only network errors and timeouts reject)", async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const res = await desktopRequest(`http://127.0.0.1:${server.address().port}/missing`);
  assert.equal(res.status, 404);
  assert.equal(res.body, "nope");
});

test("multipart upload: 20 MB string body sent as-is with the caller's Content-Type", async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const boundary = "----carvcamBoundary123";
  const gcode = "G21\nG90\n" + "G1 X1.000 Y2.000 F1000\n".repeat(950_000); // ~21 MiB
  const body = `--${boundary}\r\nContent-Disposition: form-data; name="gcode"; filename="sign.gcode"\r\nContent-Type: text/plain\r\n\r\n${gcode}\r\n--${boundary}--\r\n`;
  assert.ok(body.length > 20 * 1024 * 1024);
  const res = await desktopRequest(`http://127.0.0.1:${server.address().port}/upload`, {
    method: "POST",
    headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body,
    timeoutMs: 30000,
  });
  const echo = JSON.parse(res.body);
  assert.equal(echo.length, body.length);
  assert.equal(echo.contentType, `multipart/form-data; boundary=${boundary}`);
  assert.equal(echo.tail, body.slice(-40));
});

test("binary (latin1) strings keep their bytes", async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const body = "\u00ff\u00e9\u0000\u0080";
  const res = await desktopRequest(`http://127.0.0.1:${server.address().port}/upload`, { method: "POST", body });
  assert.deepEqual(JSON.parse(res.body).bytes, [0xff, 0xe9, 0x00, 0x80]);
});
