import type { PlateSpecInput } from "@carvcam/cam-engine";
import { KIT, materialById, PROJECTS } from "../../lib/catalog";
import type { Design } from "../../state/design";

/** Starting designs for the eval cases (plain data; the First cuts projects come from the real catalog). */

const tabs = { count: 4, height: 3, width: 6, mode: "auto" as const };

export function design(spec: PlateSpecInput, extra: Partial<Design> = {}): Design {
  const material = extra.material ?? (spec.material === "softwood" ? "Pine" : spec.material === "hardwood" ? "Oak" : spec.material === "plywood" ? "Birch plywood" : spec.material === "acrylic" ? "Acrylic" : "MDF");
  return { name: "Eval", material, spec: structuredClone(spec), bit: "flat-1-8-upcut", useBit2: false, tabs: { ...tabs, height: Math.min(3, Math.round(spec.thickness * 0.35 * 10) / 10) }, ...extra };
}

/** A First cuts project opened the way the app opens it. */
export function project(id: string): Design {
  const p = PROJECTS.find((x) => x.id === id);
  if (!p) throw new Error(`No project ${id}`);
  const m = materialById(p.material);
  return design({ ...structuredClone(p.spec), material: m.engine }, { name: p.title, material: m.id, bit: p.bits[0], bit2: p.bits[1], useBit2: p.bits.length > 1, preset: p.speed });
}

export const F = {
  blank: () => design({ type: "plate", width: 200, height: 120, thickness: 15, material: "mdf", texts: [], edge: { type: "rounded", radius: 8 }, frame: 0 }),
  smith: () => design({ type: "plate", width: 300, height: 150, thickness: 15, material: "mdf", frame: 6, edge: { type: "rounded", radius: 10 }, texts: [{ content: "SMITH", font: "archivo-black", size: 30, mode: "relief", depth: 3 }] }),
  houseNumber: () => design({ type: "plate", width: 250, height: 120, thickness: 15, material: "mdf", frame: 0, edge: { type: "straight", radius: 0 }, texts: [{ content: "1428", font: "archivo-black", size: 60, mode: "relief", depth: 3 }] }),
  longName: () => design({ type: "plate", width: 300, height: 120, thickness: 15, material: "mdf", frame: 0, texts: [{ content: "THE ANDERSON FAMILY", font: "archivo-black", size: 40, mode: "engrave", depth: 2 }] }),
  heartStar: () =>
    design({
      type: "plate",
      width: 200,
      height: 200,
      thickness: 12,
      material: "mdf",
      frame: 0,
      icons: [{ id: "heart", x: 60, y: 100, size: 40, mode: "engrave", depth: 2 }],
      shapes: [{ type: "star", x: 140, y: 100, diameter: 40, points: 5, inner: 0.45, rotation: 0, mode: "engrave", depth: 2 }],
    }),
  offCenter: () =>
    design({
      type: "plate",
      width: 240,
      height: 160,
      thickness: 15,
      material: "mdf",
      frame: 0,
      texts: [{ content: "HOME", size: 30, mode: "engrave", depth: 2, x: 70, y: 110 }],
      icons: [{ id: "house", x: 70, y: 60, size: 40, mode: "engrave", depth: 2 }],
    }),
  twoLines: () =>
    design({
      type: "plate",
      width: 260,
      height: 140,
      thickness: 15,
      material: "mdf",
      frame: 0,
      texts: [
        { content: "WELCOME", size: 26, mode: "engrave", depth: 2, x: 140, y: 95 },
        { content: "to the cabin", font: "pacifico", size: 16, mode: "engrave", depth: 1.5, x: 120, y: 45 },
      ],
    }),
  engraved: () =>
    design({
      type: "plate",
      width: 220,
      height: 120,
      thickness: 15,
      material: "mdf",
      frame: 0,
      texts: [{ content: "GARDEN", size: 28, mode: "engrave", depth: 2, x: 110, y: 70 }],
      icons: [{ id: "leaf", x: 110, y: 30, size: 22, mode: "engrave", depth: 2 }],
    }),
  vbitSign: () =>
    design({ type: "plate", width: 200, height: 100, thickness: 15, material: "mdf", frame: 0, outerCutout: false, texts: [{ content: "OAK", size: 30, mode: "engrave", depth: 2 }] }, { bit: "vbit-60-15mm" }),
  script: () => design({ type: "plate", width: 260, height: 110, thickness: 12, material: "plywood", frame: 0, texts: [{ content: "Welcome", font: "pacifico", size: 40, mode: "relief", depth: 3 }] }),
};

/** Bits most beginners own (the Starter End Mill Set) plus the 60° V-bit it includes. */
export const STARTER_BITS = KIT.filter((b) => b !== "surfacing-22mm");
