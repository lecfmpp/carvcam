import type { PlateSpecInput } from "../../schema.js";
import type { HeadId } from "./heads.js";
import { compatibility, BIT_BY_ID } from "./bits.js";
import { MACHINES, type MachineId } from "./machines.js";
import type { Speed } from "./table.js";

/**
 * Ready-made projects to test the machine and make the first cuts. The order is the one suggested
 * for someone who just assembled the machine (after surfacing the spoilboard with the Surfacing tool).
 */
export interface StarterProject {
  id: string;
  title: string;
  description: string;
  level: "first-cut" | "easy" | "intermediate";
  /** What the person learns by making it. */
  learn: string[];
  bit: string;
  cutoutBit?: string;
  speed?: Speed;
  plate: PlateSpecInput;
}

export const PROJECTS: StarterProject[] = [
  {
    id: "depth-test",
    title: "Depth test",
    description: "Engraves 1, 2 and 3 at depths of 1, 2 and 3 mm on a scrap of MDF. No cutout: nothing comes loose.",
    level: "first-cut",
    learn: ["Clamping the material", "Zeroing X, Y and Z", "Checking the depth with calipers"],
    bit: "flat-1-8-upcut",
    speed: "reduced",
    plate: {
      width: 120, height: 40, thickness: 12, material: "mdf", outerCutout: false,
      texts: [
        { content: "1", size: 22, mode: "engrave", depth: 1, x: 20, y: 20 },
        { content: "2", size: 22, mode: "engrave", depth: 2, x: 60, y: 20 },
        { content: "3", size: 22, mode: "engrave", depth: 3, x: 100, y: 20 },
      ],
    },
  },
  {
    id: "coaster",
    title: "Coaster with an initial",
    description: "A 10 cm disc with an engraved letter, cut out with tabs. A nod to the coaster from Sienci's first projects.",
    level: "first-cut",
    learn: ["Profile cut with tabs", "Freeing the part and sanding off the tabs"],
    bit: "flat-1-8-upcut",
    plate: {
      width: 100, height: 100, thickness: 6, material: "mdf",
      edge: { type: "rounded", radius: 50 },
      texts: [{ content: "A", size: 45, mode: "engrave", depth: 2 }],
    },
  },
  {
    id: "door-sign",
    title: "Raised door sign",
    description: "\"Ana's House\" in 3 mm relief, with a frame, rounded corners and two screw holes.",
    level: "easy",
    learn: ["Relief (clearing the background)", "Mounting holes", "A longer job (~20 min)"],
    bit: "flat-1-8-upcut",
    plate: {
      width: 200, height: 100, thickness: 15, material: "mdf",
      edge: { type: "rounded", radius: 10 },
      texts: [{ content: "Ana's House", size: 16, mode: "relief", depth: 3 }],
      holes: [{ x: 15, y: 85, diameter: 5 }, { x: 185, y: 85, diameter: 5 }],
    },
  },
  {
    id: "pet-plaque",
    title: "Pet name plaque",
    description: "Engraved name with a heart and a leaf, plus a hanging slot. Uses two bits: 1/16″ for the details and 1/8″ for the cutout.",
    level: "intermediate",
    learn: ["Changing bits mid-job", "Re-zeroing Z after the bit change"],
    bit: "flat-1-16-downcut",
    cutoutBit: "flat-1-8-upcut",
    plate: {
      width: 150, height: 90, thickness: 12, material: "softwood",
      edge: { type: "chamfered", radius: 8 },
      texts: [
        { content: "LUNA", font: "bebas-neue", size: 30, mode: "engrave", depth: 2 },
        { content: "since 2024", font: "archivo-black", size: 9, mode: "engrave", depth: 1.5 },
      ],
      icons: [
        { id: "heart", x: 22, y: 70, size: 16, mode: "engrave", depth: 2 },
        { id: "leaf", x: 128, y: 70, size: 16, mode: "engrave", depth: 2 },
      ],
      slots: [{ x: 75, y: 80, length: 14, width: 6 }],
    },
  },
  {
    id: "welcome-sign",
    title: "\"Welcome\" lettering",
    description: "Joined script letters cut out of plywood with a compression bit (both faces come out clean).",
    level: "intermediate",
    learn: ["Cut-out lettering", "Compression bit in plywood"],
    bit: "flat-1-8-compression",
    speed: "regular",
    plate: {
      type: "lettering", width: 260, height: 110, thickness: 6, material: "plywood",
      texts: [{ content: "Welcome", font: "pacifico", size: 40 }],
    },
  },
  {
    id: "acrylic-keychain",
    title: "Acrylic keychain",
    description: "Acrylic tag with a V-carved name and a hole for the key ring. Single-flute bit so the acrylic does not melt.",
    level: "intermediate",
    learn: ["Cutting plastic", "Engraving with a V-bit"],
    bit: "vbit-30-1-8",
    cutoutBit: "flat-1-8-1flute",
    plate: {
      width: 70, height: 30, thickness: 3, material: "acrylic",
      edge: { type: "rounded", radius: 8 },
      texts: [{ content: "LEO", font: "bebas-neue", size: 14, mode: "engrave", depth: 0.6, x: 42, y: 15 }],
      holes: [{ x: 10, y: 15, diameter: 5 }],
    },
  },
  {
    id: "address-sign",
    title: "Large address sign",
    description: "Raised house number on a 90 × 30 cm sign, with a 1/4″ bit. Only fits the larger machines.",
    level: "intermediate",
    learn: ["Large parts", "1/4″ bit for fast pocketing"],
    bit: "flat-1-4-upcut",
    plate: {
      width: 900, height: 300, thickness: 19, material: "mdf",
      edge: { type: "rounded", radius: 20 },
      frame: 15,
      texts: [{ content: "1234", font: "archivo-black", size: 160, mode: "relief", depth: 4 }],
      holes: [{ x: 30, y: 270, diameter: 8 }, { x: 870, y: 270, diameter: 8 }],
    },
  },
];

export interface ProjectOnMachine {
  project: StarterProject;
  fits: boolean;
  /** Accessories needed (e.g. a 1/8″ collet in the Makita). */
  accessories: string[];
  /** Reasons it will not work (stock larger than the machine, a bit that does not fit…). */
  blockers: string[];
}

/** Lists the projects with what each one needs on this machine and head. */
export function projectsForMachine(machine: MachineId, headId?: HeadId): ProjectOnMachine[] {
  const m = MACHINES[machine];
  const head = headId ?? m.defaultHead;
  return PROJECTS.map((project) => {
    const p = project.plate;
    const margin = (p.outerCutout ?? true) ? 2 * (p.margin ?? 10) : 0;
    const blockers: string[] = [];
    const accessories: string[] = [];
    if (p.width + margin > m.travel.x || p.height + margin > m.travel.y) {
      blockers.push(`The stock (${p.width + margin} × ${p.height + margin} mm) does not fit on the ${m.name}.`);
    }
    for (const id of [project.bit, project.cutoutBit].filter(Boolean) as string[]) {
      const c = compatibility(BIT_BY_ID.get(id)!, head);
      if (c.status === "incompatible") blockers.push(c.reason);
      if (c.status === "with-accessory" && !accessories.includes(c.accessory.name)) accessories.push(c.accessory.name);
    }
    return { project, fits: blockers.length === 0, accessories, blockers };
  });
}

