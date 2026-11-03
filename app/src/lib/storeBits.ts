import { bitKind, BITS, type Bit, type BitProfile } from "./catalog";
import products from "./sienciProducts.json";

/**
 * Bits from the Sienci store that CarvCAM doesn't plan toolpaths with yet (3D, bowls, roughing…).
 * They come from the same engine catalog (cam-engine/src/catalog/sienci/bits.ts), with their feeds
 * and sets; this file only puts them in the store card's shape. They appear in the library under
 * "More from the Sienci store", with the link (with UTM and affiliate code).
 */
export interface StoreBit {
  id: string;
  name: string;
  kind: string;
  profile: BitProfile;
  /** Cutting diameter in mm (at the tip, for tapered bits). */
  d: number;
  shank: Bit["shank"];
  /** Cutting length in mm, when Sienci lists it. */
  cut?: number;
  flutes: number;
  use: string;
  url: string;
  image?: string;
}

const P = Object.fromEntries(products.bits.map((b) => [b.id, b])) as Record<string, { url: string; image: string }>;

/** WebP photo of a bit from the CarvCAM catalog (path in public/, from sienciProducts.json). */
export const bitImage = (id: string) => P[id]?.image;

export const STORE_BITS: StoreBit[] = BITS.filter((b) => !b.carvcam).map((b) => ({
  id: b.id,
  name: b.name,
  kind: bitKind(b),
  profile: b.profile,
  d: b.d,
  shank: b.shank,
  cut: b.cut || undefined,
  flutes: b.flutes,
  use: b.use,
  url: b.storeUrl,
  image: bitImage(b.id),
}));

export const STORE_CATEGORY_URL = "https://sienci.com/product-category/end-mills-bits/";
