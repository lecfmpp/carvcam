import { beforeAll, describe, expect, it } from "vitest";
import { area, bounds, pointInRegion } from "../src/geometry/clip.js";
import { polygon, star } from "../src/geometry/shapes.js";
import { textToRegion } from "../src/geometry/text.js";
import { generatePlate } from "../src/generate.js";
import type { FontMap } from "../src/layout.js";
import type { PlateSpecInput } from "../src/schema.js";
import { fonts } from "./helpers.js";

let f: FontMap;
beforeAll(async () => {
  f = await fonts();
});

const gen = (spec: PlateSpecInput) => generatePlate(spec, { fontes: f, ferramenta: { comprimentoCorte: 22 } });
const engraved = (r: ReturnType<typeof gen>) => r.layout.gravados;

describe("formas novas", () => {
  it("hexágono e estrela têm a área esperada", () => {
    // Hexágono regular de raio 10: 3√3/2 · r².
    expect(area(polygon(0, 0, 10, 6))).toBeCloseTo((3 * Math.sqrt(3) * 100) / 2, 3);
    const s = star(0, 0, 10, 5, 0.5);
    const b = bounds(s);
    expect(b.maxY).toBeCloseTo(10, 6);
    expect(area(s)).toBeGreaterThan(0);
    expect(area(s)).toBeLessThan(Math.PI * 100 * 0.5);
  });

  it("polígono e estrela viram cortes na placa", () => {
    const r = gen({
      largura: 160,
      altura: 100,
      espessura: 12,
      formas: [
        { tipo: "poligono", x: 50, y: 50, diametro: 40, lados: 6 },
        { tipo: "estrela", x: 110, y: 50, diametro: 50, pontas: 5 },
      ],
    });
    expect(r.ok).toBe(true);
    expect(engraved(r).map((g) => g.ref)).toEqual([
      { tipo: "forma", indice: 0 },
      { tipo: "forma", indice: 1 },
    ]);
  });
});

describe("texto em arco", () => {
  it("curva para cima: o meio fica mais alto que as pontas", () => {
    const reto = bounds(textToRegion(f["archivo-black"]!, "ARCO ARCO", 10));
    const arco = textToRegion(f["archivo-black"]!, "ARCO ARCO", 10, 40);
    const b = bounds(arco);
    expect(b.maxX - b.minX).toBeLessThan(reto.maxX - reto.minX);
    expect(b.maxY - b.minY).toBeGreaterThan(reto.maxY - reto.minY + 5);
    // O topo do meio está perto de y = altura das letras; as pontas descem.
    expect(b.minY).toBeLessThan(-5);
  });

  it("curva para baixo espelha o sentido", () => {
    const b = bounds(textToRegion(f["archivo-black"]!, "ARCO ARCO", 10, -40));
    expect(b.maxY).toBeGreaterThan(14);
    expect(b.minY).toBeGreaterThan(-1);
  });
});

describe("ajustes de elemento", () => {
  const base: PlateSpecInput = { largura: 160, altura: 100, espessura: 12, recorteExterno: false };

  it("deslocamento engrossa a forma", () => {
    const a = engraved(gen({ ...base, formas: [{ tipo: "circulo", x: 80, y: 50, diametro: 20 }] }))[0];
    const b = engraved(gen({ ...base, formas: [{ tipo: "circulo", x: 80, y: 50, diametro: 20, deslocamento: 5 }] }))[0];
    expect(area(a.regiao)).toBeCloseTo(Math.PI * 100, 0);
    expect(area(b.regiao)).toBeCloseTo(Math.PI * 225, 0);
  });

  it("contorno acrescenta um anel separado do elemento", () => {
    const g = engraved(gen({ ...base, formas: [{ tipo: "circulo", x: 80, y: 50, diametro: 20, contorno: { distancia: 3, largura: 2 } }] }))[0];
    expect(area(g.regiao)).toBeCloseTo(Math.PI * 100 + Math.PI * (15 * 15 - 13 * 13), 0);
    expect(pointInRegion(g.regiao, { x: 80 + 11.5, y: 50 })).toBe(false); // vão entre o círculo e o anel
    expect(pointInRegion(g.regiao, { x: 80 + 14, y: 50 })).toBe(true);
  });

  it("subtrair faz uma lua; máscara corta o que sai do círculo", () => {
    const lua = engraved(
      gen({
        ...base,
        formas: [
          { tipo: "circulo", x: 80, y: 50, diametro: 40 },
          { tipo: "circulo", x: 92, y: 56, diametro: 36, operacao: "subtrair" },
        ],
      }),
    );
    expect(lua).toHaveLength(1);
    expect(pointInRegion(lua[0].regiao, { x: 92, y: 56 })).toBe(false);
    expect(pointInRegion(lua[0].regiao, { x: 64, y: 46 })).toBe(true);

    const mask = engraved(
      gen({
        ...base,
        formas: [
          { tipo: "retangulo", x: 80, y: 50, largura: 100, altura: 10 },
          { tipo: "circulo", x: 80, y: 50, diametro: 40, operacao: "mascara" },
        ],
      }),
    );
    expect(mask).toHaveLength(1);
    const b = bounds(mask[0].regiao);
    expect(b.maxX - b.minX).toBeLessThan(40.1);
  });

  it("subtrair e máscara com alvos afetam só os elementos escolhidos", () => {
    const g = engraved(
      gen({
        ...base,
        formas: [
          { tipo: "circulo", x: 60, y: 50, diametro: 30 },
          { tipo: "circulo", x: 100, y: 50, diametro: 30 },
          // Faixa que cobre os dois, mas só corta o segundo.
          { tipo: "retangulo", x: 80, y: 50, largura: 100, altura: 6, operacao: "subtrair", alvos: [{ tipo: "forma", indice: 1 }] },
        ],
      }),
    );
    expect(g).toHaveLength(2);
    expect(pointInRegion(g[0].regiao, { x: 60, y: 50 })).toBe(true);
    expect(pointInRegion(g[1].regiao, { x: 100, y: 50 })).toBe(false);

    const m = engraved(
      gen({
        ...base,
        formas: [
          { tipo: "retangulo", x: 50, y: 50, largura: 60, altura: 10 },
          { tipo: "retangulo", x: 110, y: 50, largura: 60, altura: 10 },
          { tipo: "circulo", x: 80, y: 50, diametro: 100, operacao: "mascara", alvos: [] },
        ],
      }),
    );
    // Lista vazia: a máscara não afeta ninguém.
    expect(area(m[0].regiao)).toBeCloseTo(600, 0);
    expect(area(m[1].regiao)).toBeCloseTo(600, 0);
  });

  it("gravado raso no fundo do relevo avisa e sugere gravar mais fundo", () => {
    const r = gen({
      largura: 160,
      altura: 100,
      espessura: 12,
      texto: [{ conteudo: "OI", tamanho: 20, modo: "relevo", profundidade: 3, x: 50, y: 50 }],
      formas: [{ tipo: "circulo", x: 120, y: 50, diametro: 20, modo: "gravado", profundidade: 2 }],
    });
    const a = r.avisos.find((x) => x.codigo === "GRAVADO_NO_FUNDO");
    expect(a?.elemento).toEqual({ tipo: "forma", indice: 0 });
    expect(a?.correcao?.valor).toBe(4);
  });

  it("afinar até sumir vira erro com correção", () => {
    const r = gen({ ...base, formas: [{ tipo: "circulo", x: 80, y: 50, diametro: 10, deslocamento: -6 }] });
    const a = r.avisos.find((x) => x.codigo === "ELEMENTO_NAO_USINAVEL");
    expect(a?.correcao).toEqual({ elemento: { tipo: "forma", indice: 0 }, campo: "deslocamento", valor: 0 });
  });
});
