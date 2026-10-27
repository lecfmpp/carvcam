/**
 * Pure account logic (no React, no network): entitlement row → AccountState, the 30-day offline
 * grace period, plan labels and friendly sign-in errors. Unit-tested in account.test.ts.
 */

export type Plan = "free" | "pro" | "school";
export type ProFeature = "batch" | "cost" | "nesting" | "inlay" | "cloud" | "hosted-ai";

export interface AccountState {
  status: "loading" | "signed-out" | "signed-in";
  email?: string;
  name?: string;
  plan: Plan;
  pro: boolean;
  lifetime: boolean;
  trialEnd?: string;
  periodEnd?: string;
  /** Time (ms) of the last successful check against the server. */
  checkedAt?: number;
  /** The last check failed: the state comes from the local cache. */
  offline: boolean;
  /** The plan will end at periodEnd (canceled, still paid up until then). */
  cancels?: boolean;
  /** Pro was confirmed but the last successful check is older than the grace period: locked until online again. */
  stale?: boolean;
  /** Pro forced on by the dev/test escape hatch (VITE_FORCE_PRO / carvcam-force-pro). */
  forced?: boolean;
}

/** `public.entitlements` row (only the columns the app reads). */
export interface EntitlementRow {
  plan: string | null;
  source?: string | null;
  status?: string | null;
  current_period_end?: string | null;
  trial_end?: string | null;
  cancel_at_period_end?: boolean | null;
  lifetime?: boolean | null;
}

/** `public.profiles` row (only the columns the app reads). */
export interface ProfileRow {
  email?: string | null;
  full_name?: string | null;
}

export const GRACE_MS = 30 * 24 * 3600 * 1000;
export const CHECK_EVERY_MS = 6 * 3600 * 1000;
export const FOCUS_MIN_MS = 10 * 60 * 1000;

export const SIGNED_OUT: AccountState = { status: "signed-out", plan: "free", pro: false, lifetime: false, offline: false };
export const LOADING: AccountState = { ...SIGNED_OUT, status: "loading" };

const LIVE_STATUSES = ["trialing", "active", "past_due"];

/** Pro is active when plan is pro/school and (lifetime, manual grant, or a live Stripe status). */
export function entitlementActive(e: EntitlementRow | null | undefined): boolean {
  if (!e) return false;
  if (e.plan !== "pro" && e.plan !== "school") return false;
  return !!e.lifetime || e.source === "manual" || LIVE_STATUSES.includes(e.status ?? "");
}

/** Builds the signed-in state from the user, profile and entitlement rows. */
export function toAccountState(user: { email?: string | null }, profile: ProfileRow | null | undefined, e: EntitlementRow | null | undefined, now: number): AccountState {
  const active = entitlementActive(e);
  const plan: Plan = active ? (e!.plan as Plan) : "free";
  return {
    status: "signed-in",
    email: profile?.email || user.email || undefined,
    name: profile?.full_name?.trim() || undefined,
    plan,
    pro: active,
    lifetime: active && !!e!.lifetime,
    trialEnd: active && e!.status === "trialing" && e!.trial_end ? e!.trial_end : undefined,
    periodEnd: active && !e!.lifetime && e!.current_period_end ? e!.current_period_end : undefined,
    cancels: active && !e!.lifetime && !!e!.cancel_at_period_end,
    checkedAt: now,
    offline: false,
  };
}

/**
 * State to use when the server can't be reached: the cached state, with Pro kept for up to
 * GRACE_MS after the last successful check, then dropped to free (marked `stale`).
 * `offline` says whether this comes from a failed check (true) or an app start before the check.
 */
export function fromCache(cached: AccountState | null | undefined, now: number, offline = true): AccountState {
  if (!cached || cached.status !== "signed-in") return { ...SIGNED_OUT, offline };
  const age = now - (cached.checkedAt ?? 0);
  const base: AccountState = { ...cached, offline, stale: false, forced: false };
  if (!cached.pro || age <= GRACE_MS) return base;
  return { ...base, plan: "free", pro: false, lifetime: false, trialEnd: undefined, stale: true };
}

/** Applies the dev/test escape hatch on top of a state. */
export function withForce(s: AccountState, force: boolean): AccountState {
  if (!force) return s.forced ? { ...s, forced: false } : s;
  return { ...s, pro: true, plan: s.plan === "free" ? "pro" : s.plan, stale: false, forced: true };
}

function shortDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "Free", "Pro · trial until Nov 10", "Pro · Lifetime", "School"… */
export function planLabel(s: AccountState): string {
  if (s.forced) return "Pro · test mode";
  if (!s.pro) return "Free";
  if (s.plan === "school") return "School";
  if (s.lifetime) return "Pro · Lifetime";
  if (s.trialEnd) return `Pro · trial until ${shortDate(s.trialEnd)}`;
  if (s.cancels && s.periodEnd) return `Pro · until ${shortDate(s.periodEnd)}`;
  return "Pro";
}

/** Initials for the top-bar avatar. */
export function initials(s: Pick<AccountState, "name" | "email">): string {
  const n = s.name?.trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  }
  return (s.email?.[0] ?? "?").toUpperCase();
}

/** True when an error looks like "no network" rather than a real answer from the server. */
export function isNetworkError(err: unknown): boolean {
  if (!err) return false;
  const e = err as { name?: string; message?: string; status?: number };
  if (e.name === "AuthRetryableFetchError") return true;
  if (e.status === 0) return true;
  return /failed to fetch|fetch failed|networkerror|network request failed|load failed|timed? ?out|ERR_/i.test(String(e.message ?? err));
}

/** Supabase auth error → friendly English message. */
export function friendlyAuthError(err: unknown): string {
  const e = (err ?? {}) as { code?: string; message?: string; status?: number };
  const msg = String(e.message ?? "");
  if (isNetworkError(err)) return "Can't reach CarvCAM right now. Check your internet connection and try again.";
  if (e.code === "invalid_credentials" || /invalid login credentials/i.test(msg)) return "That email and password don't match. Check them and try again.";
  if (e.code === "email_not_confirmed" || /email not confirmed/i.test(msg)) return "Please confirm your email first: open the link we sent you, then sign in.";
  if (e.code === "over_request_rate_limit" || e.status === 429) return "Too many tries in a row. Wait a minute, then try again.";
  if (e.code === "user_banned") return "This account is paused. Contact CarvCAM support for help.";
  if (e.code === "validation_failed" || /missing email|invalid email/i.test(msg)) return "Enter a valid email address and your password.";
  return "Sign-in didn't work. Please try again in a moment.";
}

export interface FeatureInfo {
  title: string;
  body: string;
}

export const FEATURES: Record<ProFeature, FeatureInfo> = {
  batch: { title: "Batch carving", body: "Queue several signs and carve them one after another, with names or numbers swapped in for each one." },
  cost: { title: "Job cost and quotes", body: "See material, bit wear and machine time for every job, and turn it into a price for your customer." },
  nesting: { title: "Nesting", body: "Fit many parts on one board automatically, so you waste less wood." },
  inlay: { title: "Inlays", body: "Make matching V-carve inlay pockets and plugs that fit together on the first try." },
  cloud: { title: "Cloud projects", body: "Keep your projects in your CarvCAM account and open them on any computer, including the gControl." },
  "hosted-ai": { title: "Built-in AI assistant", body: "Describe the sign you want and the assistant lays it out for you. No API key needed." },
};
