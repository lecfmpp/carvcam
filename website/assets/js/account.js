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
    if (last) location.assign(root("/account/?welcome=1"));
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
  $("[data-logout]", el).addEventListener("click", async () => {
    await auth.signOut();
    location.assign(root("/login/"));
  });
}

const page = document.querySelector("[data-account]");
const run = { signup: signupPage, login: loginPage, reset: resetPage, onboarding: onboardingPage, account: accountPage }[page?.dataset.account];
run?.(page).catch((err) => {
  const form = page.closest("form") || page.querySelector("form") || page;
  if ($(".auth__msg", form)) say(form, friendly(err));
  else console.error(err);
});
