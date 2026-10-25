import { beforeAll, describe, expect, it } from "vitest";
import { PathBuilder } from "../src/cam/builder.js";
import { hatch, vcarve } from "../src/cam/operations.js";
import { rect } from "../src/geometry/shapes.js";
import { generatePlate } from "../src/generate.js";
import type { FontMap } from "../src/layout.js";
import { postGrbl } from "../src/post/grbl.js";
import { simulate } from "../src/sim/heightmap.js";
import { ToolSchema } from "../src/schema.js";
import { fonts } from "./helpers.js";

let f: FontMap;
beforeAll(async () => {
  f = await fonts();
});

// Fresa em V de 90°: tan(45°) = 1, então profundidade = distância até a borda.
const v90 = ToolSchema.parse({ tipo: "vbit", angulo: 90, diametro: 12.7, comprimentoCorte: 10, nome: "V 90" });

function run(body: (b: PathBuilder) => void) {
  const b = new PathBuilder({ avanco: 1000, mergulho: 300, alturaRecuo: 3, alturaSegura: 10 });
  body(b);
  b.safe();
  const g = postGrbl({ titulo: "t", bloco: { largura: 60, altura: 30, espessura: 10 }, alturaSegura: 10 }, [{ nome: "v", ferramenta: v90, rpm: 18000, moves: b.moves }]);
  return { g, hm: simulate(g, v90, { x0: 0, y0: 0, width: 60, height: 30 }, 0.1) };
}

describe("vcarve", () => {
  it("a profundidade acompanha a distância até a borda e não passa da parede", () => {
    // Faixa de 6 mm de largura: o fundo chega a ~3 mm no meio.
    const { hm } = run((b) => vcarve(b, rect(10, 12, 40, 6), { meioAngulo: Math.PI / 4, profundidadeMax: 8, passada: 10, direcao: "convencional" }));
    expect(hm.at(30, 15)).toBeCloseTo(-3, 0);
    expect(hm.at(30, 15)).toBeLessThan(-2.7);
    // A 1 mm da borda, 1 mm de profundidade (o cone encosta na parede).
    expect(hm.at(30, 13)).toBeCloseTo(-1, 0);
    expect(Math.abs(hm.at(30, 13) + 1)).toBeLessThan(0.25);
    // Fora da faixa, nada.
    expect(hm.at(30, 11.8)).toBe(0);
    expect(hm.at(30, 18.2)).toBe(0);
  });

  it("com limite de profundidade, o meio fica plano no limite e a área plana é informada", () => {
    let res = { areaPlana: 0 };
    const { hm } = run((b) => {
      res = vcarve(b, rect(10, 10, 40, 10), { meioAngulo: Math.PI / 4, profundidadeMax: 2, passada: 10, direcao: "convencional" });
    });
    expect(res.areaPlana).toBeGreaterThan(36 * 6 * 0.9);
    // Fundo plano limpo com a própria fresa em V: cristas de até ~0,08 mm entre os passes.
    for (const y of [13, 14, 15, 16, 17]) expect(Math.abs(hm.at(30, y) + 2)).toBeLessThan(0.1);
    expect(hm.at(30, 11)).toBeCloseTo(-1, 0);
  });

  it("passadas: nenhum anel desce mais que a passada de uma vez", () => {
    const { g } = run((b) => vcarve(b, rect(10, 10, 40, 10), { meioAngulo: Math.PI / 4, profundidadeMax: 4, passada: 1.5, direcao: "convencional" }));
    const zs = [...g.matchAll(/Z(-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
    expect(Math.min(...zs)).toBeCloseTo(-4, 3);
    // Os níveis intermediários (−1,333 e −2,667) aparecem como limite de anéis profundos.
    expect(zs.some((z) => Math.abs(z + 1.3333) < 0.001)).toBe(true);
    expect(zs.some((z) => Math.abs(z + 2.6667) < 0.001)).toBe(true);
  });
});

describe("hatch", () => {
  it("grava o contorno e linhas paralelas, deixando material entre elas", () => {
    const { hm } = run((b) => hatch(b, rect(10, 5, 40, 20), { raio: 0, profundidade: 0.5, passada: 1, espacamento: 3, angulo: 0, direcao: "convencional" }));
    // Linhas horizontais em y = 6,5; 9,5; ... (começa em meio espaçamento).
    expect(hm.at(30, 6.5)).toBeCloseTo(-0.5, 1);
    expect(hm.at(30, 9.5)).toBeCloseTo(-0.5, 1);
    expect(hm.at(30, 8)).toBe(0);
    // Contorno na borda.
    expect(hm.at(10, 15)).toBeCloseTo(-0.5, 1);
  });
});

describe("generatePlate com fresa em V", () => {
  it("gravado vira V-carve aprovado; hachura vira operação própria", () => {
    const r = generatePlate(
      {
        largura: 160,
        altura: 80,
        espessura: 12,
        recorteExterno: false,
        texto: [{ conteudo: "OI", tamanho: 30, modo: "gravado", profundidade: 6 }],
        formas: [{ tipo: "retangulo", x: 130, y: 40, largura: 30, altura: 30, modo: "gravado", profundidade: 0.5, hachura: { espacamento: 2, angulo: 45 } }],
      },
      { fontes: f, ferramenta: { tipo: "vbit", angulo: 60, diametro: 12.7, comprimentoCorte: 12, nome: "V 60" } },
    );
    expect(r.avisos.filter((a) => a.severidade === "erro")).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.operacoes.map((o) => o.nome)).toEqual(["V-carve: texto 1 (OI)", "Hachura: retângulo 1"]);
    expect(r.verificacao?.ok).toBe(true);
  });

  it("avisa quando o limite deixa fundo plano", () => {
    const r = generatePlate(
      { largura: 120, altura: 80, espessura: 12, recorteExterno: false, formas: [{ tipo: "circulo", x: 60, y: 40, diametro: 30, modo: "gravado", profundidade: 2 }] },
      { fontes: f, ferramenta: { tipo: "vbit", angulo: 60, diametro: 12.7, comprimentoCorte: 12, nome: "V 60" } },
    );
    const a = r.avisos.find((x) => x.codigo === "VCARVE_FUNDO_PLANO");
    expect(a?.elemento).toEqual({ tipo: "forma", indice: 0 });
  });
});
