/**
 * Links para o site da Sienci Labs com rastreamento de indicação.
 *
 * - UTMs (sempre): mostram no analytics da Sienci que a visita veio do CarvCAM e de qual lugar
 *   do app (card da máquina, biblioteca de fresas…). Sozinhas NÃO geram comissão.
 * - Código de afiliado (quando houver): é o que credita a venda. A Sienci usa o Solid Affiliate
 *   no portal de afiliados (sienci.com/affiliate-portal); depois de aprovado no programa, copie o
 *   parâmetro e o código do seu link de afiliado para o .env:
 *
 *     VITE_SIENCI_AFFILIATE_PARAM=sld   # o nome do parâmetro que aparece no seu link
 *     VITE_SIENCI_AFFILIATE_ID=123      # o seu código
 */

export type Placement = "machine_card" | "machine_settings" | "head_card" | "bit_library" | "store_bits" | "bit_suggestion" | "accessory" | "onboarding";

const AFF_PARAM = (import.meta.env.VITE_SIENCI_AFFILIATE_PARAM as string | undefined)?.trim() || "";
const AFF_ID = (import.meta.env.VITE_SIENCI_AFFILIATE_ID as string | undefined)?.trim() || "";

export const affiliateConfigured = !!(AFF_PARAM && AFF_ID);

/**
 * Link do produto com UTMs e, se configurado, o código de afiliado.
 * Links que não são da Sienci voltam sem mudança.
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
