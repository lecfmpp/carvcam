#!/usr/bin/env node
// One-time Stripe setup for CarvCAM. Run it on your own computer (Node 18+):
//   node setup-stripe.mjs
// It asks for your Stripe secret key, then, idempotently:
//   1. creates the products and prices (looked up by lookup_key, so running it twice changes nothing);
//   2. configures the Customer Portal (update card, cancel at period end, invoice history);
//   3. creates the webhook endpoint that keeps Supabase in sync, and gets its signing secret;
//   4. stores STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET as Supabase Edge Function secrets.
// The keys stay on your machine and in Supabase; nothing is printed unless you ask for it.
import { createInterface } from "node:readline";
import { spawnSync } from "node:child_process";

const PROJECT_REF = "zveqsvizefgbicwvjvdu";
const WEBHOOK_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/stripe-webhook`;
const SITE = "https://www.carvcam.com";
const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
  "charge.refunded",
  "charge.dispute.closed",
];
// Stripe Tax code for software delivered as a service / download for personal use.
const TAX_CODE = "txcd_10103000";

const PRODUCTS = [
  {
    key: "carvcam_pro",
    name: "CarvCAM Pro",
    description: "Batch production, cost and price calculator, inlays, nesting, cloud projects and hosted AI.",
    prices: [
      { lookup_key: "carvcam_pro_yearly", unit_amount: 6900, recurring: { interval: "year" }, nickname: "Pro yearly" },
      { lookup_key: "carvcam_pro_lifetime", unit_amount: 17900, nickname: "Pro lifetime" },
    ],
  },
  {
    key: "carvcam_school",
    name: "CarvCAM School / Makerspace",
    description: "Pro for one classroom or makerspace, up to 10 seats.",
    prices: [{ lookup_key: "carvcam_school_yearly", unit_amount: 29900, recurring: { interval: "year" }, nickname: "School yearly" }],
  },
];

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = (s) => rl.output.write(s.includes(question) ? s : "*".repeat(s.length ? 1 : 0));
    rl.question(question, (a) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(a.trim());
    });
  });
}

// Minimal Stripe REST client (form-encoded bodies, nested keys like a[b][0]=c).
function form(obj, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (typeof item === "object" ? form(item, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(item))));
    else if (typeof v === "object") form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}
let KEY = "";
async function api(method, path, body) {
  const url = new URL(`https://api.stripe.com/v1/${path}`);
  if (method === "GET" && body) url.search = form(body).toString();
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Version": "2025-02-24.acacia" },
    body: method === "GET" ? undefined : form(body ?? {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${method} /${path}: ${data.error?.message ?? res.status}`);
  return data;
}

async function main() {
  console.log("\nCarvCAM · Stripe setup\n");
  KEY = process.env.STRIPE_SECRET_KEY || (await ask("Stripe secret key (sk_test_… or sk_live_…, or a restricted rk_…): ", { hidden: true }));
  if (!/^(sk|rk)_(test|live)_/.test(KEY)) throw new Error("That doesn't look like a Stripe secret key.");
  const live = KEY.includes("_live_");

  const account = await api("GET", "account");
  console.log(`Account: ${account.settings?.dashboard?.display_name || account.business_profile?.name || account.id} (${account.id}) · ${live ? "LIVE mode" : "test mode"}`);
  if ((await ask("Is this the CarvCAM account? Type yes to continue: ")).toLowerCase() !== "yes") return console.log("Stopped. Nothing was changed.");

  // 1. Products and prices
  for (const p of PRODUCTS) {
    const found = await api("GET", "products/search", { query: `metadata['carvcam_key']:'${p.key}'` });
    const product = found.data[0] ?? (await api("POST", "products", { name: p.name, description: p.description, tax_code: TAX_CODE, metadata: { carvcam_key: p.key } }));
    for (const pr of p.prices) {
      const existing = await api("GET", "prices", { lookup_keys: [pr.lookup_key], active: true, limit: 1 });
      if (existing.data[0]) {
        console.log(`✓ ${pr.nickname}: already exists (${existing.data[0].id})`);
        continue;
      }
      const price = await api("POST", "prices", { product: product.id, currency: "usd", tax_behavior: "exclusive", ...pr });
      console.log(`✓ ${pr.nickname}: created ${price.id} (US$ ${(pr.unit_amount / 100).toFixed(2)}${pr.recurring ? "/" + pr.recurring.interval : " one-time"})`);
    }
  }

  // 2. Customer Portal
  const configs = await api("GET", "billing_portal/configurations", { is_default: true, limit: 1 });
  const portal = {
    business_profile: { headline: "Manage your CarvCAM plan", privacy_policy_url: `${SITE}/privacy/`, terms_of_service_url: `${SITE}/terms/` },
    default_return_url: `${SITE}/account/`,
    features: {
      customer_update: { enabled: true, allowed_updates: ["email", "address", "tax_id", "name"] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end", cancellation_reason: { enabled: true, options: ["too_expensive", "missing_features", "switched_service", "unused", "other"] } },
    },
  };
  if (configs.data[0]) await api("POST", `billing_portal/configurations/${configs.data[0].id}`, portal);
  else await api("POST", "billing_portal/configurations", portal);
  console.log("✓ Customer Portal configured");

  // 3. Webhook endpoint (a new signing secret only comes back when the endpoint is created)
  const hooks = await api("GET", "webhook_endpoints", { limit: 100 });
  let secret = process.env.STRIPE_WEBHOOK_SECRET || "";
  const hook = hooks.data.find((h) => h.url === WEBHOOK_URL);
  if (hook && !secret) {
    console.log("A webhook for Supabase already exists; replacing it to get a fresh signing secret.");
    await api("DELETE", `webhook_endpoints/${hook.id}`);
  }
  if (!hook || !process.env.STRIPE_WEBHOOK_SECRET) {
    const created = await api("POST", "webhook_endpoints", { url: WEBHOOK_URL, enabled_events: WEBHOOK_EVENTS, description: "CarvCAM → Supabase entitlements", api_version: "2025-02-24.acacia" });
    secret = created.secret;
    console.log(`✓ Webhook created: ${WEBHOOK_URL}`);
  }

  // 4. Supabase secrets
  console.log("\nSaving the keys as Supabase Edge Function secrets (the Supabase CLI may open your browser to log in)…");
  const login = spawnSync("npx", ["-y", "supabase@latest", "projects", "list"], { stdio: "ignore", shell: process.platform === "win32" });
  if (login.status !== 0) spawnSync("npx", ["-y", "supabase@latest", "login"], { stdio: "inherit", shell: process.platform === "win32" });
  const set = spawnSync("npx", ["-y", "supabase@latest", "secrets", "set", "--project-ref", PROJECT_REF, `STRIPE_SECRET_KEY=${KEY}`, `STRIPE_WEBHOOK_SECRET=${secret}`], { stdio: "inherit", shell: process.platform === "win32" });
  if (set.status === 0) {
    console.log("\n✓ Done. Tell Claude: \"Stripe setup finished\" " + (live ? "(live mode)." : "(test mode)."));
  } else {
    console.log("\nCouldn't save the secrets with the Supabase CLI. Add them by hand in");
    console.log(`https://supabase.com/dashboard/project/${PROJECT_REF}/functions/secrets`);
    console.log("  STRIPE_SECRET_KEY     = the key you typed above");
    if ((await ask("Show the webhook signing secret to copy it? (yes/no): ")).toLowerCase() === "yes") console.log(`  STRIPE_WEBHOOK_SECRET = ${secret}`);
  }
}

main().catch((e) => {
  console.error(`\n✗ ${e.message}`);
  process.exit(1);
});
