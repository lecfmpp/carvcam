"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { isAllowedHost, checkRequestUrl, isExternalUrl, isPrivateAddress } = require("../src/allowlist.js");

test("loopback and private networks are allowed", () => {
  for (const url of [
    "http://localhost:8000/api/gcode",
    "http://LOCALHOST/",
    "http://127.0.0.1:8000/",
    "http://127.255.255.254/",
    "http://10.0.0.5/",
    "http://10.255.255.255/",
    "http://172.16.0.1/",
    "http://172.31.255.255/",
    "http://192.168.1.20:8000/",
    "http://169.254.10.10/",
    "http://[::1]:8000/",
    "http://[fe80::1]/",
    "http://[fd12:3456::1]/",
    "http://[::ffff:192.168.0.10]/",
    "http://gsender.local:8000/",
    "http://longmill-pi.local/",
    "https://192.168.0.2/",
  ]) {
    assert.doesNotThrow(() => checkRequestUrl(url), url);
  }
});

test("public internet and tricky hosts are rejected", () => {
  for (const url of [
    "http://8.8.8.8/",
    "http://172.15.255.255/",
    "http://172.32.0.1/",
    "http://192.169.0.1/",
    "http://11.0.0.1/",
    "http://0.0.0.0/",
    "http://[2001:4860:4860::8888]/",
    "http://[::ffff:8.8.8.8]/",
    "http://[::]/",
    "https://www.carvcam.com/",
    "http://example.com/",
    "http://localhost.example.com/",
    "http://127.0.0.1.nip.io/",
    "http://evil.com#@localhost/",
    "http://local/",
    "http://.local/",
    "http://user:pass@localhost/",
    "file:///etc/passwd",
    "ftp://192.168.0.1/",
    "javascript:alert(1)",
    "not a url",
  ]) {
    assert.throws(() => checkRequestUrl(url), undefined, url);
  }
});

test("integer and hex IPv4 spellings are normalised by URL before the check", () => {
  // WHATWG URL turns these into dotted quads, so they are judged as the real address.
  assert.doesNotThrow(() => checkRequestUrl("http://2130706433/")); // 127.0.0.1
  assert.doesNotThrow(() => checkRequestUrl("http://0x7f.1/")); // 127.0.0.1
  assert.throws(() => checkRequestUrl("http://134744072/")); // 8.8.8.8
});

test("isPrivateAddress / isAllowedHost basics", () => {
  assert.equal(isPrivateAddress("192.168.1.1"), true);
  assert.equal(isPrivateAddress("1.1.1.1"), false);
  assert.equal(isPrivateAddress("::1"), true);
  assert.equal(isAllowedHost("[::1]"), true);
  assert.equal(isAllowedHost(""), false);
});

test("external links: only http(s) and mailto", () => {
  assert.equal(isExternalUrl("https://www.carvcam.com/activate?code=X"), true);
  assert.equal(isExternalUrl("http://sienci.com/"), true);
  assert.equal(isExternalUrl("mailto:support@carvcam.com"), true);
  assert.equal(isExternalUrl("file:///Applications/Calculator.app"), false);
  assert.equal(isExternalUrl("smb://host/share"), false);
  assert.equal(isExternalUrl("javascript:alert(1)"), false);
});
