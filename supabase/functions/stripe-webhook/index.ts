// Stripe → Supabase: keeps public.entitlements in sync with subscriptions and lifetime purchases.
// Deployed with JWT verification off; every request is authenticated by its Stripe signature instead.
import type Stripe from "npm:stripe@17.7.0";
import { admin, stripe } from "../_shared/common.ts";

const crypto = (await import("npm:stripe@17.7.0")).default.createSubtleCryptoProvider();
const SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

async function userIdFor(customerId: string, metadataUserId?: string | null): Promise<string | null> {
  if (metadataUserId) return metadataUserId;
  const { data } = await admin.from("billing_customers").select("user_id").eq("stripe_customer_id", customerId).maybeSingle();
  return data?.user_id ?? null;
}

const at = (seconds?: number | null) => (seconds ? new Date(seconds * 1000).toISOString() : null);

async function syncSubscription(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const userId = await userIdFor(customerId, sub.metadata?.user_id);
  if (!userId) return console.warn("[webhook] no account for customer", customerId);

  const { data: current } = await admin.from("entitlements").select("lifetime").eq("user_id", userId).maybeSingle();
  if (current?.lifetime) return; // a lifetime license outranks any subscription state

  const item = sub.items.data[0];
  const lookup = item?.price?.lookup_key ?? null;
  const ended = sub.status === "canceled" || sub.status === "incomplete_expired" || sub.status === "unpaid";
  await admin.from("entitlements").upsert({
    user_id: userId,
    plan: ended ? "free" : lookup === "carvcam_school_yearly" ? "school" : "pro",
    source: lookup === "carvcam_school_yearly" ? "school" : "subscription",
    status: sub.status,
    stripe_subscription_id: sub.id,
    stripe_price_lookup_key: lookup,
    current_period_end: at(item?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end),
    trial_end: at(sub.trial_end),
    cancel_at_period_end: sub.cancel_at_period_end,
  });
}

async function grantLifetime(session: Stripe.Checkout.Session) {
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  const userId = await userIdFor(customerId ?? "", session.metadata?.user_id ?? session.client_reference_id);
  if (!userId) return console.warn("[webhook] lifetime purchase without account", session.id);
  await admin.from("entitlements").upsert({
    user_id: userId,
    plan: "pro",
    source: "lifetime",
    status: "active",
    lifetime: true,
    stripe_price_lookup_key: "carvcam_pro_lifetime",
    current_period_end: null,
    cancel_at_period_end: false,
  });
  // Someone moving from yearly to lifetime shouldn't be billed again next year.
  const { data } = await admin.from("entitlements").select("stripe_subscription_id").eq("user_id", userId).maybeSingle();
  if (data?.stripe_subscription_id) await stripe.subscriptions.cancel(data.stripe_subscription_id).catch(() => {});
}

// A full refund or a lost dispute of a lifetime purchase removes the license.
async function revokeLifetime(charge: Stripe.Charge) {
  // The plan is tagged on the PaymentIntent by create-checkout.
  const piId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  const meta = piId ? (await stripe.paymentIntents.retrieve(piId)).metadata : charge.metadata;
  if (meta?.plan !== "pro_lifetime") return;
  const customerId = typeof charge.customer === "string" ? charge.customer : charge.customer?.id ?? "";
  const userId = await userIdFor(customerId, meta?.user_id);
  if (!userId) return;
  await admin.from("entitlements").update({ plan: "free", lifetime: false, status: "refunded", source: null }).eq("user_id", userId).eq("lifetime", true);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, req.headers.get("Stripe-Signature") ?? "", SECRET, undefined, crypto);
  } catch (err) {
    return new Response(`Bad signature: ${(err as Error).message}`, { status: 400 });
  }

  // Apply each event once, even when Stripe retries it.
  const { error: dup } = await admin.from("stripe_events").insert({ id: event.id, type: event.type });
  if (dup) return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.mode === "payment" && s.payment_status === "paid" && s.metadata?.plan === "pro_lifetime") await grantLifetime(s);
        if (s.mode === "subscription" && s.subscription) await syncSubscription(await stripe.subscriptions.retrieve(s.subscription as string));
        break;
      }
      case "checkout.session.async_payment_succeeded": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.metadata?.plan === "pro_lifetime") await grantLifetime(s);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed":
        // Re-read the subscription so an event delivered out of order can't overwrite a newer state.
        await syncSubscription(await stripe.subscriptions.retrieve((event.data.object as Stripe.Subscription).id));
        break;
      case "invoice.paid":
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice & { parent?: { subscription_details?: { subscription?: string } } };
        const subId = (inv.subscription as string | null) ?? inv.parent?.subscription_details?.subscription;
        if (subId) await syncSubscription(await stripe.subscriptions.retrieve(subId));
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        if (charge.refunded) await revokeLifetime(charge);
        break;
      }
      case "charge.dispute.closed": {
        const dispute = event.data.object as Stripe.Dispute;
        if (dispute.status === "lost") await revokeLifetime(await stripe.charges.retrieve(dispute.charge as string));
        break;
      }
    }
  } catch (err) {
    // Let Stripe retry: forget the event so the retry is processed.
    await admin.from("stripe_events").delete().eq("id", event.id);
    console.error("[webhook]", event.type, err);
    return new Response("Handler error", { status: 500 });
  }
  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
});
