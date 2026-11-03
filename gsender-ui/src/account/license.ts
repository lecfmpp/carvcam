import { LICENSE_PUBLIC_JWK } from "./config";

/** What the server signs for a signed-in computer (see supabase/functions/app-auth). */
export interface License {
  v: 1;
  sub: string;
  device: string;
  email: string | null;
  name: string | null;
  plan: "free" | "pro" | "school";
  pro: boolean;
  lifetime: boolean;
  status: string | null;
  trial_end: string | null;
  period_end: string | null;
  cancel_at_period_end: boolean;
  /** Seconds since 1970. */
  iat: number;
  exp: number;
}

const fromB64url = (s: string) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

let publicKey: Promise<CryptoKey> | null = null;
const key = (jwk: JsonWebKey) =>
  jwk === LICENSE_PUBLIC_JWK
    ? (publicKey ??= crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]))
    : crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);

/**
 * Checks the signature and returns the license, or null if it was tampered with or is malformed.
 * Expiry is not checked here: an expired license still says who is signed in.
 */
export async function verifyLicense(token: string, jwk: JsonWebKey = LICENSE_PUBLIC_JWK): Promise<License | null> {
  try {
    const [body, sig] = token.split(".");
    if (!body || !sig || !crypto?.subtle) return null;
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, await key(jwk), fromB64url(sig), new TextEncoder().encode(body));
    if (!ok) return null;
    const lic = JSON.parse(new TextDecoder().decode(fromB64url(body))) as License;
    return lic?.v === 1 && typeof lic.exp === "number" ? lic : null;
  } catch {
    return null;
  }
}

export const isExpired = (lic: License, now = Date.now()) => lic.exp * 1000 <= now;

/** Pro is on while the license says so and it was checked with the server in the last 30 days. */
export const licenseIsPro = (lic: License | null, now = Date.now()) => !!lic && lic.pro && !isExpired(lic, now);

/** "Pro", "Pro · Lifetime", "School / Makerspace" or "Free". */
export function planLabel(lic: License | null) {
  if (!licenseIsPro(lic)) return "Free";
  if (lic!.plan === "school") return "School / Makerspace";
  return lic!.lifetime ? "Pro · Lifetime" : "Pro";
}
