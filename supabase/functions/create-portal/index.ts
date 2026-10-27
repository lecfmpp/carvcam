// POST with the user's JWT → { url } of the Stripe Customer Portal (change card, cancel, invoices).
import { admin, cors, json, siteBase, stripe, userFrom } from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  try {
    const user = await userFrom(req);
    if (!user) return json(req, { error: "Log in first." }, 401);
    const { data } = await admin.from("billing_customers").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
    if (!data) return json(req, { error: "No billing account yet." }, 404);
    const portal = await stripe.billingPortal.sessions.create({ customer: data.stripe_customer_id, return_url: `${siteBase(req)}/account/` });
    return json(req, { url: portal.url });
  } catch (err) {
    console.error("[create-portal]", err);
    return json(req, { error: "Could not open billing. Try again in a minute." }, 500);
  }
});
