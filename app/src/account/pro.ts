/**
 * CarvCAM account and Pro plan.
 *
 * - The session lives in localStorage (supabase-js, auto-refresh on); supabase-js is only loaded
 *   when there is a session or the user signs in.
 * - The entitlement and profile rows are read on start, every 6 h, and on window focus (at most
 *   every 10 min).
 * - The last good state is cached with `checkedAt`. Offline, Pro stays unlocked for 30 days after
 *   the last successful check, then falls back to free until the app can check again.
 * - Free features never depend on any of this.
 */
import { useEffect, useMemo } from "react";
import { create } from "zustand";
import {
  CHECK_EVERY_MS,
  FOCUS_MIN_MS,
  fromCache,
  friendlyAuthError,
  isNetworkError,
  LOADING,
  SIGNED_OUT,
  toAccountState,
  withForce,
  type AccountState,
  type EntitlementRow,
  type ProfileRow,
} from "./logic";
import { AUTH_STORAGE_KEY, getClient, hasStoredSession } from "./supabase";

export type { AccountState, ProFeature } from "./logic";
export { planLabel, initials, FEATURES } from "./logic";

const UTM = "utm_source=app&utm_medium=carvcam";
/** Website pages (opened in the system browser). */
export const SITE = {
  signup: `https://www.carvcam.com/signup/?${UTM}`,
  pricing: `https://www.carvcam.com/pricing/?${UTM}`,
  account: `https://www.carvcam.com/account/?${UTM}`,
  reset: `https://www.carvcam.com/reset-password/?${UTM}`,
} as const;

/** Opens a website page in the system browser (Electron routes window.open to it). */
export function openSite(url: string) {
  try {
    window.open(url, "_blank", "noopener,noreferrer");
  } catch {
    /* nothing to do */
  }
}

const CACHE_KEY = "carvcam-account";
const FORCE_KEY = "carvcam-force-pro";
const NET_TIMEOUT_MS = 15000;

function readCache(): AccountState | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as AccountState;
    return s && s.status === "signed-in" && typeof s.checkedAt === "number" ? s : null;
  } catch {
    return null;
  }
}
function writeCache(s: AccountState | null) {
  try {
    if (s) localStorage.setItem(CACHE_KEY, JSON.stringify({ ...s, offline: false, stale: false, forced: false }));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    /* storage full or blocked: the app just checks again next time */
  }
}

/** Dev/test escape hatch: VITE_FORCE_PRO=1 at build time, or localStorage carvcam-force-pro = "1". */
export function forcePro(): boolean {
  if (import.meta.env.VITE_FORCE_PRO === "1") return true;
  try {
    return localStorage.getItem(FORCE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Raw account state (without the escape hatch; use useAccount()). */
const useStore = create<{ s: AccountState }>()(() => ({ s: LOADING }));
const set = (s: AccountState) => useStore.setState({ s });

function setSignedOut() {
  writeCache(null);
  set(SIGNED_OUT);
}
function setFromCache() {
  const cur = useStore.getState().s;
  set(fromCache(readCache() ?? (cur.status === "signed-in" ? cur : null), Date.now(), true));
}

let listening = false;
async function client() {
  const sb = await getClient();
  if (!listening) {
    listening = true;
    sb.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setSignedOut();
    });
  }
  return sb;
}

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(Object.assign(new Error("Request timed out"), { status: 0 })), NET_TIMEOUT_MS);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

let inflight: Promise<void> | null = null;
let lastAttempt = 0;

/** Reads the entitlement and profile again. Never throws: offline, it falls back to the cache. */
export function refreshAccount(): Promise<void> {
  inflight ??= doRefresh().finally(() => (inflight = null));
  return inflight;
}

async function doRefresh() {
  lastAttempt = Date.now();
  if (!hasStoredSession()) return setSignedOut();
  try {
    const sb = await client();
    const { data, error } = await withTimeout(sb.auth.getSession());
    if (error) return isNetworkError(error) ? setFromCache() : setSignedOut();
    const session = data.session;
    if (!session) return setSignedOut();
    const uid = session.user.id;
    const [p, e] = await withTimeout(
      Promise.all([
        sb.from("profiles").select("email, full_name").eq("id", uid).maybeSingle<ProfileRow>(),
        sb.from("entitlements").select("plan, source, status, current_period_end, trial_end, cancel_at_period_end, lifetime").eq("user_id", uid).returns<EntitlementRow[]>(),
      ]),
    );
    if (p.error || e.error) return setFromCache();
    const rows = e.data ?? [];
    const best = rows.map((r) => toAccountState(session.user, p.data, r, Date.now())).find((s) => s.pro);
    const s = best ?? toAccountState(session.user, p.data, rows[0], Date.now());
    writeCache(s);
    set(s);
  } catch {
    // Network down, supabase-js chunk missing, anything else: keep working from the cache.
    setFromCache();
  }
}

let started = false;
function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  const cached = readCache();
  if (!hasStoredSession()) set(SIGNED_OUT);
  else set(cached ? fromCache(cached, Date.now(), false) : LOADING);
  void refreshAccount();
  setInterval(() => void refreshAccount(), CHECK_EVERY_MS);
  window.addEventListener("focus", () => {
    if (Date.now() - lastAttempt >= FOCUS_MIN_MS) void refreshAccount();
  });
  // The escape hatch can be toggled from another window / devtools.
  window.addEventListener("storage", (e) => {
    if (e.key === FORCE_KEY) set({ ...useStore.getState().s });
  });
}

/** Current account (zustand-backed). Starts the account checks on first use. */
export function useAccount(): AccountState {
  useEffect(start, []);
  const s = useStore((x) => x.s);
  const force = forcePro();
  return useMemo(() => withForce(s, force), [s, force]);
}

/** True when Pro features are unlocked. */
export function usePro(): boolean {
  return useAccount().pro;
}

/** Signs in with email + password. Throws an Error with a friendly English message. */
export async function signIn(email: string, password: string): Promise<void> {
  if (!email.trim() || !password) throw new Error("Enter your email and password.");
  let sb;
  try {
    sb = await client();
  } catch {
    throw new Error(friendlyAuthError({ status: 0 }));
  }
  let error: unknown;
  try {
    ({ error } = await withTimeout(sb.auth.signInWithPassword({ email: email.trim(), password })));
  } catch (e) {
    error = e;
  }
  if (error) throw new Error(friendlyAuthError(error));
  await refreshAccount();
}

/** Signs out on this computer (works offline too). */
export async function signOut(): Promise<void> {
  try {
    if (hasStoredSession()) {
      const sb = await client();
      await sb.auth.signOut({ scope: "local" });
    }
  } catch {
    /* offline: the local session is still cleared below */
  }
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  setSignedOut();
}
