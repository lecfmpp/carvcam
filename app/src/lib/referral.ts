/**
 * Links to the Sienci Labs site with referral tracking.
 *
 * - UTMs (always): show in Sienci's analytics that the visit came from CarvCAM and from which
 *   part of the app (machine card, bit library…). On their own they do NOT earn a commission.
 * - Affiliate code (when set): this is what credits the sale. Sienci uses Solid Affiliate on its
 *   affiliate portal (sienci.com/affiliate-portal); once you're approved for the program, copy the
 *   parameter and the code from your affiliate link into .env:
 *
 *     VITE_SIENCI_AFFILIATE_PARAM=sld   # the parameter name that appears in your link
 *     VITE_SIENCI_AFFILIATE_ID=123      # your code
 */

export type Placement = "machine_card" | "machine_settings" | "head_card" | "bit_library" | "store_bits" | "bit_suggestion" | "accessory" | "onboarding";

const AFF_PARAM = (import.meta.env.VITE_SIENCI_AFFILIATE_PARAM as string | undefined)?.trim() || "";
const AFF_ID = (import.meta.env.VITE_SIENCI_AFFILIATE_ID as string | undefined)?.trim() || "";

export const affiliateConfigured = !!(AFF_PARAM && AFF_ID);

/**
 * Product link with UTMs and, if configured, the affiliate code.
 * Non-Sienci links are returned unchanged.
 */
export function sienciLink(url: string, placement: Placement, content?: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  if (!/(^|\.)sienci\.com$/.test(u.hostname)) return url;
  u.searchParams.set("utm_source", "carvcam");
  u.searchParams.set("utm_medium", "app");
  u.searchParams.set("utm_campaign", placement);
  if (content) u.searchParams.set("utm_content", content);
  if (affiliateConfigured) u.searchParams.set(AFF_PARAM, AFF_ID);
  return u.toString();
}
