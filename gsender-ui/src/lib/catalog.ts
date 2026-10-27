import { sienci, type MaterialId, type PlateSpecInput } from "@gsender-next/cam-engine";

/**
 * Catalog in the shape the UI needs. The data comes from the engine (verified Sienci catalog);
 * this file only adds labels, colors and helper text.
 */

export type MachineId = sienci.MachineId;
export type HeadId = sienci.HeadId;
export type Preset = "fast" | "balanced" | "detailed";
export type Intent = "engrave" | "relief" | "cutout" | "plastic" | "surface";

export const PRESET_TO_SPEED: Record<Preset, sienci.Speed> = { fast: "maximum", balanced: "regular", detailed: "reduced" };
export const SPEED_TO_PRESET: Record<sienci.Speed, Preset> = { maximum: "fast", regular: "balanced", reduced: "detailed" };
export const PRESET_LABEL: Record<Preset, { title: string; table: string; blurb: string }> = {
  fast: { title: "Fast", table: "Maximum", blurb: "Quickest carve. Fine for soft wood and simple shapes." },
  balanced: { title: "Balanced", table: "Regular", blurb: "Good finish and reasonable time. Best for most signs." },
  detailed: { title: "Detailed", table: "Reduced", blurb: "Gentlest cuts and the cleanest edges. Best for small lettering." },
};

// ---------------- Machines ----------------

export type Family = "LongMill MK2" | "LongMill MK3" | "AltMill";

export interface Machine {
  id: MachineId;
  family: Family;
  size: string;
  /** Usable travel in mm [X, Y]. */
  area: [number, number];
  z: number;
  maxSpeed: number;
  controller: string;
  heads: HeadId[];
  defaultHead: HeadId;
  preset: Preset;
}

const FAMILY_OF: Record<string, Family> = { MK2: "LongMill MK2", MK3: "LongMill MK3" };

export const MACHINES: Machine[] = Object.values(sienci.MACHINES).map((m) => ({
  id: m.id,
  family: m.family === "AltMill" ? "AltMill" : FAMILY_OF[m.version],
  size: m.size,
  area: [m.travel.x, m.travel.y],
  z: m.travel.z,
  maxSpeed: m.maxFeed.xy,
  controller: m.controller,
  heads: m.heads,
  defaultHead: m.defaultHead,
  preset: SPEED_TO_PRESET[m.defaultSpeed],
}));

export const machineById = (id: MachineId) => MACHINES.find((m) => m.id === id)!;
export const machineName = (m: Machine) => `${m.family} ${m.size}`;

export const FAMILIES: { id: Family; blurb: string; defaultSize: MachineId }[] = [
  { id: "LongMill MK2", blurb: "Lead screws, hand-switched Makita router", defaultSize: "longmill-mk2-30x30" },
  { id: "LongMill MK3", blurb: "Linear rails, closed-loop motors, automatic speed", defaultSize: "longmill-mk3-30x30" },
  { id: "AltMill", blurb: "Large format, real spindle, fastest of the three", defaultSize: "altmill-4x4" },
];

// ---------------- Router / spindle ----------------

export interface Head {
  id: HeadId;
  name: string;
  kind: "Router" | "Spindle";
  /** true = the program sets the speed. */
  auto: boolean;
  note: string;
  rpm: [number, number];
}

const HEAD_TEXT: Record<HeadId, { name: string; note: string }> = {
  "makita-rt0701": { name: "Makita RT0701", note: "Speed is set by hand on the dial, 1 to 6" },
  "autospin-t1": { name: "AutoSpin T1", note: "The program sets the speed automatically" },
  "spindle-1-5kw-er20": { name: "Spindle 1.5 kW", note: "Automatic speed, quiet, ER20 collets" },
  "spindle-2-2kw-er20": { name: "Spindle 2.2 kW", note: "Automatic speed, more power for hardwood" },
};

export const HEADS: Record<HeadId, Head> = Object.fromEntries(
  Object.values(sienci.HEADS).map((c) => [
    c.id,
    { id: c.id, name: HEAD_TEXT[c.id].name, note: HEAD_TEXT[c.id].note, kind: c.type === "router" ? "Router" : "Spindle", auto: c.rpmControl === "gcode", rpm: [c.rpmMin, c.rpmMax] },
  ]),
) as Record<HeadId, Head>;

export function dialFor(head: HeadId, rpm: number) {
  return sienci.nearestDial(sienci.HEADS[head], rpm);
}

// ---------------- Bits ----------------

export type BitProfile = "flat" | "v" | "ball" | "compression" | "surfacing";

export interface Bit {
  id: string;
  name: string;
  profile: BitProfile;
  flute: string;
  d: number;
  inch: string;
  shank: "1/8" | "1/4";
  cut: number;
  angle?: number;
  flutes: number;
  uses: Intent[];
  use: string;
  kit: boolean;
  notForSigns: boolean;
  storeUrl: string;
  storeName: string;
}

const BIT_TEXT: Record<string, { name: string; inch: string; uses: Intent[]; use: string }> = {
  "flat-1-16-downcut": { name: "1/16″ flat downcut", inch: "1/16″", uses: ["engrave", "relief"], use: "Fine lettering and engraving without chipping the top face" },
  "flat-1-16-upcut": { name: "1/16″ flat upcut", inch: "1/16″", uses: ["engrave", "relief"], use: "Fine detail that clears chips well" },
  "flat-1-8-downcut": { name: "1/8″ flat downcut", inch: "1/8″", uses: ["relief", "engrave"], use: "Relief and engraving without chipping the top face" },
  "flat-1-8-upcut": { name: "1/8″ flat upcut", inch: "1/8″", uses: ["cutout", "relief", "engrave"], use: "The everyday bit: letters, shapes and small cut-outs" },
  "flat-1-8-1flute": { name: "1/8″ single flute", inch: "1/8″", uses: ["plastic", "cutout"], use: "Acrylic and plastics without melting" },
  "flat-1-8-compression": { name: "1/8″ compression", inch: "1/8″", uses: ["cutout"], use: "Clean top and bottom edges on plywood" },
  "flat-1-4-upcut": { name: "1/4″ flat upcut", inch: "1/4″", uses: ["cutout", "relief"], use: "Fast cut-outs and large pockets" },
  "flat-1-4-downcut": { name: "1/4″ flat downcut", inch: "1/4″", uses: ["relief", "cutout"], use: "Large pockets in plywood without chipping" },
  "flat-1-4-1flute": { name: "1/4″ single flute", inch: "1/4″", uses: ["plastic", "cutout"], use: "Larger plastic and aluminum parts" },
  "flat-1-4-compression": { name: "1/4″ compression", inch: "1/4″", uses: ["cutout"], use: "Clean plywood edges on both faces" },
  "vbit-30-1-8": { name: "30° V-bit", inch: "1/8″", uses: ["engrave"], use: "Sharp, fine lettering" },
  "vbit-60-15mm": { name: "60° V-bit", inch: "15 mm", uses: ["engrave", "plastic"], use: "V-carved lettering and acrylic engraving" },
  "vbit-90-15mm": { name: "90° V-bit", inch: "15 mm", uses: ["engrave"], use: "Wide chamfers and bold V-lettering" },
  "surfacing-22mm": { name: "22 mm surfacing bit", inch: "7/8″", uses: ["surface"], use: "Flattens the spoilboard and the top of rough boards" },
  "ball-1-4": { name: "1/4″ ball nose", inch: "1/4″", uses: [], use: "Smooth curved 3D relief" },
};

const PROFILE: Record<string, BitProfile> = { straight: "flat", vbit: "v", ball: "ball", surfacing: "surfacing" };
const FLUTE: Record<string, string> = { upcut: "upcut", downcut: "downcut", compression: "compression", straight: "straight" };

export const BITS: Bit[] = sienci.BITS.map((f) => {
  const t = BIT_TEXT[f.id];
  return {
    id: f.id,
    name: t.name,
    profile: f.cut === "compression" ? "compression" : PROFILE[f.type],
    flute: f.flutes === 1 && f.type === "straight" ? "single flute" : FLUTE[f.cut],
    d: f.diameter,
    inch: t.inch,
    shank: Math.abs(f.shank - 3.175) < 0.01 ? "1/8" : "1/4",
    cut: f.cutLength,
    angle: f.angle,
    flutes: f.flutes,
    uses: t.uses,
    use: t.use,
    kit: sienci.STARTER_SET.includes(f.id),
    notForSigns: !f.supportedInV1,
    storeUrl: f.url,
    storeName: f.name,
  };
});

export const bitById = (id: string) => BITS.find((b) => b.id === id);
export const KIT = sienci.STARTER_SET.slice();
export const INTENTS: [Intent, string][] = [["engrave", "Engrave"], ["relief", "Relief"], ["cutout", "Cut out"], ["plastic", "Plastic"], ["surface", "Surface"]];

export type CompatLevel = "fits" | "accessory" | "no";

export function compat(bit: Bit, head: HeadId): { level: CompatLevel; label: string; accessory?: { name: string; url: string } } {
  if (bit.notForSigns && bit.profile !== "surfacing") return { level: "no", label: "Not for signs (yet)" };
  const c = sienci.compatibility(sienci.BIT_BY_ID.get(bit.id)!, head);
  const short = HEADS[head].kind === "Spindle" ? "spindle" : HEADS[head].name.split(" ")[0];
  if (c.status === "compatible") return { level: "fits", label: `Fits your ${short}` };
  if (c.status === "with-accessory") return { level: "accessory", label: "Needs the 1/8″ collet", accessory: { name: "1/8″ precision collet", url: c.accessory.url } };
  return { level: "no", label: "Does not fit" };
}

// ---------------- Materials ----------------

export interface Material {
  id: string;
  engine: MaterialId;
  face: string;
  recess: string;
  side: string;
  grain: boolean;
  thick: number[];
  sub: string;
}

export const MATERIALS: Material[] = [
  { id: "MDF", engine: "mdf", face: "#C9A47B", recess: "#94704D", side: "#77583D", grain: false, thick: [6, 12, 15, 18], sub: "Smooth, cheap, great for painted signs" },
  { id: "Pine", engine: "softwood", face: "#E2C08D", recess: "#B08955", side: "#9A7446", grain: true, thick: [12, 19], sub: "Soft and affordable, a good first project" },
  { id: "Oak", engine: "hardwood", face: "#C79A62", recess: "#94683A", side: "#7C5630", grain: true, thick: [12, 19], sub: "Hard, strong grain, lasts outdoors with finish" },
  { id: "Walnut", engine: "hardwood", face: "#8A5E3C", recess: "#5E3E26", side: "#4A3120", grain: true, thick: [12, 19], sub: "Dark and premium, carves cleanly" },
  { id: "Birch plywood", engine: "plywood", face: "#E3CBA2", recess: "#B39468", side: "#A08257", grain: true, thick: [6, 12, 18], sub: "Light and stable, layered edges" },
  { id: "Acrylic", engine: "acrylic", face: "#DCE5E9", recess: "#A3B4BB", side: "#8A9BA2", grain: false, thick: [3, 6], sub: "Clean edges, needs a single-flute bit" },
];
export const materialById = (id: string) => MATERIALS.find((m) => m.id === id) ?? MATERIALS[0];
export const THROUGH_COLOR = "#1C1D20";

// ---------------- First cuts ----------------

export type Level = "First cut" | "Easy" | "Intermediate";

export interface Project {
  id: string;
  title: string;
  level: Level;
  learn: string;
  material: string;
  bits: string[];
  speed?: Preset;
  spec: PlateSpecInput;
  track?: number;
}

const P = Object.fromEntries(sienci.PROJECTS.map((p) => [p.id, p]));
const withTexts = (id: string, texts: string[]): PlateSpecInput => {
  const spec = structuredClone(P[id].plate);
  texts.forEach((t, i) => {
    if (spec.texts?.[i]) spec.texts[i].content = t;
  });
  return spec;
};

export const PROJECTS: Project[] = [
  { id: "depth-test", title: "Depth test", level: "First cut", learn: "What 1, 2 and 3 mm deep look and sound like", material: "MDF", bits: ["flat-1-8-upcut"], speed: "detailed", spec: P["depth-test"].plate, track: 1 },
  { id: "coaster", title: "Coaster with an initial", level: "First cut", learn: "Cutting a shape out with holding tabs", material: "MDF", bits: ["flat-1-8-upcut"], spec: withTexts("coaster", ["M"]), track: 2 },
  { id: "door-sign", title: "Raised door sign", level: "Easy", learn: "Lowering the background around raised letters", material: "MDF", bits: ["flat-1-8-upcut"], spec: withTexts("door-sign", ["The Millers"]), track: 3 },
  { id: "pet-plaque", title: "Pet name plaque", level: "Intermediate", learn: "Changing the bit in the middle of a job", material: "Pine", bits: ["flat-1-16-downcut", "flat-1-8-upcut"], spec: withTexts("pet-plaque", ["BISCUIT", "since 2024"]) },
  { id: "welcome-sign", title: "“Welcome” script lettering", level: "Intermediate", learn: "Clean plywood edges with a compression bit", material: "Birch plywood", bits: ["flat-1-8-compression"], speed: "balanced", spec: withTexts("welcome-sign", ["Welcome"]) },
  { id: "acrylic-keychain", title: "Acrylic keychain", level: "Intermediate", learn: "V-carving and cutting plastic cleanly", material: "Acrylic", bits: ["vbit-30-1-8", "flat-1-8-1flute"], spec: withTexts("acrylic-keychain", ["JO"]) },
  { id: "address-sign", title: "Large address sign", level: "Intermediate", learn: "Planning a job that fills a big machine", material: "MDF", bits: ["flat-1-4-upcut"], spec: withTexts("address-sign", ["1428"]) },
];

export const TRACK = [
  { id: "surface", title: "Surface the bed", sub: "Flatten the spoilboard with the 22 mm bit" },
  { id: "depth-test", title: "Depth test" },
  { id: "coaster", title: "Coaster" },
  { id: "door-sign", title: "Door sign" },
];

/** Whether a project's board (with margin when it is cut out) fits the machine. */
export function projectFits(p: Project, m: Machine) {
  const margin = (p.spec.outerCutout ?? true) ? 2 * (p.spec.margin ?? 10) : 0;
  const w = p.spec.width + margin;
  const h = p.spec.height + margin;
  return w <= m.area[0] && h <= m.area[1];
}

export function machinesThatFit(p: Project) {
  return MACHINES.filter((m) => projectFits(p, m));
}
