// CarvCAM accounts: sign up, log in, password reset, onboarding wizard and the account page.
// Talks to Supabase Auth and the REST API directly (auth-js + postgrest-js, vendored in supabase.js).
import { AuthClient, PostgrestClient } from "./supabase.js";

const cfg = JSON.parse(document.getElementById("sb-config").textContent);
const root = (p) => cfg.base + p.replace(/^\//, "");
const absolute = (p) => new URL(root(p), location.href).href;

const auth = new AuthClient({
  url: `${cfg.url}/auth/v1`,
  headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` },
  storageKey: `sb-${new URL(cfg.url).hostname.split(".")[0]}-auth-token`,
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: true,
  flowType: "pkce",
});

// REST calls carry the signed-in user's token so row level security applies.
const db = new PostgrestClient(`${cfg.url}/rest/v1`, {
  headers: { apikey: cfg.key },
  fetch: async (input, init = {}) => {
    const { data } = await auth.getSession();
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${data.session?.access_token ?? cfg.key}`);
    return fetch(input, { ...init, headers });
  },
});

// Calls a Supabase Edge Function as the signed-in user.
async function callFn(name, body = {}) {
  const { data } = await auth.getSession();
  const res = await fetch(`${cfg.url}/functions/v1/${name}`, {
    method: "POST",
    headers: { apikey: cfg.key, Authorization: `Bearer ${data.session?.access_token ?? cfg.key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || `Request failed (${res.status})`);
  return out;
}

// Where to go after sign-up and onboarding (e.g. back to the plan someone picked on /pricing/).
const NEXT_KEY = "carvcam-next";
const safeNext = (n) => (n && n.startsWith("/") && !n.startsWith("//") ? n : null);
const rememberNext = (n) => { try { if (safeNext(n)) localStorage.setItem(NEXT_KEY, n); } catch {} };
const takeNext = () => { try { const n = localStorage.getItem(NEXT_KEY); localStorage.removeItem(NEXT_KEY); return safeNext(n); } catch { return null; } };

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

function say(form, text, kind = "error") {
  const box = $(".auth__msg", form);
  box.textContent = text;
  box.dataset.kind = kind;
  box.hidden = !text;
}

function busy(form, on) {
  const btn = $("button[type=submit]", form);
  if (!btn) return;
  btn.disabled = on;
  btn.dataset.label ??= btn.textContent;
  btn.textContent = on ? "Please wait…" : btn.dataset.label;
}

// Supabase error codes → plain English the user can act on.
function friendly(error) {
  const code = error?.code || "";
  const msg = error?.message || String(error);
  if (code === "invalid_credentials") return "That e-mail and password don't match. Try again or reset your password.";
  if (code === "email_not_confirmed") return "Confirm your e-mail first: open the link we sent you.";
  if (code === "user_already_exists" || /already registered/i.test(msg)) return "There is already an account with this e-mail. Log in instead.";
  if (code === "weak_password") return "Choose a stronger password (at least 8 characters, mixing letters and numbers).";
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit") return "Too many attempts. Wait a minute and try again.";
  if (/fetch|network/i.test(msg)) return "Can't reach the server. Check your connection and try again.";
  return msg;
}

async function onboardingDone(userId) {
  const { data } = await db.from("onboarding_responses").select("completed_at").eq("user_id", userId).maybeSingle();
  return !!data?.completed_at;
}

async function afterLogin(user) {
  const next = new URLSearchParams(location.search).get("next");
  if (next && next.startsWith("/") && !next.startsWith("//")) return location.assign(next);
  location.assign(root((await onboardingDone(user.id)) ? "/account/" : "/onboarding/"));
}

/* ---------------- sign up ---------------- */
async function signupPage(form) {
  rememberNext(new URLSearchParams(location.search).get("next"));
  const { data } = await auth.getSession();
  if (data.session) return afterLogin(data.session.user);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    if (String(f.get("password")).length < 8) return say(form, "Use at least 8 characters for your password.");
    busy(form, true);
    say(form, "");
    const { data, error } = await auth.signUp({
      email: String(f.get("email")).trim(),
      password: String(f.get("password")),
      options: { data: { full_name: String(f.get("name")).trim() }, emailRedirectTo: absolute("/onboarding/") },
    });
    busy(form, false);
    if (error) return say(form, friendly(error));
    // With e-mail confirmation on, there is no session until the link is opened.
    if (!data.session) {
      form.hidden = true;
      $("[data-sent]").hidden = false;
      $("[data-sent-to]").textContent = String(f.get("email")).trim();
      return;
    }
    location.assign(root("/onboarding/"));
  });
}

/* ---------------- log in ---------------- */
async function loginPage(form) {
  const { data } = await auth.getSession();
  if (data.session) return afterLogin(data.session.user);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    busy(form, true);
    say(form, "");
    const { data, error } = await auth.signInWithPassword({ email: String(f.get("email")).trim(), password: String(f.get("password")) });
    busy(form, false);
    if (error) return say(form, friendly(error));
    afterLogin(data.user);
  });
  $("[data-forgot]")?.addEventListener("click", async () => {
    const email = String(new FormData(form).get("email")).trim();
    if (!email) return say(form, "Type your e-mail above, then click “Forgot password?” again.");
    const { error } = await auth.resetPasswordForEmail(email, { redirectTo: absolute("/reset-password/") });
    say(form, error ? friendly(error) : `If ${email} has an account, a reset link is on its way.`, error ? "error" : "ok");
  });
}

/* ---------------- reset password (from the e-mail link) ---------------- */
async function resetPage(form) {
  const { data } = await auth.getSession();
  if (!data.session) say(form, "This reset link has expired. Request a new one from the log-in page.");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const password = String(new FormData(form).get("password"));
    if (password.length < 8) return say(form, "Use at least 8 characters for your password.");
    busy(form, true);
    const { error } = await auth.updateUser({ password });
    busy(form, false);
    if (error) return say(form, friendly(error));
    say(form, "Password updated. Taking you to your account…", "ok");
    setTimeout(() => location.assign(root("/account/")), 900);
  });
}

/* ---------------- onboarding wizard ---------------- */
async function requireUser() {
  const { data } = await auth.getSession();
  if (!data.session) {
    location.replace(root(`/login/?next=${encodeURIComponent(location.pathname)}`));
    return null;
  }
  return data.session.user;
}

async function onboardingPage(form) {
  const user = await requireUser();
  if (!user) return;
  $("[data-hello]").textContent = user.user_metadata?.full_name?.split(" ")[0] || "there";
  const steps = $$(".wiz__step", form);
  const dots = $$(".wiz__dot");
  let at = 0;

  // Fill in earlier answers so the wizard can be resumed or edited.
  const { data: saved } = await db.from("onboarding_responses").select("*").eq("user_id", user.id).maybeSingle();
  if (saved) {
    for (const [k, v] of Object.entries(saved)) {
      if (Array.isArray(v)) $$(`input[name="${k}"]`, form).forEach((i) => (i.checked = v.includes(i.value)));
      else if (v != null) $$(`[name="${k}"]`, form).forEach((i) => (i.type === "radio" ? (i.checked = i.value === v) : (i.value = v)));
    }
  }

  const collect = () => {
    const f = new FormData(form);
    const many = (n) => f.getAll(n).map(String);
    const one = (n) => (f.get(n) ? String(f.get(n)).trim() || null : null);
    return {
      user_id: user.id,
      project_types: many("project_types"),
      project_types_other: one("project_types_other"),
      purpose: one("purpose"),
      sales_channels: one("purpose") && one("purpose") !== "hobby" ? many("sales_channels") : [],
      machine_brand: one("machine_brand"),
      machine_model: one("machine_model"),
      work_area: one("work_area"),
      spindle: one("spindle"),
      design_software: many("design_software"),
      cam_software: many("cam_software"),
      control_software: many("control_software"),
      software_other: one("software_other"),
      expectations: many("expectations"),
      wanted_features: one("wanted_features"),
      biggest_frustration: one("biggest_frustration"),
    };
  };

  const save = async (complete = false) => {
    const row = collect();
    if (complete) row.completed_at = new Date().toISOString();
    const { error } = await db.from("onboarding_responses").upsert(row, { onConflict: "user_id" });
    if (error) throw error;
  };

  // A step is ready when its required group has an answer.
  const ready = (step) => {
    const need = step.dataset.require;
    if (!need) return true;
    return $$(`[name="${need}"]`, step).some((i) => (i.type === "checkbox" || i.type === "radio" ? i.checked : i.value.trim()));
  };

  const show = (i) => {
    at = Math.max(0, Math.min(steps.length - 1, i));
    steps.forEach((s, j) => (s.hidden = j !== at));
    dots.forEach((d, j) => {
      d.classList.toggle("on", j <= at);
      d.setAttribute("aria-current", j === at ? "step" : "false");
    });
    $("[data-back]").hidden = at === 0;
    $("[data-next]").textContent = at === steps.length - 1 ? "Finish" : "Continue";
    $("[data-count]").textContent = `Step ${at + 1} of ${steps.length}`;
    syncSales();
    say(form, "");
    steps[at].querySelector("input, select, textarea")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Sales channels only matter when they sell what they make.
  const syncSales = () => {
    const p = new FormData(form).get("purpose");
    $("[data-sales]").hidden = !p || p === "hobby" || p === "education";
  };
  form.addEventListener("change", syncSales);

  // Model suggestions follow the chosen brand.
  const models = JSON.parse($("#machine-models").textContent);
  const list = $("#model-list");
  const syncModels = () => {
    const brand = new FormData(form).get("machine_brand");
    list.innerHTML = (models[brand] || []).map((m) => `<option value="${m}">`).join("");
  };
  form.addEventListener("change", (e) => e.target.name === "machine_brand" && syncModels());
  syncModels();

  $("[data-back]").addEventListener("click", () => show(at - 1));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!ready(steps[at])) return say(form, steps[at].dataset.requireMsg || "Pick at least one answer to continue.");
    const last = at === steps.length - 1;
    busy(form, true);
    try {
      await save(last);
    } catch (err) {
      busy(form, false);
      return say(form, friendly(err));
    }
    busy(form, false);
    if (last) location.assign(takeNext() || root("/account/?welcome=1"));
    else show(at + 1);
  });
  $("[data-skip]")?.addEventListener("click", async () => {
    await save(false).catch(() => {});
    location.assign(root("/account/"));
  });
  show(0);
}

/* ---------------- account ---------------- */
async function accountPage(el) {
  const user = await requireUser();
  if (!user) return;
  const [{ data: profile }, done] = await Promise.all([
    db.from("profiles").select("full_name, email, role").eq("id", user.id).single(),
    onboardingDone(user.id),
  ]);
  $("[data-name]", el).textContent = profile?.full_name || user.email;
  $("[data-email]", el).textContent = profile?.email || user.email;
  $("[data-role]", el).textContent = profile?.role === "admin" ? "Admin" : "Customer";
  $("[data-welcome]", el).hidden = !new URLSearchParams(location.search).has("welcome");
  $("[data-onboarding]", el).hidden = done;
  $("[data-edit-answers]", el).hidden = !done;
  $("[data-admin]", el).hidden = profile?.role !== "admin";
  el.hidden = false;
  await showPlan(el, user);
  $("[data-logout]", el).addEventListener("click", async () => {
    await auth.signOut();
    location.assign(root("/login/"));
  });
}

/* ---------------- plan and billing ---------------- */
const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
const hasPro = (e) => !!e && (e.plan === "pro" || e.plan === "school") && (e.lifetime || e.source === "manual" || ["trialing", "active", "past_due"].includes(e.status));

async function showPlan(el, user) {
  const box = $("[data-plan-box]", el);
  if (!box) return;
  const params = new URLSearchParams(location.search);
  let e = null;
  // Right after Checkout the webhook may still be on its way: look a few times.
  for (let i = 0; i < (params.get("checkout") === "success" ? 6 : 1); i++) {
    ({ data: e } = await db.from("entitlements").select("*").eq("user_id", user.id).maybeSingle());
    if (hasPro(e) || params.get("checkout") !== "success") break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  const pro = hasPro(e);
  const name = !pro ? "Free" : e.plan === "school" ? "School / Makerspace" : e.lifetime ? "Pro · Lifetime" : "Pro";
  let detail = "Design, check and carve with no limit on cuts.";
  if (pro && e.lifetime) detail = "Pro forever. Thanks for backing CarvCAM.";
  else if (pro && e.status === "trialing" && e.trial_end) detail = `Free trial until ${fmtDate(e.trial_end)}. ${e.cancel_at_period_end ? "It won't renew." : "Then $69/year."}`;
  else if (pro && e.status === "past_due") detail = "Your last payment didn't go through. Update your card to keep Pro.";
  else if (pro && e.current_period_end) detail = `${e.cancel_at_period_end ? "Ends" : "Renews"} on ${fmtDate(e.current_period_end)}.`;
  else if (pro && e.source === "manual") detail = "Granted by the CarvCAM team.";
  $("[data-plan-name]", box).textContent = name;
  $("[data-plan-detail]", box).textContent = detail;
  $("[data-upgrade]", box).hidden = pro;
  const manage = $("[data-manage]", box);
  manage.hidden = !e || e.source === "manual" || (!e.stripe_subscription_id && !e.lifetime);
  manage.onclick = async () => {
    manage.disabled = true;
    try {
      location.assign((await callFn("create-portal")).url);
    } catch (err) {
      manage.disabled = false;
      $("[data-plan-detail]", box).textContent = friendly(err);
    }
  };
  if (params.get("checkout") === "success") $("[data-paid]", el).hidden = !pro;
  box.hidden = false;
}

async function pricingPage(el) {
  const msg = $(".plans__msg", el);
  const params = new URLSearchParams(location.search);
  if (params.get("checkout") === "canceled") Object.assign(msg, { textContent: "Checkout canceled. Nothing was charged.", hidden: false }), (msg.dataset.kind = "ok");
  const { data } = await auth.getSession();
  if (data.session) {
    const { data: e } = await db.from("entitlements").select("*").eq("user_id", data.session.user.id).maybeSingle();
    if (hasPro(e)) {
      $$("[data-plan]", el).forEach((b) => ((b.disabled = true), (b.textContent = "You have Pro")));
      return;
    }
  }
  const start = async (plan, btn) => {
    const { data } = await auth.getSession();
    if (!data.session) return location.assign(root(`/signup/?next=${encodeURIComponent(location.pathname + "?plan=" + plan)}`));
    btn && (btn.disabled = true, btn.dataset.label ??= btn.textContent, btn.textContent = "Opening checkout…");
    try {
      location.assign((await callFn("create-checkout", { plan })).url);
    } catch (err) {
      if (btn) (btn.disabled = false), (btn.textContent = btn.dataset.label);
      Object.assign(msg, { textContent: friendly(err), hidden: false });
      msg.dataset.kind = "error";
    }
  };
  $$("[data-plan]", el).forEach((b) => b.addEventListener("click", () => start(b.dataset.plan, b)));
  // Back from sign-up or log-in with a plan already chosen.
  const chosen = params.get("plan");
  if (chosen && data.session) start(chosen, $(`[data-plan="${chosen}"]`, el));
}

const page = document.querySelector("[data-account]");
const run = { signup: signupPage, login: loginPage, reset: resetPage, onboarding: onboardingPage, account: accountPage, pricing: pricingPage }[page?.dataset.account];
run?.(page).catch((err) => {
  const form = page.closest("form") || page.querySelector("form") || page;
  if ($(".auth__msg", form)) say(form, friendly(err));
  else console.error(err);
});
