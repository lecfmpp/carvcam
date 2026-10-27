import { describe, expect, it } from "vitest";
import { generatePlate } from "../src/generate.js";
import { migrateLegacyBitId, migrateLegacySpec } from "../src/migrate.js";
import { BIT_BY_ID } from "../src/catalog/sienci/bits.js";
import { PROJECTS } from "../src/catalog/sienci/projects.js";
import { PlateSpecSchema } from "../src/schema.js";
import { example, fonts } from "./helpers.js";

/** The "anas-house" example as v0.1.0 saved it (Portuguese field names and values). */
const legacy = {
  placa: {
    tipo: "placa",
    largura: 200,
    altura: 100,
    espessura: 15,
    material: "mdf",
    texto: [{ conteudo: "Casa da Ana", fonte: "archivo-black", tamanho: 16, modo: "relevo", profundidade: 3 }],
    borda: { tipo: "arredondada", raio: 10 },
    moldura: 6,
    furos: [
      { x: 15, y: 85, diametro: 5 },
      { x: 185, y: 85, diametro: 5 },
    ],
  },
  ferramenta: { id: 1, nome: "Fresa reta 1/8\" longa", diametro: 3.175, canais: 2, comprimentoCorte: 22 },
};

describe("v0.1.0 data migration", () => {
  it("turns a legacy spec into the current one", () => {
    expect(migrateLegacySpec(legacy)).toEqual(example("anas-house"));
  });

  it("is a no-op on current data", () => {
    const ex = example("anas-house");
    expect(migrateLegacySpec(ex)).toEqual(ex);
    for (const p of PROJECTS) expect(migrateLegacySpec(p.plate)).toEqual(p.plate);
  });

  it("migrated legacy spec produces the same G-code", async () => {
    const f = await fonts();
    const m = migrateLegacySpec<{ plate: unknown; tool: unknown }>(legacy);
    const ex = example("anas-house");
    const a = generatePlate(PlateSpecSchema.parse(m.plate), { fonts: f, tool: m.tool as never });
    const b = generatePlate(ex.plate, { fonts: f, tool: ex.tool });
    expect(a.gcode).toBe(b.gcode);
  });

  it("maps every legacy bit id to a bit in the catalog", () => {
    for (const id of ["reta-1-8-upcut", "reta-1-4-1canal", "aplainar-22mm", "bola-1-4"]) expect(BIT_BY_ID.has(migrateLegacyBitId(id))).toBe(true);
    expect(migrateLegacyBitId("vbit-60-15mm")).toBe("vbit-60-15mm");
  });
});
