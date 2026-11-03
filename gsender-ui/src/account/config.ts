/**
 * Where the app signs in. The Supabase key is the publishable (browser) key, the same one the
 * website uses; the Edge Function `app-auth` does the rest. Override with VITE_* for a test project.
 */
export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || "https://zveqsvizefgbicwvjvdu.supabase.co";
export const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_KEY as string | undefined) || "sb_publishable_6Y4DigqN04BLaIEppjK8hQ_wHsIG9_g";
export const SITE_URL = ((import.meta.env.VITE_SITE_URL as string | undefined) || "https://www.carvcam.com").replace(/\/$/, "");

/**
 * Public half of the key that signs licenses (ECDSA P-256). The private half is the Supabase
 * secret APP_LICENSE_PRIVATE_JWK. Generate a new pair with `node supabase/scripts/license-keys.mjs`.
 */
export const LICENSE_PUBLIC_JWK: JsonWebKey =
  import.meta.env.VITE_LICENSE_PUBLIC_JWK
    ? JSON.parse(import.meta.env.VITE_LICENSE_PUBLIC_JWK as string)
    : { kty: "EC", crv: "P-256", x: "2UJ_lgg7svtorHAQdBdTxbEXciD1MzjI3NbPkI8AjG8", y: "8faPfKO4Cl6qgEfj1ICsI7mAtHIGbc4P2cgWAT_ft5w" };
