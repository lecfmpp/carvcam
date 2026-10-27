// Shared helpers for the billing Edge Functions.
import Stripe from "npm:stripe@17.7.0";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.49.4";

export const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  // Pinned so a Stripe API upgrade never changes payloads under us.
  apiVersion: "2025-02-24.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});

// Service-role client: bypasses RLS, so it only runs on the server.
export const admin: SupabaseClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Price lookup keys created in Stripe. Checkout looks prices up by key, so price ids never live in code.
export const PRICES = {
  pro_yearly: "carvcam_pro_yearly",
  pro_lifetime: "carvcam_pro_lifetime",
  school_yearly: "carvcam_school_yearly",
} as const;
export type PlanKey = keyof typeof PRICES;

// Browsers may call these functions only from the CarvCAM site (production, Netlify previews, local dev).
const ORIGINS = [/^https:\/\/(www\.)?carvcam\.com$/, /^https:\/\/[a-z0-9-]+--carvcam\.netlify\.app$/, /^https:\/\/carvcam\.netlify\.app$/, /^http:\/\/localhost:\d+$/];
export function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.some((r) => r.test(origin)) ? origin : "https://www.carvcam.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

export const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });

// The signed-in user behind the request's JWT, or null.
export async function userFrom(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data.user;
}

// Only return URLs on the site that called us, so Checkout can't be turned into an open redirect.
export function siteBase(req: Request): string {
  const origin = req.headers.get("origin") ?? "";
  return ORIGINS.some((r) => r.test(origin)) ? origin : "https://www.carvcam.com";
}

// One Stripe customer per account, created on first purchase and remembered in billing_customers.
export async function customerFor(user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }) {
  const { data } = await admin.from("billing_customers").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
  if (data) return data.stripe_customer_id as string;
  const customer = await stripe.customers.create(
    { email: user.email ?? undefined, name: (user.user_metadata?.full_name as string) || undefined, metadata: { user_id: user.id } },
    { idempotencyKey: `customer-${user.id}` },
  );
  await admin.from("billing_customers").upsert({ user_id: user.id, stripe_customer_id: customer.id });
  return customer.id;
}
