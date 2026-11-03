import { create } from "zustand";
import { SUPABASE_KEY, SUPABASE_URL } from "../account/config";
import { isExpired, licenseIsPro, verifyLicense, type License } from "../account/license";

/**
 * Sign-in with a CarvCAM account (device code flow, like a TV app):
 * 1. `startSignIn` asks the server for a code and opens carvcam.com/activate/?code=… in the browser;
 * 2. the person logs in there (or creates an account) and approves the code;
 * 3. the app, polling in the background, receives a device token and a signed license.
 *
 * Free never needs an account. Pro reads the license, which the app checks offline with the public
 * key and renews with the server at start, every few hours and when the network comes back.
 * Without a check for 30 days, the license expires and Pro waits for the next connection.
 */

const STORAGE_KEY = "carvcam-account";
const REFRESH_EVERY_MS = 6 * 3600 * 1000;

export type SignIn =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "waiting"; userCode: string; url: string; urlComplete: string; expiresAt: number }
  | { phase: "error"; message: string };

export interface AccountState {
  /** Read from storage and verified (null until `init` finishes). */
  ready: boolean;
  token: string | null;
  license: License | null;
  /** Raw signed license, kept so the next start can check it again. */
  raw: string | null;
  signIn: SignIn;
  /** The dialog with the code is open. */
  dialogOpen: boolean;
  /** Last attempt to renew the license failed because there was no connection. */
  offline: boolean;

  init(): Promise<void>;
  openSignIn(): void;
  closeSignIn(): void;
  startSignIn(): Promise<void>;
  cancelSignIn(): void;
  refresh(): Promise<void>;
  signOut(): Promise<void>;
}

class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: Record<string, unknown>,
  ) {
    super(message);
  }
}

async function call<T = Record<string, unknown>>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/app-auth`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const out = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new HttpError(String(out.error || `Request failed (${res.status})`), res.status, out);
  return out as T;
}

function load(): { token: string | null; raw: string | null } {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return { token: typeof v?.token === "string" ? v.token : null, raw: typeof v?.license === "string" ? v.license : null };
  } catch {
    return { token: null, raw: null };
  }
}

function save(token: string | null, raw: string | null) {
  try {
    if (token) localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, license: raw }));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private window or storage blocked: stays signed in until the app closes */
  }
}

/** "CarvCAM on Windows", "CarvCAM on gControl"… shown on the approval page and the account page. */
export function deviceName(): { name: string; platform: string } {
  const ua = navigator.userAgent;
  const platform = /Windows/i.test(ua)
    ? "Windows"
    : /Mac OS X|Macintosh/i.test(ua)
      ? "Mac"
      : /aarch64|arm/i.test(ua) && /Linux/i.test(ua)
        ? "Raspberry Pi"
        : /Linux/i.test(ua)
          ? "Linux"
          : "Browser";
  const touch = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  return { name: touch && platform === "Windows" ? "CarvCAM on gControl" : `CarvCAM on ${platform}`, platform };
}

const isNetworkError = (err: unknown) => !(err instanceof HttpError);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Each sign-in attempt gets a number; a newer attempt or a cancel stops older polling loops. */
let attempt = 0;
let timer: ReturnType<typeof setInterval> | null = null;

export const useAccount = create<AccountState>()((set, get) => ({
  ready: false,
  token: null,
  license: null,
  raw: null,
  signIn: { phase: "idle" },
  dialogOpen: false,
  offline: false,

  async init() {
    if (get().ready) return;
    const { token, raw } = load();
    const license = raw ? await verifyLicense(raw) : null;
    set({ ready: true, token, raw: license ? raw : null, license });
    if (!timer) {
      timer = setInterval(() => void get().refresh(), REFRESH_EVERY_MS);
      window.addEventListener("online", () => void get().refresh());
    }
    if (token) await get().refresh();
  },

  openSignIn() {
    set({ dialogOpen: true });
    if (!get().token && get().signIn.phase !== "waiting") void get().startSignIn();
  },
  closeSignIn() {
    if (get().signIn.phase !== "waiting") set({ dialogOpen: false, signIn: { phase: "idle" } });
    else set({ dialogOpen: false });
  },

  async startSignIn() {
    const mine = ++attempt;
    set({ signIn: { phase: "starting" } });
    let start: { device_code: string; user_code: string; verification_url: string; verification_url_complete: string; interval: number; expires_in: number };
    try {
      const d = deviceName();
      start = await call("start", { device_name: d.name, platform: d.platform });
    } catch (err) {
      if (mine === attempt)
        set({ signIn: { phase: "error", message: isNetworkError(err) ? "CarvCAM can't reach carvcam.com. Check the internet connection and try again." : (err as Error).message } });
      return;
    }
    if (mine !== attempt) return;
    const expiresAt = Date.now() + start.expires_in * 1000;
    set({ signIn: { phase: "waiting", userCode: start.user_code, url: start.verification_url, urlComplete: start.verification_url_complete, expiresAt } });
    window.open(start.verification_url_complete, "_blank", "noopener");

    let wait = Math.max(2, start.interval) * 1000;
    while (mine === attempt && Date.now() < expiresAt) {
      await sleep(wait);
      if (mine !== attempt) return;
      let out: { status: string; token?: string; license?: string };
      try {
        out = await call("poll", { device_code: start.device_code });
      } catch (err) {
        if (!isNetworkError(err)) {
          set({ signIn: { phase: "error", message: (err as Error).message } });
          return;
        }
        wait = Math.min(wait * 2, 30_000); // offline for a moment: keep trying, more slowly
        continue;
      }
      if (mine !== attempt) return;
      if (out.status === "pending") continue;
      if (out.status === "approved" && out.token && out.license) {
        const license = await verifyLicense(out.license);
        save(out.token, license ? out.license : null);
        set({ token: out.token, raw: license ? out.license : null, license, offline: false, signIn: { phase: "idle" }, dialogOpen: false });
        return;
      }
      set({ signIn: { phase: "error", message: out.status === "denied" ? "Sign-in was declined on the website." : "The code expired. Get a new one." } });
      return;
    }
    if (mine === attempt) set({ signIn: { phase: "error", message: "The code expired. Get a new one." } });
  },

  cancelSignIn() {
    attempt++;
    set({ signIn: { phase: "idle" }, dialogOpen: false });
  },

  async refresh() {
    const token = get().token;
    if (!token) return;
    try {
      const { license: raw } = await call<{ license: string }>("license", { token });
      const license = await verifyLicense(raw);
      if (!license || get().token !== token) return;
      save(token, raw);
      set({ raw, license, offline: false });
    } catch (err) {
      if (err instanceof HttpError && err.body.revoked) {
        // Signed out from the account page (or the account was deleted).
        save(null, null);
        set({ token: null, raw: null, license: null, offline: false });
        return;
      }
      if (isNetworkError(err)) set({ offline: true });
    }
  },

  async signOut() {
    const token = get().token;
    save(null, null);
    set({ token: null, raw: null, license: null, offline: false });
    if (token) await call("signout", { token }).catch(() => {});
  },
}));

/** Pro features are on (valid, unexpired license with a Pro plan). */
export const usePro = () => useAccount((s) => licenseIsPro(s.license));

/** Pro, but the license ran out because the app hasn't reached the server in 30 days. */
export const useProNeedsReconnect = () => useAccount((s) => !!s.license?.pro && isExpired(s.license));
