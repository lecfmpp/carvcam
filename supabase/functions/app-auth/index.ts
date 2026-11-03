// Signs the CarvCAM app in with a CarvCAM account (device code flow) and hands it a signed license.
//
// POST { action, ... }
//   start   { device_name?, platform? }            → { device_code, user_code, verification_url, interval, expires_in }
//   poll    { device_code }                         → { status: "pending" | "denied" | "expired" }
//                                                    | { status: "approved", token, license }
//   license { token }                               → { license }   (401 + revoked:true when signed out elsewhere)
//   signout { token }                               → { ok: true }
//   lookup  { user_code }   (site, user's JWT)      → { device_name, platform }
//   approve { user_code, approve: boolean } (JWT)   → { ok: true }
//
// The app keeps only the device token (random, 256 bits; its SHA-256 is stored in app_devices) and
// the last license. A license is `base64url(JSON).base64url(ECDSA P-256 signature)`; the app checks
// it with the public key, so Pro keeps working offline until `exp` (30 days after the last check).
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SITE = (Deno.env.get("APP_SITE_URL") ?? "https://www.carvcam.com").replace(/\/$/, "");
const REQUEST_TTL_S = 15 * 60;
const POLL_INTERVAL_S = 5;
const LICENSE_TTL_S = 30 * 24 * 3600;
// No vowels (no accidental words) and no look-alikes (0/O, 1/I/L, 5/S, 2/Z).
const CODE_ALPHABET = "BCDFGHJKMNPQRTVWXY346789";

// The app runs from localhost, a file, or inside gSender, and authenticates with a bearer secret in
// the body (never cookies), so any origin may call this function.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const fail = (error: string, status = 400, extra: Record<string, unknown> = {}) => json({ error, ...extra }, status);

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const randomToken = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));
async function sha256(text: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function userCode() {
  const pick = crypto.getRandomValues(new Uint8Array(8));
  const chars = [...pick].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}
const normalizeCode = (c: unknown) => {
  const s = String(c ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4)}` : null;
};
const clip = (s: unknown, n: number) => (typeof s === "string" && s.trim() ? s.trim().slice(0, n) : null);

async function userFrom(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data.user;
}

// ---------------------------------------------------------------- license

let signingKey: Promise<CryptoKey> | null = null;
function key() {
  const jwk = Deno.env.get("APP_LICENSE_PRIVATE_JWK");
  if (!jwk) throw new Error("APP_LICENSE_PRIVATE_JWK is not set");
  signingKey ??= crypto.subtle.importKey("jwk", JSON.parse(jwk), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  return signingKey;
}

type Entitlement = {
  plan: string;
  source: string | null;
  status: string | null;
  lifetime: boolean;
  current_period_end: string | null;
  trial_end: string | null;
  cancel_at_period_end: boolean;
};

// Same rule as hasPro() on the website's account page.
const hasPro = (e: Entitlement | null) =>
  !!e && (e.plan === "pro" || e.plan === "school") && (e.lifetime || e.source === "manual" || ["trialing", "active", "past_due"].includes(e.status ?? ""));

async function licenseFor(device: { id: string; user_id: string }) {
  const [{ data: profile }, { data: ent }] = await Promise.all([
    admin.from("profiles").select("email, full_name").eq("id", device.user_id).single(),
    admin.from("entitlements").select("plan, source, status, lifetime, current_period_end, trial_end, cancel_at_period_end").eq("user_id", device.user_id).maybeSingle<Entitlement>(),
  ]);
  const pro = hasPro(ent ?? null);
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    v: 1,
    sub: device.user_id,
    device: device.id,
    email: profile?.email ?? null,
    name: profile?.full_name ?? null,
    plan: pro ? (ent!.plan as "pro" | "school") : "free",
    pro,
    lifetime: pro && !!ent?.lifetime,
    status: pro ? ent?.status ?? null : null,
    trial_end: pro ? ent?.trial_end ?? null : null,
    period_end: pro ? ent?.current_period_end ?? null : null,
    cancel_at_period_end: pro && !!ent?.cancel_at_period_end,
    iat: now,
    exp: now + LICENSE_TTL_S,
  };
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, await key(), new TextEncoder().encode(body)));
  return `${body}.${b64url(sig)}`;
}

async function deviceFrom(token: unknown) {
  if (typeof token !== "string" || token.length < 32) return null;
  const { data } = await admin.from("app_devices").select("id, user_id").eq("token_hash", await sha256(token)).maybeSingle();
  return data;
}

// ---------------------------------------------------------------- actions

async function start(body: Record<string, unknown>) {
  // Housekeeping: forget requests that were never finished.
  await admin.from("app_login_requests").delete().lt("expires_at", new Date().toISOString());
  const device_code = randomToken();
  const row = {
    device_code_hash: await sha256(device_code),
    device_name: clip(body.device_name, 80),
    platform: clip(body.platform, 40),
    expires_at: new Date(Date.now() + REQUEST_TTL_S * 1000).toISOString(),
  };
  for (let attempt = 0; attempt < 5; attempt++) {
    const user_code = userCode();
    const { error } = await admin.from("app_login_requests").insert({ ...row, user_code });
    if (!error)
      return json({
        device_code,
        user_code,
        verification_url: `${SITE}/activate/`,
        verification_url_complete: `${SITE}/activate/?code=${user_code}`,
        interval: POLL_INTERVAL_S,
        expires_in: REQUEST_TTL_S,
      });
    if (error.code !== "23505") throw error; // anything but a code collision
  }
  throw new Error("Could not allocate a user code");
}

async function poll(body: Record<string, unknown>) {
  if (typeof body.device_code !== "string") return fail("device_code is required");
  const { data: r } = await admin
    .from("app_login_requests")
    .select("id, status, user_id, device_name, platform, expires_at")
    .eq("device_code_hash", await sha256(body.device_code))
    .maybeSingle();
  if (!r || (r.status === "pending" && new Date(r.expires_at) < new Date())) return json({ status: "expired" });
  if (r.status === "pending") return json({ status: "pending", interval: POLL_INTERVAL_S });
  // Approved or denied: the request is used up either way.
  // Only the poll that actually deletes it gets a token, so two racing polls can't both sign in.
  const { data: claimed } = await admin.from("app_login_requests").delete().eq("id", r.id).select("id");
  if (!claimed?.length) return json({ status: "expired" });
  if (r.status === "denied" || !r.user_id) return json({ status: "denied" });
  const token = randomToken();
  const { data: device, error } = await admin
    .from("app_devices")
    .insert({ user_id: r.user_id, token_hash: await sha256(token), name: r.device_name ?? "CarvCAM", platform: r.platform })
    .select("id, user_id")
    .single();
  if (error) throw error;
  return json({ status: "approved", token, license: await licenseFor(device) });
}

async function license(body: Record<string, unknown>) {
  const device = await deviceFrom(body.token);
  if (!device) return fail("This computer was signed out. Sign in again.", 401, { revoked: true });
  await admin.from("app_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", device.id);
  return json({ license: await licenseFor(device) });
}

async function signout(body: Record<string, unknown>) {
  const device = await deviceFrom(body.token);
  if (device) await admin.from("app_devices").delete().eq("id", device.id);
  return json({ ok: true });
}

async function pendingRequest(code: unknown) {
  const user_code = normalizeCode(code);
  if (!user_code) return null;
  const { data } = await admin
    .from("app_login_requests")
    .select("id, device_name, platform, status, expires_at")
    .eq("user_code", user_code)
    .maybeSingle();
  return data && data.status === "pending" && new Date(data.expires_at) > new Date() ? data : null;
}

async function lookup(req: Request, body: Record<string, unknown>) {
  if (!(await userFrom(req))) return fail("Log in first.", 401);
  const r = await pendingRequest(body.user_code);
  if (!r) return fail("That code is wrong or has expired. Check the code in CarvCAM, or start again from the app.", 404);
  return json({ device_name: r.device_name, platform: r.platform });
}

async function approve(req: Request, body: Record<string, unknown>) {
  const user = await userFrom(req);
  if (!user) return fail("Log in first.", 401);
  const r = await pendingRequest(body.user_code);
  if (!r) return fail("That code is wrong or has expired. Check the code in CarvCAM, or start again from the app.", 404);
  const ok = body.approve === true;
  const { error } = await admin
    .from("app_login_requests")
    .update({ status: ok ? "approved" : "denied", user_id: ok ? user.id : null })
    .eq("id", r.id)
    .eq("status", "pending");
  if (error) throw error;
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail("Method not allowed", 405);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("Send a JSON body.");
  }
  try {
    switch (body.action) {
      case "start":
        return await start(body);
      case "poll":
        return await poll(body);
      case "license":
        return await license(body);
      case "signout":
        return await signout(body);
      case "lookup":
        return await lookup(req, body);
      case "approve":
        return await approve(req, body);
      default:
        return fail("Unknown action");
    }
  } catch (err) {
    console.error("[app-auth]", body.action, err);
    return fail("Something went wrong on our side. Try again in a minute.", 500);
  }
});
