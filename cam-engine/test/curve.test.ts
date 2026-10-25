import { describe, expect, it } from "vitest";
import { area, bounds } from "../src/geometry/clip.js";
import { curve } from "../src/geometry/shapes.js";
import { generatePlate } from "../src/generate.js";

const K = 0.5523; // alça de Bézier que aproxima um quarto de círculo
const circleNodes = (r: number) => [
  { x: r, y: 0, ix: 0, iy: -r * K, ox: 0, oy: r * K },
  { x: 0, y: r, ix: r * K, iy: 0, ox: -r * K, oy: 0 },
  { x: -r, y: 0, ix: 0, iy: r * K, ox: 0, oy: -r * K },
  { x: 0, y: -r, ix: -r * K, iy: 0, ox: r * K, oy: 0 },
];

describe("curva livre", () => {
  it("nós sem alças formam um polígono", () => {
    const r = curve(10, 10, [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }], true, 3);
    expect(area(r)).toBeCloseTo(200, 6);
    expect(bounds(r).minX).toBeCloseTo(10, 6);
  });

  it("quatro Béziers com alças aproximam um círculo", () => {
    const r = curve(0, 0, circleNodes(20), true, 3);
    expect(area(r)).toBeCloseTo(Math.PI * 400, -1);
    expect(bounds(r).maxY).toBeCloseTo(20, 2);
  });

  it("aberta vira traço com a espessura pedida", () => {
    const r = curve(0, 0, [{ x: 0, y: 0 }, { x: 30, y: 0 }], false, 4);
    expect(area(r)).toBeCloseTo(30 * 4 + Math.PI * 4, 0);
  });

  it("gera G-code numa placa", () => {
    const r = generatePlate(
      { largura: 120, altura: 80, espessura: 12, recorteExterno: false, formas: [{ tipo: "curva", x: 60, y: 40, pontos: circleNodes(15), fechada: true, modo: "gravado", profundidade: 2 }] },
      { fontes: {}, ferramenta: { comprimentoCorte: 22 } },
    );
    expect(r.ok).toBe(true);
    expect(r.layout.gravados[0].ref).toEqual({ tipo: "forma", indice: 0 });
  });
});
