# Supabase (CarvCAM accounts)

Project `zveqsvizefgbicwvjvdu`. Earlier migrations (profiles, onboarding, billing/entitlements) and
the billing functions (`create-checkout`, `create-portal`, `stripe-webhook`) were applied directly to
the project; this folder starts with the app sign-in.

## App sign-in (`functions/app-auth`)
Device code flow, like signing in a TV app. Free never needs an account.

1. CarvCAM (Settings › Account or "Sign in" in the top bar) calls `start` and shows a code like `KXTB-9RWM`,
   opening `carvcam.com/activate/?code=KXTB-9RWM`.
2. The person logs in (or signs up) on the site and confirms. The site calls `lookup` / `approve` with their JWT.
3. The app polls with its secret `device_code` and receives a device token (stored hashed in `app_devices`)
   plus a signed license.
4. The app renews the license (`license`) at start, every 6 h and when the network returns. The license is
   ECDSA P-256 signed and valid 30 days, so Pro keeps working offline in the shop.
5. Account page lists signed-in computers; signing one out deletes its row and the app drops to Free on its
   next check.

### Deploy
```bash
node supabase/scripts/license-keys.mjs   # once; private JWK → secret, public JWK → gsender-ui/src/account/config.ts
supabase secrets set APP_LICENSE_PRIVATE_JWK='{"kty":"EC",...}'   # optional: APP_SITE_URL (default https://www.carvcam.com)
supabase db push                          # migrations/20261103120000_app_sign_in.sql
supabase functions deploy app-auth --no-verify-jwt
```

The app is GPL-3.0, so a local check can be removed by anyone who rebuilds it. Treat the license as a
convenience for honest users; features that cost money to run (hosted AI, cloud sync) must also be
checked on the server with the device token.
