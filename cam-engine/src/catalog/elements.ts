/**
 * Library of design elements (the equivalent of Carbide Create's "Design Elements library").
 * Each element is a simple SVG (filled shapes; unfilled strokes become bands;
 * a white fill cuts away what comes before it), read by the same SVG importer.
 * Original drawings, designed to cut well with 1/8″ bits at sizes from ~40 mm up.
 */

export type ElementCategory = "icons" | "nature" | "frames" | "dividers";

export interface DesignElement {
  id: string;
  category: ElementCategory;
  /** Display name for the UI. */
  name: string;
  svg: string;
  /** Suggested width when inserted, in mm. */
  width: number;
  /**
   * Frames: drawing generated for the exact size (mm), with fixed-width strokes, instead
   * of stretching or shrinking the sample drawing (which would thin the strokes).
   */
  generate?(width: number, height: number): string;
}

const svg = (w: number, h: number, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}mm" height="${h}mm">${body}</svg>`;
const f = (n: number) => Math.round(n * 100) / 100;

/** Points of a polygon around (cx, cy), alternating radii (stars, sun rays…). */
function ring(cx: number, cy: number, n: number, r1: number, r2: number, a0 = -90) {
  const pts: string[] = [];
  for (let i = 0; i < 2 * n; i++) {
    const a = ((a0 + (180 * i) / n) * Math.PI) / 180;
    const r = i % 2 ? r2 : r1;
    pts.push(`${f(cx + r * Math.cos(a))},${f(cy + r * Math.sin(a))}`);
  }
  return pts.join(" ");
}

/** Ellipses rotated around a center (petals, leaves on a branch). */
function petals(cx: number, cy: number, n: number, dist: number, rx: number, ry: number) {
  let out = "";
  for (let i = 0; i < n; i++) {
    const a = (360 * i) / n;
    out += `<ellipse cx="${cx}" cy="${f(cy - dist)}" rx="${rx}" ry="${ry}" transform="rotate(${f(a)} ${cx} ${cy})"/>`;
  }
  return out;
}

/** Laurel branch: leaves along an arc, on both sides. */
function laurel() {
  let leaves = "";
  for (let i = 0; i < 7; i++) {
    const t = 0.12 + i * 0.12;
    const a = Math.PI * (1.05 - t * 0.9);
    const x = 50 + 40 * Math.cos(a);
    const y = 58 - 40 * Math.sin(a) * 0.95;
    const rot = (-a * 180) / Math.PI + 90;
    leaves += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="4.2" ry="9" transform="rotate(${f(rot - 35)} ${f(x)} ${f(y)})"/>`;
    leaves += `<ellipse cx="${f(100 - x)}" cy="${f(y)}" rx="4.2" ry="9" transform="rotate(${f(-(rot - 35))} ${f(100 - x)} ${f(y)})"/>`;
  }
  return svg(100, 100, `<path d="M14 62 A40 40 0 0 0 86 62" fill="none" stroke="#000" stroke-width="5"/>${leaves}`);
}

function snowflake() {
  let arms = "";
  for (let i = 0; i < 6; i++) {
    const a = i * 60;
    arms += `<g transform="rotate(${a} 50 50)"><path d="M50 50 V8 M50 22 L40 12 M50 22 L60 12 M50 36 L42 28 M50 36 L58 28" fill="none" stroke="#000" stroke-width="6.5" stroke-linecap="round"/></g>`;
  }
  return svg(100, 100, arms + `<circle cx="50" cy="50" r="7"/>`);
}

// ---- Frames generated at size (units = mm). Outer stroke 4 mm, inner 3.5 mm.

function doubleFrame(w: number, h: number) {
  return svg(w, h, `<rect x="2" y="2" width="${f(w - 4)}" height="${f(h - 4)}" rx="8" fill="none" stroke="#000" stroke-width="4"/><rect x="11" y="11" width="${f(w - 22)}" height="${f(h - 22)}" rx="4" fill="none" stroke="#000" stroke-width="3.5"/>`);
}

function ovalFrame(w: number, h: number) {
  return svg(w, h, `<ellipse cx="${f(w / 2)}" cy="${f(h / 2)}" rx="${f(w / 2 - 2)}" ry="${f(h / 2 - 2)}" fill="none" stroke="#000" stroke-width="4"/><ellipse cx="${f(w / 2)}" cy="${f(h / 2)}" rx="${f(w / 2 - 11)}" ry="${f(h / 2 - 11)}" fill="none" stroke="#000" stroke-width="3.5"/>`);
}

function corners(w: number, h: number) {
  const c = `<path d="M4 34 V10 A6 6 0 0 1 10 4 H34 M14 27 A13 13 0 0 1 27 14" fill="none" stroke="#000" stroke-width="3.6" stroke-linecap="round"/><circle cx="21" cy="21" r="3.6"/>`;
  return svg(w, h, ["", `translate(${w} 0) scale(-1 1)`, `translate(0 ${h}) scale(1 -1)`, `translate(${w} ${h}) scale(-1 -1)`].map((t) => `<g transform="${t}">${c}</g>`).join(""));
}

function labelFrame(w: number, h: number) {
  const b = Math.min(h / 2, 18);
  return svg(
    w,
    h,
    `<path d="M${f(b + 2)} 2 H${f(w - b - 2)} L${f(w - 2)} ${f(h / 2)} L${f(w - b - 2)} ${f(h - 2)} H${f(b + 2)} L2 ${f(h / 2)} Z" fill="none" stroke="#000" stroke-width="4" stroke-linejoin="round"/>` +
      `<path d="M${f(b + 7)} 11 H${f(w - b - 7)} L${f(w - 12)} ${f(h / 2)} L${f(w - b - 7)} ${f(h - 11)} H${f(b + 7)} L12 ${f(h / 2)} Z" fill="none" stroke="#000" stroke-width="3.5" stroke-linejoin="round"/>`,
  );
}

export const ELEMENTS: DesignElement[] = [
  // ---- Icons
  { id: "paw", category: "icons", name: "Paw", width: 50, svg: svg(100, 100, `<ellipse cx="50" cy="68" rx="23" ry="19"/><circle cx="24" cy="42" r="9.5"/><circle cx="41" cy="27" r="9.5"/><circle cx="59" cy="27" r="9.5"/><circle cx="76" cy="42" r="9.5"/>`) },
  { id: "anchor", category: "icons", name: "Anchor", width: 55, svg: svg(100, 100, `<circle cx="50" cy="14" r="8" fill="none" stroke="#000" stroke-width="6"/><rect x="46" y="21" width="8" height="64" rx="2"/><rect x="30" y="30" width="40" height="8" rx="3"/><path d="M18 60 A32 32 0 0 0 82 60" fill="none" stroke="#000" stroke-width="8"/><polygon points="8,62 28,60 18,46"/><polygon points="92,62 72,60 82,46"/>`) },
  { id: "coffee", category: "icons", name: "Coffee cup", width: 60, svg: svg(100, 100, `<path d="M16 40 H72 V66 A20 20 0 0 1 52 86 H36 A20 20 0 0 1 16 66 Z"/><path d="M72 46 H78 A11 11 0 0 1 78 68 H71" fill="none" stroke="#000" stroke-width="7"/><path d="M34 30 C27 23 41 17 34 8 M54 30 C47 23 61 17 54 8" fill="none" stroke="#000" stroke-width="6" stroke-linecap="round"/><rect x="10" y="88" width="68" height="6" rx="3"/>`) },
  { id: "crown", category: "icons", name: "Crown", width: 60, svg: svg(100, 80, `<polygon points="8,64 8,18 30,40 50,8 70,40 92,18 92,64"/><rect x="8" y="68" width="84" height="9" rx="2"/><circle cx="50" cy="44" r="5" fill="#fff"/>`) },
  { id: "lightning", category: "icons", name: "Lightning", width: 35, svg: svg(70, 100, `<polygon points="44,2 6,58 32,58 22,98 64,38 38,38 52,2"/>`) },
  { id: "music-note", category: "icons", name: "Music note", width: 40, svg: svg(80, 100, `<ellipse cx="24" cy="80" rx="16" ry="12" transform="rotate(-20 24 80)"/><rect x="34" y="10" width="7" height="72"/><path d="M38 10 C52 14 66 22 62 44 C58 32 48 28 40 28 Z"/>`) },
  { id: "fish", category: "icons", name: "Fish", width: 60, svg: svg(120, 70, `<ellipse cx="52" cy="35" rx="44" ry="26"/><polygon points="86,35 116,10 112,35 116,60"/><circle cx="28" cy="29" r="5" fill="#fff"/><path d="M60 14 Q66 35 60 56" fill="none" stroke="#fff" stroke-width="3"/>`) },
  { id: "bird", category: "icons", name: "Bird", width: 55, svg: svg(100, 80, `<path d="M8 46 C24 30 40 28 52 36 C58 20 72 12 92 14 C78 22 70 32 68 44 C66 62 50 72 30 70 C40 64 44 58 42 52 C30 56 18 54 8 46 Z"/><circle cx="76" cy="22" r="2.5" fill="#fff"/>`) },
  { id: "arrow", category: "icons", name: "Arrow", width: 60, svg: svg(120, 50, `<polygon points="4,18 78,18 78,4 116,25 78,46 78,32 4,32"/>`) },
  { id: "horseshoe", category: "icons", name: "Horseshoe", width: 50, svg: svg(100, 100, `<path d="M24 92 L18 58 A32 32 0 1 1 82 58 L76 92" fill="none" stroke="#000" stroke-width="16" stroke-linejoin="round"/><circle cx="21" cy="70" r="2.6" fill="#fff"/><circle cx="20" cy="50" r="2.6" fill="#fff"/><circle cx="79" cy="70" r="2.6" fill="#fff"/><circle cx="80" cy="50" r="2.6" fill="#fff"/><circle cx="34" cy="26" r="2.6" fill="#fff"/><circle cx="66" cy="26" r="2.6" fill="#fff"/>`) },
  { id: "drop", category: "icons", name: "Drop", width: 35, svg: svg(100, 100, `<path d="M50 4 C50 4 18 44 18 64 A32 32 0 0 0 82 64 C82 44 50 4 50 4 Z"/>`) },
  { id: "key", category: "icons", name: "Key", width: 60, svg: svg(120, 50, `<circle cx="24" cy="25" r="20"/><circle cx="24" cy="25" r="8" fill="#fff"/><rect x="40" y="20" width="74" height="10" rx="2"/><rect x="92" y="28" width="8" height="14"/><rect x="104" y="28" width="8" height="10"/>`) },

  // ---- Nature
  { id: "pine", category: "nature", name: "Pine tree", width: 45, svg: svg(100, 100, `<polygon points="50,4 72,34 62,34 80,58 66,58 88,84 12,84 34,58 20,58 38,34 28,34"/><rect x="43" y="84" width="14" height="13"/>`) },
  { id: "tree", category: "nature", name: "Tree", width: 50, svg: svg(100, 100, `<circle cx="50" cy="32" r="22"/><circle cx="30" cy="48" r="18"/><circle cx="70" cy="48" r="18"/><circle cx="50" cy="56" r="18"/><rect x="45" y="60" width="10" height="36"/><polygon points="45,76 32,66 34,62 47,70"/>`) },
  { id: "mountains", category: "nature", name: "Mountains", width: 70, svg: svg(140, 80, `<polygon points="2,78 46,14 70,46 90,22 138,78"/><polygon points="46,14 56,28 50,26 44,32 38,26" fill="#fff"/><polygon points="90,22 100,34 94,33 90,38 84,33" fill="#fff"/><circle cx="118" cy="16" r="10"/>`) },
  { id: "sun", category: "nature", name: "Sun", width: 60, svg: svg(100, 100, `<polygon points="${ring(50, 50, 12, 48, 27)}"/><circle cx="50" cy="50" r="20" fill="#fff"/><circle cx="50" cy="50" r="14"/>`) },
  { id: "moon", category: "nature", name: "Moon", width: 45, svg: svg(100, 100, `<circle cx="48" cy="52" r="40"/><circle cx="68" cy="38" r="34" fill="#fff"/>`) },
  { id: "flower", category: "nature", name: "Flower", width: 45, svg: svg(100, 100, `${petals(50, 50, 6, 24, 12, 20)}<circle cx="50" cy="50" r="14" fill="#fff"/><circle cx="50" cy="50" r="10"/>`) },
  { id: "snowflake", category: "nature", name: "Snowflake", width: 70, svg: snowflake() },
  { id: "laurel", category: "nature", name: "Laurel", width: 70, svg: laurel() },
  { id: "waves", category: "nature", name: "Waves", width: 70, svg: svg(140, 50, `<path d="M4 18 Q21 4 38 18 T72 18 T106 18 T140 18" fill="none" stroke="#000" stroke-width="8" stroke-linecap="round"/><path d="M4 38 Q21 24 38 38 T72 38 T106 38 T140 38" fill="none" stroke="#000" stroke-width="8" stroke-linecap="round"/>`) },

  // ---- Frames
  { id: "double-frame", category: "frames", name: "Double frame", width: 160, svg: doubleFrame(160, 100), generate: doubleFrame },
  { id: "oval-frame", category: "frames", name: "Oval frame", width: 160, svg: ovalFrame(160, 100), generate: ovalFrame },
  { id: "corners", category: "frames", name: "Fancy corners", width: 160, svg: corners(160, 100), generate: corners },
  { id: "banner", category: "frames", name: "Ribbon banner", width: 140, svg: svg(160, 60, `<polygon points="2,22 28,22 28,50 14,44 2,50 10,36"/><polygon points="158,22 132,22 132,50 146,44 158,50 150,36"/><polygon points="22,12 138,12 138,42 22,42"/><polygon points="22,42 30,50 30,42" fill="#000"/><polygon points="138,42 130,50 130,42" fill="#000"/>`) },
  { id: "label", category: "frames", name: "Label", width: 160, svg: labelFrame(160, 80), generate: labelFrame },

  // ---- Dividers
  { id: "diamond-divider", category: "dividers", name: "Diamond divider", width: 120, svg: svg(200, 24, `<rect x="4" y="9" width="78" height="6" rx="3"/><rect x="118" y="9" width="78" height="6" rx="3"/><polygon points="100,2 110,12 100,22 90,12"/>`) },
  { id: "dotted-divider", category: "dividers", name: "Dotted divider", width: 100, svg: svg(200, 20, Array.from({ length: 9 }, (_, i) => `<circle cx="${20 + i * 20}" cy="10" r="${i === 4 ? 7 : i % 2 ? 3 : 4.5}"/>`).join("")) },
  { id: "wavy-divider", category: "dividers", name: "Wavy divider", width: 120, svg: svg(200, 24, `<path d="M4 12 Q16 2 28 12 T52 12 T76 12 T100 12 T124 12 T148 12 T172 12 T196 12" fill="none" stroke="#000" stroke-width="6" stroke-linecap="round"/>`) },
];

export const ELEMENT_BY_ID = new Map(ELEMENTS.map((e) => [e.id, e]));
