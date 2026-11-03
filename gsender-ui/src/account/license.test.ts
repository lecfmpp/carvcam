import { describe, expect, it } from "vitest";
import { isExpired, licenseIsPro, planLabel, verifyLicense, type License } from "./license";

// Signs exactly like supabase/functions/app-auth: base64url(JSON) "." base64url(ECDSA P-256 / SHA-256).
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function pair() {
  const k = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const { kty, crv, x, y } = await crypto.subtle.exportKey("jwk", k.publicKey);
  return { priv: k.privateKey, pub: { kty, crv, x, y } as JsonWebKey };
}
async function sign(priv: CryptoKey, payload: object) {
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, priv, new TextEncoder().encode(body)));
  return `${body}.${b64url(sig)}`;
}
const now = Math.floor(Date.now() / 1000);
const base: License = { v: 1, sub: "u", device: "d", email: "a@b.c", name: null, plan: "pro", pro: true, lifetime: false, status: "active", trial_end: null, period_end: null, cancel_at_period_end: false, iat: now, exp: now + 3600 };

describe("license", () => {
  it("accepts a license signed by the server key", async () => {
    const { priv, pub } = await pair();
    const lic = await verifyLicense(await sign(priv, base), pub);
    expect(lic?.email).toBe("a@b.c");
    expect(licenseIsPro(lic)).toBe(true);
    expect(planLabel(lic)).toBe("Pro");
  });

  it("rejects an edited license", async () => {
    const { priv, pub } = await pair();
    const [, sig] = (await sign(priv, base)).split(".");
    const forged = `${b64url(new TextEncoder().encode(JSON.stringify({ ...base, plan: "school" })))}.${sig}`;
    expect(await verifyLicense(forged, pub)).toBeNull();
  });

  it("rejects a license signed by another key", async () => {
    const a = await pair();
    const b = await pair();
    expect(await verifyLicense(await sign(a.priv, base), b.pub)).toBeNull();
    expect(await verifyLicense("garbage", b.pub)).toBeNull();
  });

  it("turns Pro off once the license expires (no check-in for 30 days)", async () => {
    const { priv, pub } = await pair();
    const lic = await verifyLicense(await sign(priv, { ...base, exp: now - 1 }), pub);
    expect(lic).not.toBeNull();
    expect(isExpired(lic!)).toBe(true);
    expect(licenseIsPro(lic)).toBe(false);
    expect(planLabel(lic)).toBe("Free");
  });

  it("free plan is never Pro", async () => {
    const { priv, pub } = await pair();
    const lic = await verifyLicense(await sign(priv, { ...base, plan: "free", pro: false }), pub);
    expect(licenseIsPro(lic)).toBe(false);
  });
});
