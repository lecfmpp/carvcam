import { sienci, type MaterialId, type PlateSpecInput } from "@gsender-next/cam-engine";

/**
 * Catálogo no formato da interface. Os dados vêm do motor (catálogo Sienci verificado);
 * aqui só ficam rótulos em inglês (o design é em inglês), cores e textos de apoio.
 */

export type MachineId = sienci.MaquinaId;
export type HeadId = sienci.CabecoteId;
export type Preset = "fast" | "balanced" | "detailed";
export type Intent = "engrave" | "relief" | "cutout" | "plastic" | "surface";

export const PRESET_TO_SPEED: Record<Preset, sienci.Velocidade> = { fast: "maxima", balanced: "regular", detailed: "reduzida" };
export const SPEED_TO_PRESET: Record<sienci.Velocidade, Preset> = { maxima: "fast", regular: "balanced", reduzida: "detailed" };
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

export const MACHINES: Machine[] = Object.values(sienci.MAQUINAS).map((m) => ({
  id: m.id,
  family: m.familia === "AltMill" ? "AltMill" : FAMILY_OF[m.versao],
  size: m.tamanho,
  area: [m.curso.x, m.curso.y],
  z: m.curso.z,
  maxSpeed: m.avancoMax.xy,
  controller: m.controlador,
  heads: m.cabecotes,
  defaultHead: m.cabecotePadrao,
  preset: SPEED_TO_PRESET[m.velocidadePadrao],
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
  Object.values(sienci.CABECOTES).map((c) => [
    c.id,
    { id: c.id, name: HEAD_TEXT[c.id].name, note: HEAD_TEXT[c.id].note, kind: c.tipo === "router" ? "Router" : "Spindle", auto: c.controleRpm === "gcode", rpm: [c.rpmMin, c.rpmMax] },
  ]),
) as Record<HeadId, Head>;

export function dialFor(head: HeadId, rpm: number) {
  return sienci.dialPara(sienci.CABECOTES[head], rpm);
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
  uses: Intent[];
  use: string;
  kit: boolean;
  notForSigns: boolean;
  storeUrl: string;
  storeName: string;
}

const BIT_TEXT: Record<string, { name: string; inch: string; uses: Intent[]; use: string }> = {
  "reta-1-16-downcut": { name: "1/16″ flat downcut", inch: "1/16″", uses: ["engrave", "relief"], use: "Fine lettering and engraving without chipping the top face" },
  "reta-1-16-upcut": { name: "1/16″ flat upcut", inch: "1/16″", uses: ["engrave", "relief"], use: "Fine detail that clears chips well" },
  "reta-1-8-downcut": { name: "1/8″ flat downcut", inch: "1/8″", uses: ["relief", "engrave"], use: "Relief and engraving without chipping the top face" },
  "reta-1-8-upcut": { name: "1/8″ flat upcut", inch: "1/8″", uses: ["cutout", "relief", "engrave"], use: "The everyday bit: letters, shapes and small cut-outs" },
  "reta-1-8-1canal": { name: "1/8″ single flute", inch: "1/8″", uses: ["plastic", "cutout"], use: "Acrylic and plastics without melting" },
  "reta-1-8-compressao": { name: "1/8″ compression", inch: "1/8″", uses: ["cutout"], use: "Clean top and bottom edges on plywood" },
  "reta-1-4-upcut": { name: "1/4″ flat upcut", inch: "1/4″", uses: ["cutout", "relief"], use: "Fast cut-outs and large pockets" },
  "reta-1-4-downcut": { name: "1/4″ flat downcut", inch: "1/4″", uses: ["relief", "cutout"], use: "Large pockets in plywood without chipping" },
  "reta-1-4-1canal": { name: "1/4″ single flute", inch: "1/4″", uses: ["plastic", "cutout"], use: "Larger plastic and aluminum parts" },
  "reta-1-4-compressao": { name: "1/4″ compression", inch: "1/4″", uses: ["cutout"], use: "Clean plywood edges on both faces" },
  "vbit-30-1-8": { name: "30° V-bit", inch: "1/8″", uses: ["engrave"], use: "Sharp, fine lettering" },
  "vbit-60-15mm": { name: "60° V-bit", inch: "15 mm", uses: ["engrave", "plastic"], use: "V-carved lettering and acrylic engraving" },
  "vbit-90-15mm": { name: "90° V-bit", inch: "15 mm", uses: ["engrave"], use: "Wide chamfers and bold V-lettering" },
  "aplainar-22mm": { name: "22 mm surfacing bit", inch: "7/8″", uses: ["surface"], use: "Flattens the spoilboard and the top of rough boards" },
  "bola-1-4": { name: "1/4″ ball nose", inch: "1/4″", uses: [], use: "Smooth curved 3D relief" },
};

const PROFILE: Record<string, BitProfile> = { reta: "flat", vbit: "v", bola: "ball", aplainar: "surfacing" };
const FLUTE: Record<string, string> = { upcut: "upcut", downcut: "downcut", compressao: "compression", reto: "straight" };

export const BITS: Bit[] = sienci.FRESAS.map((f) => {
  const t = BIT_TEXT[f.id];
  return {
    id: f.id,
    name: t.name,
    profile: f.corte === "compressao" ? "compression" : PROFILE[f.tipo],
    flute: f.canais === 1 && f.tipo === "reta" ? "single flute" : FLUTE[f.corte],
    d: f.diametro,
    inch: t.inch,
    shank: Math.abs(f.haste - 3.175) < 0.01 ? "1/8" : "1/4",
    cut: f.comprimentoCorte,
    angle: f.angulo,
    uses: t.uses,
    use: t.use,
    kit: sienci.STARTER_SET.includes(f.id),
    notForSigns: !f.usoNaV1,
    storeUrl: f.url,
    storeName: f.nome,
  };
});

export const bitById = (id: string) => BITS.find((b) => b.id === id);
export const KIT = sienci.STARTER_SET.slice();
export const INTENTS: [Intent, string][] = [["engrave", "Engrave"], ["relief", "Relief"], ["cutout", "Cut out"], ["plastic", "Plastic"], ["surface", "Surface"]];

export type CompatLevel = "fits" | "accessory" | "no";

export function compat(bit: Bit, head: HeadId): { level: CompatLevel; label: string; accessory?: { name: string; url: string } } {
  if (bit.notForSigns && bit.profile !== "surfacing") return { level: "no", label: "Not for signs (yet)" };
  const c = sienci.compatibilidade(sienci.FRESA_POR_ID.get(bit.id)!, head);
  const short = HEADS[head].kind === "Spindle" ? "spindle" : HEADS[head].name.split(" ")[0];
  if (c.status === "compativel") return { level: "fits", label: `Fits your ${short}` };
  if (c.status === "com-acessorio") return { level: "accessory", label: "Needs the 1/8″ collet", accessory: { name: "1/8″ precision collet", url: c.acessorio.url } };
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
  { id: "Pine", engine: "madeira_macia", face: "#E2C08D", recess: "#B08955", side: "#9A7446", grain: true, thick: [12, 19], sub: "Soft and affordable, a good first project" },
  { id: "Oak", engine: "madeira_dura", face: "#C79A62", recess: "#94683A", side: "#7C5630", grain: true, thick: [12, 19], sub: "Hard, strong grain, lasts outdoors with finish" },
  { id: "Walnut", engine: "madeira_dura", face: "#8A5E3C", recess: "#5E3E26", side: "#4A3120", grain: true, thick: [12, 19], sub: "Dark and premium, carves cleanly" },
  { id: "Birch plywood", engine: "compensado", face: "#E3CBA2", recess: "#B39468", side: "#A08257", grain: true, thick: [6, 12, 18], sub: "Light and stable, layered edges" },
  { id: "Acrylic", engine: "acrilico", face: "#DCE5E9", recess: "#A3B4BB", side: "#8A9BA2", grain: false, thick: [3, 6], sub: "Clean edges, needs a single-flute bit" },
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

const P = Object.fromEntries(sienci.PROJETOS.map((p) => [p.id, p]));
const withTexts = (id: string, texts: string[]): PlateSpecInput => {
  const spec = structuredClone(P[id].placa);
  texts.forEach((t, i) => {
    if (spec.texto?.[i]) spec.texto[i].conteudo = t;
  });
  return spec;
};

export const PROJECTS: Project[] = [
  { id: "teste-de-profundidade", title: "Depth test", level: "First cut", learn: "What 1, 2 and 3 mm deep look and sound like", material: "MDF", bits: ["reta-1-8-upcut"], speed: "detailed", spec: P["teste-de-profundidade"].placa, track: 1 },
  { id: "porta-copos", title: "Coaster with an initial", level: "First cut", learn: "Cutting a shape out with holding tabs", material: "MDF", bits: ["reta-1-8-upcut"], spec: withTexts("porta-copos", ["M"]), track: 2 },
  { id: "placa-de-porta", title: "Raised door sign", level: "Easy", learn: "Lowering the background around raised letters", material: "MDF", bits: ["reta-1-8-upcut"], spec: withTexts("placa-de-porta", ["The Millers"]), track: 3 },
  { id: "plaquinha-de-pet", title: "Pet name plaque", level: "Intermediate", learn: "Changing the bit in the middle of a job", material: "Pine", bits: ["reta-1-16-downcut", "reta-1-8-upcut"], spec: withTexts("plaquinha-de-pet", ["BISCUIT", "since 2024"]) },
  { id: "letreiro-bem-vindos", title: "“Welcome” script lettering", level: "Intermediate", learn: "Clean plywood edges with a compression bit", material: "Birch plywood", bits: ["reta-1-8-compressao"], speed: "balanced", spec: withTexts("letreiro-bem-vindos", ["Welcome"]) },
  { id: "chaveiro-acrilico", title: "Acrylic keychain", level: "Intermediate", learn: "V-carving and cutting plastic cleanly", material: "Acrylic", bits: ["vbit-30-1-8", "reta-1-8-1canal"], spec: withTexts("chaveiro-acrilico", ["JO"]) },
  { id: "placa-de-endereco", title: "Large address sign", level: "Intermediate", learn: "Planning a job that fills a big machine", material: "MDF", bits: ["reta-1-4-upcut"], spec: withTexts("placa-de-endereco", ["1428"]) },
];

export const TRACK = [
  { id: "surface", title: "Surface the bed", sub: "Flatten the spoilboard with the 22 mm bit" },
  { id: "teste-de-profundidade", title: "Depth test" },
  { id: "porta-copos", title: "Coaster" },
  { id: "placa-de-porta", title: "Door sign" },
];

/** Whether a project's board (with margin when it is cut out) fits the machine. */
export function projectFits(p: Project, m: Machine) {
  const margin = (p.spec.recorteExterno ?? true) ? 2 * (p.spec.margem ?? 10) : 0;
  const w = p.spec.largura + margin;
  const h = p.spec.altura + margin;
  return w <= m.area[0] && h <= m.area[1];
}

export function machinesThatFit(p: Project) {
  return MACHINES.filter((m) => projectFits(p, m));
}
