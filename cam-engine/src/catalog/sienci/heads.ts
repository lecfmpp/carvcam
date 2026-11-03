/**
 * Routers and spindles used on Sienci Labs machines.
 * Sources: product pages on sienci.com and resources.sienci.com (checked Oct 2026).
 */

export const INCH = 25.4;
export const SHANK_1_8 = 3.175;
export const SHANK_1_4 = 6.35;
export const SHANK_3_8 = 9.525;
export const SHANK_1_2 = 12.7;

export type HeadId = "makita-rt0701" | "autospin-t1" | "spindle-1-5kw-er20" | "spindle-2-2kw-er20";

export interface Accessory {
  name: string;
  url: string;
}

export interface Head {
  id: HeadId;
  name: string;
  type: "router" | "spindle";
  rpmMin: number;
  rpmMax: number;
  /** "gcode": spindle speed comes from the G-code (S). "manual": the user turns the dial. */
  rpmControl: "gcode" | "manual";
  /** Speed dial settings (to show "set the dial to 3"). */
  dial?: { position: number; rpm: number }[];
  /** Shanks (mm) that fit without buying anything. */
  shanks: number[];
  /** Shanks that need a collet or adapter sold separately. */
  shanksWithAccessory: { shank: number; accessory: Accessory }[];
  url: string;
}

export const HEADS: Record<HeadId, Head> = {
  "makita-rt0701": {
    id: "makita-rt0701",
    name: "Makita RT0701",
    type: "router",
    rpmMin: 10000,
    rpmMax: 30000,
    rpmControl: "manual",
    dial: [
      { position: 1, rpm: 10000 },
      { position: 2, rpm: 12000 },
      { position: 3, rpm: 17000 },
      { position: 4, rpm: 22000 },
      { position: 5, rpm: 27000 },
      { position: 6, rpm: 30000 },
    ],
    shanks: [SHANK_1_4],
    shanksWithAccessory: [
      {
        shank: SHANK_1_8,
        accessory: { name: "1/8″ precision collet for the Makita RT0701 (or a 1/4″→1/8″ adapter)", url: "https://sienci.com/product-category/routers-spindles/" },
      },
    ],
    url: "https://sienci.com/product/makita-rt0701c-1-25-hp-110v-compact-router/",
  },
  "autospin-t1": {
    id: "autospin-t1",
    name: "AutoSpin T1",
    type: "router",
    rpmMin: 10000,
    rpmMax: 30000,
    // In "Spindle Mode" it switches on, off and sets its speed from the G-code.
    rpmControl: "gcode",
    dial: [
      { position: 1, rpm: 10000 },
      { position: 2, rpm: 15000 },
      { position: 3, rpm: 20000 },
      { position: 4, rpm: 25000 },
      { position: 5, rpm: 30000 },
    ],
    // Comes with 1/8″ and 1/4″ ER11 collets.
    shanks: [SHANK_1_8, SHANK_1_4],
    shanksWithAccessory: [],
    url: "https://sienci.com/product/autospin-t1-router/",
  },
  "spindle-1-5kw-er20": {
    id: "spindle-1-5kw-er20",
    name: "1.5 kW ER20 Spindle (Sienci kit)",
    type: "spindle",
    rpmMin: 7500,
    rpmMax: 24000,
    rpmControl: "gcode",
    // The kit comes with 1/8″, 1/4″, 3/8″ and 1/2″ ER20 collets.
    shanks: [SHANK_1_8, SHANK_1_4, SHANK_3_8, SHANK_1_2],
    shanksWithAccessory: [],
    url: "https://sienci.com/product/altmill-1-5kw-er20-spindle-clear-cut-dust-shoe-kit/",
  },
  "spindle-2-2kw-er20": {
    id: "spindle-2-2kw-er20",
    name: "2.2 kW ER20 Spindle (AltMill kit)",
    type: "spindle",
    rpmMin: 7500,
    rpmMax: 24000,
    rpmControl: "gcode",
    shanks: [SHANK_1_8, SHANK_1_4, SHANK_3_8, SHANK_1_2],
    shanksWithAccessory: [],
    url: "https://sienci.com/product/altmill-2-2kw-er20-spindle-clear-cut-dust-shoe-kit/",
  },
};

/** Dial setting closest to the requested speed. */
export function nearestDial(head: Head, rpm: number): { position: number; rpm: number } | undefined {
  if (!head.dial) return undefined;
  return head.dial.reduce((best, d) => (Math.abs(d.rpm - rpm) < Math.abs(best.rpm - rpm) ? d : best));
}
