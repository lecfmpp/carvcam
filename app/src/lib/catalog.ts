import { sienci, type MaterialId, type PlateSpecInput } from "@carvcam/cam-engine";

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
  { id: "LongMill MK2", blurb: "Lead screws, hand-switched Makita router (MK2 and MK2.5)", defaultSize: "longmill-mk2-30x30" },
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
  shank: "1/8" | "1/4" | "3/8";
  /** Cutting length in mm; 0 when Sienci lists "n/a" (the 1-1/2″ surfacing bit). */
  cut: number;
  angle?: number;
  flutes: number;
  uses: Intent[];
  use: string;
  /** In the Starter End Mill Set (Beginner's Kit). */
  kit: boolean;
  /** Every Sienci set this bit ships in. */
  kits: BitKit[];
  /** Diamond-like carbon coating. */
  dlc: boolean;
  notForSigns: boolean;
  /** CarvCAM plans toolpaths with it (signs, or the Surfacing tool). */
  carvcam: boolean;
  storeUrl: string;
  storeName: string;
}

export interface BitKit {
  id: sienci.KitId;
  name: string;
  url: string;
  family: "LongMill" | "AltMill" | null;
}

type BitText = { name: string; inch: string; uses: Intent[]; use: string };
const BIT_TEXT: Record<string, BitText> = {
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
  // Store and set bits (AltMill sets, 3D Carver set, DLC line).
  "store-ball-1-8": { name: "1/8″ ball nose upcut", inch: "1/8″", uses: [], use: "Small 3D reliefs, contours and maps" },
  "store-tapered-1-4-1-5": { name: "1/4″ tapered ball nose, R1/32″", inch: "1/16″ tip", uses: [], use: "Fine detail in 3D relief carving" },
  "store-tapered-1-4-2-dlc": { name: "1/4″ × 2″ tapered ball nose, DLC", inch: "1/16″ tip", uses: [], use: "Deep, detailed 3D carving that lasts longer" },
  "store-ball-1-4-1-dlc": { name: "1/4″ × 1″ downcut ball nose, DLC", inch: "1/4″", uses: [], use: "Smooth 3D surfaces with less sanding" },
  "store-compression-1-4-dlc": { name: "1/4″ × 1″ extra-hard compression, DLC", inch: "1/4″", uses: ["cutout"], use: "Clean edges through 3/4″ plywood and MDF" },
  "store-roughing-1-4": { name: "1/4″ extra-long roughing end mill", inch: "1/4″", uses: [], use: "Fast stock removal in thick lumber" },
  "store-corncob-1-16": { name: "1/16″ corncob end mill", inch: "1/16″", uses: [], use: "Composites, PCBs and fine wood detail" },
  "store-vbit-60-dlc": { name: "1/4″ 60° downcut V-bit, DLC", inch: "1/4″", uses: ["engrave"], use: "Crisp V-grooves, chamfers and signs (cuts through Oramask)" },
  "store-groove-1-2": { name: "1/2″ round groove bit", inch: "1/2″", uses: [], use: "Rounded grooves, trays and recesses" },
  "store-groove-3-4": { name: "3/4″ round groove bit", inch: "3/4″", uses: [], use: "Wide rounded channels and trays" },
  "store-bowl-1": { name: "1″ flat bottom bowl bit, R3/8″", inch: "1″", uses: [], use: "Bowls and serving trays with flat floors" },
  "store-surfacing-1-5": { name: "1-1/2″ surfacing bit", inch: "1-1/2″", uses: [], use: "Flattens spoilboards and wide slabs faster" },
  "roughing-3-8-1-1-4-dlc": { name: "3/8″ × 1-1/4″ roughing end mill, DLC", inch: "3/8″", uses: [], use: "Fast stock removal in hardwood, plywood, MDF and aluminum" },
  "roughing-3-8-2-dlc": { name: "3/8″ × 2″ roughing end mill, DLC", inch: "3/8″", uses: [], use: "Deep roughing in thick lumber" },
  "high-helix-1-4-2-dlc": { name: "1/4″ × 2″ high helix upcut, DLC", inch: "1/4″", uses: ["cutout"], use: "Profiles and cut-outs with a clean wall finish" },
  "flat-1-8-downcut-dlc": { name: "1/8″ × 3/4″ downcut, 1/4″ shank, DLC", inch: "1/8″", uses: ["relief", "engrave", "cutout"], use: "Pockets and inlays in plywood without chipping; no 1/8″ collet needed" },
  "flat-1-8-upcut-dlc": { name: "1/8″ × 1/2″ upcut, 1/4″ shank, DLC", inch: "1/8″", uses: ["plastic", "cutout"], use: "Plastics and soft metals; no 1/8″ collet needed" },
  "vbit-30-dlc": { name: "1/4″ 30° downcut V-bit, DLC", inch: "1/4″", uses: ["engrave"], use: "Fine engraving and small lettering, even through Oramask" },
  "vbit-90-dlc": { name: "1/4″ 90° downcut V-bit, DLC", inch: "1/4″", uses: ["engrave"], use: "Chamfers and V-grooves with crisp top edges" },
  "vbit-90-3-8-dlc": { name: "3/8″ 90° downcut V-bit, DLC", inch: "3/8″", uses: ["engrave"], use: "Wider V-lettering and bigger chamfers" },
  "ball-1-4-1-3-4-dlc": { name: "1/4″ × 1-3/4″ downcut ball nose, DLC", inch: "1/4″", uses: [], use: "Curved surfaces and 3D relief" },
  "tapered-1-8-r0-25": { name: "1/8″ tapered ball nose, R0.25 mm", inch: "0.5 mm tip", uses: [], use: "Extreme detail in 3D relief" },
  "surfacing-1-5-inserted": { name: "1-1/2″ inserted surfacing bit", inch: "1-1/2″", uses: [], use: "Heavy-duty spoilboard and panel flattening with replaceable inserts" },
};

const PROFILE: Record<sienci.SienciBit["type"], BitProfile> = { straight: "flat", vbit: "v", ball: "ball", tapered: "ball", groove: "ball", bowl: "surfacing", surfacing: "surfacing" };
const FLUTE: Record<string, string> = { upcut: "upcut", downcut: "downcut", compression: "compression", straight: "straight" };
const SHANK = (mm: number): Bit["shank"] => (Math.abs(mm - 3.175) < 0.01 ? "1/8" : Math.abs(mm - 9.525) < 0.01 ? "3/8" : "1/4");

export const BIT_KITS: BitKit[] = sienci.KITS.map((k) => ({ id: k.id, name: k.name, url: k.url, family: k.family }));
const kitsOf = (id: string) => BIT_KITS.filter((k) => sienci.KIT_BY_ID.get(k.id)!.bits.some((x) => x.id === id));

export const BITS: Bit[] = sienci.BITS.map((f) => {
  const t = BIT_TEXT[f.id] ?? { name: f.name, inch: "", uses: [], use: f.bestFor };
  return {
    id: f.id,
    name: t.name,
    profile: f.cut === "compression" ? "compression" : PROFILE[f.type],
    flute: f.variant === "corncob" ? "corncob" : f.flutes === 1 && f.type === "straight" ? "single flute" : FLUTE[f.cut],
    d: f.diameter,
    inch: t.inch,
    shank: SHANK(f.shank),
    cut: f.cutLength ?? 0,
    angle: f.angle,
    flutes: f.flutes,
    uses: t.uses,
    use: t.use,
    kit: sienci.STARTER_SET.includes(f.id),
    kits: kitsOf(f.id),
    dlc: f.coating === "DLC",
    notForSigns: !f.supportedInV1,
    carvcam: f.supportedInV1 || f.id === "surfacing-22mm",
    storeUrl: f.url,
    storeName: f.name,
  };
});

export const bitById = (id: string) => BITS.find((b) => b.id === id);
export const KIT = sienci.STARTER_SET.slice();
export const INTENTS: [Intent, string][] = [["engrave", "Engrave"], ["relief", "Relief"], ["cutout", "Cut out"], ["plastic", "Plastic"], ["surface", "Surface"]];

/** Bit type on one line, for cards ("Flat · upcut", "V-bit · 60° · downcut · DLC"). */
export function bitKind(b: Bit) {
  const f = sienci.BIT_BY_ID.get(b.id);
  const dlc = b.dlc ? " · DLC" : "";
  if (b.profile === "v") return `V-bit · ${b.angle ?? 60}°${f?.cut === "downcut" ? " · downcut" : ""}${dlc}`;
  if (f?.type === "tapered") return `Tapered ball nose${dlc}`;
  if (f?.type === "groove") return "Round groove";
  if (f?.type === "bowl") return "Bowl bit";
  if (b.profile === "ball") return `Ball nose · ${b.flute}${dlc}`;
  if (b.profile === "compression") return `Compression${dlc}`;
  if (b.profile === "surfacing") return f?.variant === "inserts" ? "Surfacing · inserts" : b.flutes > 2 ? `Surfacing · ${b.flutes} flutes` : "Surfacing";
  if (f?.variant === "roughing") return `Roughing · ${b.flutes} flutes${dlc}`;
  if (f?.variant === "high-helix") return `Flat · high helix${dlc}`;
  return `Flat · ${b.flute}${dlc}`;
}

/** Sets Sienci sells for a machine family. */
export const kitsForFamily = (family: Family) => BIT_KITS.filter((k) => !k.family || family.startsWith(k.family));
export const kitBitIds = (kit: sienci.KitId) => sienci.KIT_BY_ID.get(kit)!.bits.map((x) => x.id);

export type CompatLevel = "fits" | "accessory" | "no";

export function compat(bit: Bit, head: HeadId): { level: CompatLevel; label: string; accessory?: { name: string; url: string } } {
  const c = sienci.compatibility(sienci.BIT_BY_ID.get(bit.id)!, head);
  if (bit.notForSigns && bit.profile !== "surfacing") return { level: "no", label: c.status === "incompatible" ? "Does not fit" : "Not for signs (yet)" };
  const short = HEADS[head].kind === "Spindle" ? "spindle" : HEADS[head].name.split(" ")[0];
  if (c.status === "compatible") return { level: "fits", label: `Fits your ${short}` };
  if (c.status === "with-accessory") return { level: "accessory", label: "Needs the 1/8″ collet", accessory: { name: "1/8″ precision collet", url: c.accessory.url } };
  return { level: "no", label: "Does not fit" };
}

// ---------------- Feeds & speeds ----------------

export type FeedsGroup = sienci.MaterialGroup;
export const FEEDS_GROUPS: [FeedsGroup, string][] = [
  ["softwood", "Soft wood, plywood, MDF"],
  ["hardwood", "Hardwood"],
  ["plastic", "Plastics (acrylic, HDPE…)"],
  ["aluminum", "Aluminum 6061"],
];

export type FeedsBadge = "official" | "estimated" | "not-recommended" | "no-fit";

export interface BitFeeds {
  badge: FeedsBadge;
  /** Short label for the card ("Official Sienci feeds"). */
  label: string;
  /** Why (tooltip / small print). */
  detail: string;
  feeds?: sienci.SienciFeeds;
}

/**
 * Feeds for a bit on a machine + head, from the Sienci table: "official" when the numbers are Sienci's
 * own for this setup, "estimated" when CarvCAM derived them (rules in cam-engine feeds.ts).
 */
export function bitFeeds(bitId: string, machine: MachineId, head: HeadId, group: FeedsGroup = "softwood", preset?: Preset): BitFeeds {
  const r = sienci.sienciFeeds(bitId, machine, head, group, preset ? PRESET_TO_SPEED[preset] : undefined);
  if (r.status === "incompatible") return { badge: "no-fit", label: "Does not fit", detail: r.reason };
  if (r.status === "not-recommended") return { badge: "not-recommended", label: "Not recommended", detail: r.reason };
  const f = r.feeds;
  if (f.origin === "official") return { badge: "official", label: "Official Sienci feeds", detail: "Straight from Sienci's feeds & speeds table for this machine.", feeds: f };
  const why = f.reasons.includes("bit")
    ? "Sienci's table doesn't list this exact bit; CarvCAM scales the closest row by chip load and removal rate."
    : f.reasons.includes("machine")
      ? `Sienci has no ${machineById(machine).family} table yet; CarvCAM uses the LongMill table, as Sienci advises.`
      : f.reasons.includes("head")
        ? `The ${HEADS[head].name} can't reach the table's speed; feed scaled to keep the same chip load.`
        : "Capped to your machine's top speed.";
  return { badge: "estimated", label: "Estimated", detail: why, feeds: f };
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
