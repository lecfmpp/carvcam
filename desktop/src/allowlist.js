// Which URLs `window.carvcamDesktop.request` may reach: gSender on this computer or on the shop
// network, never the internet. Pure functions (no Electron), so they run under `node --test`.
"use strict";

const net = require("node:net");

/** @param {string} ip IPv4 dotted quad */
function ipv4ToInt(ip) {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

/** [network, prefix length] */
const PRIVATE_V4 = [
  ["127.0.0.0", 8], // loopback
  ["10.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["169.254.0.0", 16], // link-local (direct cable, no DHCP)
];

function isPrivateIPv4(ip) {
  if (net.isIPv4(ip) !== true) return false;
  const value = ipv4ToInt(ip);
  return PRIVATE_V4.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (value & mask) === (ipv4ToInt(base) & mask);
  });
}

/** Expands an IPv6 address to 8 numbers (handles "::" and an embedded IPv4 tail). */
function ipv6Groups(ip) {
  let addr = ip.toLowerCase();
  const zone = addr.indexOf("%");
  if (zone >= 0) addr = addr.slice(0, zone);
  // Embedded IPv4 tail ("::ffff:10.0.0.1") becomes two hex groups.
  const lastColon = addr.lastIndexOf(":");
  const last = addr.slice(lastColon + 1);
  if (net.isIPv4(last)) {
    const v = ipv4ToInt(last);
    addr = addr.slice(0, lastColon + 1) + (v >>> 16).toString(16) + ":" + (v & 0xffff).toString(16);
  }
  const parse = (s) => (s ? s.split(":").map((g) => parseInt(g, 16)) : []);
  if (!addr.includes("::")) return parse(addr);
  const [head, rest] = addr.split("::");
  const h = parse(head);
  const r = parse(rest);
  return [...h, ...new Array(Math.max(0, 8 - h.length - r.length)).fill(0), ...r];
}

function isPrivateIPv6(ip) {
  if (net.isIPv6(ip) !== true) return false;
  const g = ipv6Groups(ip);
  if (g.length !== 8) return false;
  // ::1 loopback
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true;
  // fe80::/10 link-local, fc00::/7 unique local (the IPv6 "private network")
  if ((g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xfe00) === 0xfc00) return true;
  // ::ffff:a.b.c.d (IPv4-mapped): judge the IPv4 address
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    return isPrivateIPv4([g[6] >>> 8, g[6] & 0xff, g[7] >>> 8, g[7] & 0xff].join("."));
  }
  return false;
}

/** True for loopback / private / link-local IP addresses. */
function isPrivateAddress(ip) {
  return isPrivateIPv4(ip) || isPrivateIPv6(ip);
}

/**
 * Host part of a URL is allowed: localhost, a private/loopback IP literal or an mDNS name
 * (*.local). `hostname` is URL.hostname (IPv6 keeps its brackets there).
 */
function isAllowedHost(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host) return false;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (net.isIP(host)) return isPrivateAddress(host);
  // mDNS (Bonjour/Avahi) names only ever resolve on the local network.
  if (/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.local$/.test(host)) return true;
  return false;
}

/**
 * Validates a URL for `request`. Returns the parsed URL or throws an Error with a message the
 * app can show. Only http(s), no credentials in the URL, only allowed hosts.
 * @param {string} raw
 */
function checkRequestUrl(raw) {
  let url;
  try {
    url = new URL(String(raw));
  } catch {
    throw new Error("Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`Protocol not allowed: ${url.protocol}`);
  if (url.username || url.password) throw new Error("Credentials in the URL are not allowed");
  if (!isAllowedHost(url.hostname)) {
    throw new Error(`Host not allowed: ${url.hostname} (only this computer or the local network)`);
  }
  return url;
}

const ALLOWED_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);

/** URLs that may be opened in the system browser. */
function isExternalUrl(raw) {
  try {
    const url = new URL(String(raw));
    return url.protocol === "https:" || url.protocol === "http:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
}

module.exports = { isPrivateAddress, isAllowedHost, checkRequestUrl, isExternalUrl, ALLOWED_METHODS };
