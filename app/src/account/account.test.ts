import { describe, expect, it } from "vitest";
import { entitlementActive, friendlyAuthError, fromCache, GRACE_MS, initials, isNetworkError, planLabel, toAccountState, withForce, type AccountState, type EntitlementRow } from "./logic";

const NOW = Date.parse("2026-10-27T12:00:00Z");
const DAY = 86400000;
const user = { email: "maker@example.com" };
const profile = { email: "maker@example.com", full_name: "Ada Maker" };

const ent = (o: Partial<EntitlementRow>): EntitlementRow => ({ plan: "pro", source: "subscription", status: "active", lifetime: false, ...o });

describe("entitlement → AccountState", () => {
  it("no row or free plan → free", () => {
    for (const e of [null, ent({ plan: "free" })]) {
      const s = toAccountState(user, profile, e, NOW);
      expect(s).toMatchObject({ status: "signed-in", plan: "free", pro: false, lifetime: false, name: "Ada Maker", email: "maker@example.com", checkedAt: NOW, offline: false });
    }
  });

  it("live Stripe statuses unlock Pro, others don't", () => {
    for (const status of ["trialing", "active", "past_due"]) expect(entitlementActive(ent({ status }))).toBe(true);
    for (const status of ["canceled", "unpaid", "incomplete", "incomplete_expired", "paused", null]) expect(entitlementActive(ent({ status }))).toBe(false);
  });

  it("lifetime and manual grants are Pro regardless of status", () => {
    expect(entitlementActive(ent({ source: "lifetime", lifetime: true, status: null }))).toBe(true);
    expect(entitlementActive(ent({ source: "manual", status: "canceled" }))).toBe(true);
    expect(entitlementActive(ent({ plan: "free", source: "manual" }))).toBe(false);
  });

  it("school plan", () => {
    const s = toAccountState(user, profile, ent({ plan: "school", source: "school", status: "active" }), NOW);
    expect(s).toMatchObject({ plan: "school", pro: true });
  });

  it("trial and period dates", () => {
    const s = toAccountState(user, null, ent({ status: "trialing", trial_end: "2026-11-10T12:00:00Z", current_period_end: "2026-11-10T12:00:00Z" }), NOW);
    expect(s.trialEnd).toBe("2026-11-10T12:00:00Z");
    expect(s.periodEnd).toBe("2026-11-10T12:00:00Z");
    expect(s.name).toBeUndefined();
    expect(s.email).toBe("maker@example.com");
    const active = toAccountState(user, null, ent({ status: "active", trial_end: "2026-10-01T00:00:00Z" }), NOW);
    expect(active.trialEnd).toBeUndefined();
  });
});

describe("30-day offline grace", () => {
  const pro: AccountState = { ...toAccountState(user, profile, ent({}), NOW - 10 * DAY) };

  it("keeps Pro within 30 days of the last check, marked offline", () => {
    const s = fromCache(pro, NOW);
    expect(s).toMatchObject({ status: "signed-in", pro: true, plan: "pro", offline: true, stale: false, checkedAt: NOW - 10 * DAY });
    expect(fromCache({ ...pro, checkedAt: NOW - GRACE_MS }, NOW).pro).toBe(true);
  });

  it("drops to free after 30 days and flags it as stale", () => {
    const s = fromCache({ ...pro, checkedAt: NOW - GRACE_MS - 1 }, NOW);
    expect(s).toMatchObject({ status: "signed-in", pro: false, plan: "free", lifetime: false, offline: true, stale: true, email: "maker@example.com" });
  });

  it("lifetime follows the same rule", () => {
    const life = toAccountState(user, profile, ent({ source: "lifetime", lifetime: true }), NOW - 40 * DAY);
    expect(fromCache(life, NOW).pro).toBe(false);
    expect(fromCache(life, NOW - 15 * DAY).pro).toBe(true);
  });

  it("free accounts are never stale; no cache → signed out", () => {
    const free = toAccountState(user, profile, null, NOW - 90 * DAY);
    expect(fromCache(free, NOW)).toMatchObject({ pro: false, stale: false, status: "signed-in" });
    expect(fromCache(null, NOW)).toMatchObject({ status: "signed-out", pro: false, offline: true });
  });

  it("app start from cache is not offline yet", () => {
    expect(fromCache(pro, NOW, false).offline).toBe(false);
  });
});

describe("labels", () => {
  const base = (o: Partial<EntitlementRow>) => toAccountState(user, profile, ent(o), NOW);
  it("plan labels", () => {
    expect(planLabel(toAccountState(user, profile, null, NOW))).toBe("Free");
    expect(planLabel(base({ status: "trialing", trial_end: "2026-11-10T12:00:00Z" }))).toBe("Pro · trial until Nov 10");
    expect(planLabel(base({ source: "lifetime", lifetime: true }))).toBe("Pro · Lifetime");
    expect(planLabel(base({ plan: "school", source: "school" }))).toBe("School");
    expect(planLabel(base({}))).toBe("Pro");
    expect(planLabel(base({ cancel_at_period_end: true, current_period_end: "2026-12-03T12:00:00Z" }))).toBe("Pro · until Dec 3");
    expect(planLabel({ status: "signed-out", plan: "free", pro: false, lifetime: false, offline: false })).toBe("Free");
  });

  it("force-pro escape hatch", () => {
    const out: AccountState = { status: "signed-out", plan: "free", pro: false, lifetime: false, offline: false };
    const f = withForce(out, true);
    expect(f).toMatchObject({ pro: true, plan: "pro", forced: true, status: "signed-out" });
    expect(planLabel(f)).toBe("Pro · test mode");
    expect(withForce(out, false)).toBe(out);
  });

  it("initials", () => {
    expect(initials({ name: "Ada Maker" })).toBe("AM");
    expect(initials({ name: "  cher " })).toBe("C");
    expect(initials({ email: "bob@x.com" })).toBe("B");
    expect(initials({})).toBe("?");
  });
});

describe("friendly errors", () => {
  it("maps Supabase errors", () => {
    expect(friendlyAuthError({ code: "invalid_credentials", message: "Invalid login credentials", status: 400 })).toMatch(/don't match/);
    expect(friendlyAuthError({ message: "Invalid login credentials" })).toMatch(/don't match/);
    expect(friendlyAuthError({ code: "email_not_confirmed", message: "Email not confirmed" })).toMatch(/confirm your email/);
    expect(friendlyAuthError({ name: "AuthRetryableFetchError", message: "Failed to fetch", status: 0 })).toMatch(/internet/);
    expect(friendlyAuthError(new TypeError("Failed to fetch"))).toMatch(/internet/);
    expect(friendlyAuthError({ status: 429, message: "rate limit" })).toMatch(/Too many/);
    expect(friendlyAuthError({ message: "weird" })).toMatch(/try again/);
  });
  it("network detection", () => {
    expect(isNetworkError({ message: "TypeError: Failed to fetch" })).toBe(true);
    expect(isNetworkError({ message: "JWT expired", status: 401 })).toBe(false);
    expect(isNetworkError(null)).toBe(false);
  });
});
