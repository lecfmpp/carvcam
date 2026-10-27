import type { HeadId } from "./catalog";
import products from "./sienciProducts.json";

/**
 * Spec sheet for each router/spindle, shown on the cards of the "What spins the bit?" screen.
 * Numbers from the Sienci Labs product pages (Oct 2026). The RPM ranges and shank sizes the
 * engine uses still live in cam-engine/src/catalog/sienci/heads.ts.
 */
export interface HeadInfo {
  id: HeadId;
  name: string;
  /** "Trim router" or "Spindle kit". */
  kind: string;
  tagline: string;
  power: string;
  speedControl: string;
  /** Short text on how the speed is set (shown in the highlight). */
  speedShort: string;
  collets: string;
  mount: string;
  voltage: string;
  /** Note worth reading before choosing (240 V outlet, collet sold separately). */
  note?: string;
  inBox: string;
  url: string;
  image: string;
}

const P = Object.fromEntries(products.heads.map((h) => [h.id, h])) as Record<string, { url: string; image: string }>;

const INFO: Record<HeadId, Omit<HeadInfo, "id" | "url" | "image">> = {
  "makita-rt0701": {
    name: "Makita RT0701C",
    kind: "Trim router",
    tagline: "The classic LongMill router. Reliable, but you turn it on and set the speed by hand.",
    power: "1.25 HP · 700 W",
    speedControl: "By hand, dial 1–6",
    speedShort: "Manual dial",
    collets: "1/4″ included · 1/8″ sold separately",
    mount: "65 mm body",
    voltage: "110–120 V",
    note: "CarvCAM tells you which dial number to set before each cut.",
    inBox: "Router, 1/4″ collet, wrenches, handheld base",
  },
  "autospin-t1": {
    name: "AutoSpin T1",
    kind: "Trim router",
    tagline: "Spindle-like control in a router: the program turns it on, off and sets the RPM.",
    power: "1.25 HP peak",
    speedControl: "Automatic from G-code, or manual dial",
    speedShort: "Automatic",
    collets: "ER11 · 1/8″ and 1/4″ included",
    mount: "65 mm body",
    voltage: "110–120 V",
    inBox: "Router, 1/8″ and 1/4″ ER11 collets, signal cable",
  },
  "spindle-1-5kw-er20": {
    name: "1.5 kW ER20 Spindle",
    kind: "Spindle kit",
    tagline: "Quiet, air-cooled spindle with its own VFD. Plugs into a regular outlet.",
    power: "1.5 kW · 2 HP",
    speedControl: "Automatic from G-code (VFD)",
    speedShort: "Automatic",
    collets: "ER20 · 1/8″, 1/4″, 3/8″, 1/2″ included",
    mount: "80 mm body",
    voltage: "110–120 V (NEMA 5-15)",
    inBox: "Spindle, enclosed VFD, Clear Cut dust shoe, cables, 4 collets",
  },
  "spindle-2-2kw-er20": {
    name: "2.2 kW ER20 Spindle",
    kind: "Spindle kit",
    tagline: "The most power for hardwood and deep cuts, with a quiet air-cooled motor and VFD.",
    power: "2.2 kW · 3 HP",
    speedControl: "Automatic from G-code (VFD)",
    speedShort: "Automatic",
    collets: "ER20 · 1/8″, 1/4″, 3/8″, 1/2″ included",
    mount: "80 mm body",
    voltage: "220–240 V (NEMA 6-15)",
    note: "Needs a 240 V outlet, like a dryer or table saw circuit.",
    inBox: "Spindle, enclosed VFD, Clear Cut dust shoe, cables, 4 collets",
  },
};

export function headInfo(id: HeadId): HeadInfo {
  return { id, ...INFO[id], url: P[id].url, image: P[id].image };
}
