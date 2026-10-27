import type { BitProfile } from "./catalog";
import products from "./sienciProducts.json";

/**
 * Fresas da loja Sienci que o CarvCAM ainda não usa nos cálculos (3D, bowls, DLC…). Aparecem na
 * biblioteca em "More from the Sienci store", só com a ficha e o link (com UTM e afiliado).
 * Medidas das páginas de produto (out/2026).
 */
export interface StoreBit {
  id: string;
  name: string;
  kind: string;
  profile: BitProfile;
  /** Diâmetro de corte em mm (na ponta, para as cônicas). */
  d: number;
  shank: "1/8" | "1/4";
  /** Comprimento de corte em mm, quando a Sienci informa. */
  cut?: number;
  flutes: number;
  use: string;
  url: string;
  image: string;
}

const P = Object.fromEntries(products.bits.map((b) => [b.id, b])) as Record<string, { url: string; image: string }>;
const b = (id: string, x: Omit<StoreBit, "id" | "url" | "image">): StoreBit => ({ id, url: P[id].url, image: P[id].image, ...x });

export const STORE_BITS: StoreBit[] = [
  b("store-ball-1-8", { name: "1/8″ ball nose upcut", kind: "Ball nose · upcut", profile: "ball", d: 3.175, shank: "1/8", cut: 17, flutes: 2, use: "Small 3D reliefs, contours and maps" }),
  b("store-tapered-1-4-1-5", { name: "1/4″ tapered ball nose, R1/32″", kind: "Tapered ball · upcut", profile: "ball", d: 1.59, shank: "1/4", cut: 38.1, flutes: 2, use: "Fine detail in 3D relief carving" }),
  b("store-tapered-1-4-2-dlc", { name: "1/4″ × 2″ tapered ball nose, DLC", kind: "Tapered ball · DLC coated", profile: "ball", d: 1.59, shank: "1/4", cut: 50.8, flutes: 2, use: "Deep, detailed 3D carving that lasts longer" }),
  b("store-ball-1-4-1-dlc", { name: "1/4″ × 1″ downcut ball nose, DLC", kind: "Ball nose · downcut", profile: "ball", d: 6.35, shank: "1/4", cut: 25.4, flutes: 2, use: "Smooth 3D surfaces with less sanding" }),
  b("store-compression-1-4-dlc", { name: "1/4″ × 1″ extra-hard compression, DLC", kind: "Compression · chip breaker", profile: "compression", d: 6.35, shank: "1/4", cut: 25.4, flutes: 3, use: "Clean edges through 3/4″ plywood and MDF" }),
  b("store-roughing-1-4", { name: "1/4″ extra-long roughing end mill", kind: "Flat · roughing, 3 flutes", profile: "flat", d: 6.35, shank: "1/4", cut: 44.45, flutes: 3, use: "Fast stock removal in thick lumber" }),
  b("store-corncob-1-16", { name: "1/16″ corncob end mill", kind: "Corncob", profile: "flat", d: 1.6, shank: "1/8", cut: 8, flutes: 0, use: "Composites, PCBs and fine wood detail" }),
  b("store-vbit-60-dlc", { name: "1/4″ 60° downcut V-bit, DLC", kind: "V-bit · downcut", profile: "v", d: 6.35, shank: "1/4", flutes: 3, use: "Crisp V-grooves, chamfers and signs" }),
  b("store-groove-1-2", { name: "1/2″ round groove bit", kind: "Round groove", profile: "ball", d: 12.7, shank: "1/4", cut: 12.7, flutes: 2, use: "Rounded grooves, trays and recesses" }),
  b("store-groove-3-4", { name: "3/4″ round groove bit", kind: "Round groove", profile: "ball", d: 19.05, shank: "1/4", cut: 19.05, flutes: 2, use: "Wide rounded channels and trays" }),
  b("store-bowl-1", { name: "1″ flat bottom bowl bit, R3/8″", kind: "Bowl bit", profile: "surfacing", d: 25.4, shank: "1/4", cut: 19.05, flutes: 2, use: "Bowls and serving trays with flat floors" }),
  b("store-surfacing-1-5", { name: "1-1/2″ surfacing bit", kind: "Surfacing · 4 flutes", profile: "surfacing", d: 38.1, shank: "1/4", flutes: 4, use: "Flatten spoilboards and wide slabs faster" }),
];

export const STORE_CATEGORY_URL = "https://sienci.com/product-category/end-mills-bits/";

/** Foto WebP de uma fresa do catálogo do CarvCAM (mesmo arquivo de produtos). */
export const bitImage = (id: string) => P[id]?.image;
