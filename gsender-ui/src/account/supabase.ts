import type { SupabaseClient } from "@supabase/supabase-js";

/** Public project settings (the publishable key is browser-safe; row-level security protects the data). */
export const SUPABASE_URL = "https://zveqsvizefgbicwvjvdu.supabase.co";
export const SUPABASE_KEY = "sb_publishable_6Y4DigqN04BLaIEppjK8hQ_wHsIG9_g";
/** localStorage key where supabase-js keeps the session. */
export const AUTH_STORAGE_KEY = "carvcam-auth";

let client: Promise<SupabaseClient> | null = null;

/** supabase-js is loaded on demand, so the first paint and an offline start don't wait for it. */
export function getClient(): Promise<SupabaseClient> {
  client ??= import("@supabase/supabase-js")
    .then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: AUTH_STORAGE_KEY },
      }),
    )
    .catch((e) => {
      client = null;
      throw e;
    });
  return client;
}

/** True when a session is saved on this computer (checked without loading supabase-js). */
export function hasStoredSession(): boolean {
  try {
    return !!localStorage.getItem(AUTH_STORAGE_KEY);
  } catch {
    return false;
  }
}
