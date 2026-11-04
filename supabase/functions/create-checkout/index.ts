// POST { plan: "pro_yearly" | "pro_lifetime" | "school_yearly" } with the user's JWT → { url } of a Stripe Checkout page.
import { cors, customerFor, json, PRICES, type PlanKey, siteBase, stripe, userFrom } from "../_shared/common.ts";

const TRIAL_DAYS = 14;
// Stripe Tax must be activated (with the head office address) in the Dashboard first; set STRIPE_AUTOMATIC_TAX=off to sell without it.
const AUTOMATIC_TAX = (Deno.env.get("STRIPE_AUTOMATIC_TAX") ?? "on") !== "off";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  try {
    const user = await userFrom(req);
    if (!user) return json(req, { error: "Log in first." }, 401);

    const { plan } = (await req.json().catch(() => ({}))) as { plan?: PlanKey };
    if (!plan || !(plan in PRICES)) return json(req, { error: "Unknown plan." }, 400);

    const { data: prices } = await stripe.prices.list({ lookup_keys: [PRICES[plan]], active: true, limit: 1 });
    const price = prices[0];
    if (!price) return json(req, { error: "This plan is not available yet." }, 503);

    const customer = await customerFor(user);
    const base = siteBase(req);
    const recurring = price.type === "recurring";

    const session = await stripe.checkout.sessions.create({
      mode: recurring ? "subscription" : "payment",
      customer,
      client_reference_id: user.id,
      line_items: [{ price: price.id, quantity: 1 }],
      automatic_tax: { enabled: AUTOMATIC_TAX },
      ...(AUTOMATIC_TAX ? { customer_update: { address: "auto", name: "auto" }, tax_id_collection: { enabled: true } } : {}),
      billing_address_collection: "auto",
      allow_promotion_codes: true,
      success_url: `${base}/account/?checkout=success`,
      cancel_url: `${base}/pricing/?checkout=canceled`,
      metadata: { user_id: user.id, plan },
      ...(recurring
        ? {
            subscription_data: {
              metadata: { user_id: user.id, plan },
              // The 14-day trial is for Pro only; schools pay up front.
              ...(plan === "pro_yearly" ? { trial_period_days: TRIAL_DAYS, trial_settings: { end_behavior: { missing_payment_method: "cancel" } } } : {}),
            },
            payment_method_collection: "always",
          }
        : { invoice_creation: { enabled: true, invoice_data: { metadata: { user_id: user.id, plan } } }, payment_intent_data: { metadata: { user_id: user.id, plan } } }),
    });
    return json(req, { url: session.url });
  } catch (err) {
    console.error("[create-checkout]", err);
    return json(req, { error: "Could not start checkout. Try again in a minute." }, 500);
  }
});
