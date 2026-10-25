import { describe, expect, it } from "vitest";
import { area, pointInRegion } from "../src/geometry/clip.js";
import { formatoDe, parseDesenho } from "../src/desenho.js";
import { parseDxf } from "../src/dxf.js";
import { SvgInvalido } from "../src/svg.js";

/** Monta um DXF ASCII mínimo a partir de entidades [tipo, [código, valor]...]. */
function dxf(ents: [string, [number, number | string][]][], insunits?: number) {
  const L: (string | number)[] = [];
  if (insunits !== undefined) L.push(0, "SECTION", 2, "HEADER", 9, "$INSUNITS", 70, insunits, 0, "ENDSEC");
  L.push(0, "SECTION", 2, "ENTITIES");
  for (const [t, g] of ents) {
    L.push(0, t, 8, "0");
    for (const [c, v] of g) L.push(c, v);
  }
  L.push(0, "ENDSEC", 0, "EOF");
  return L.join("\n");
}

const square = (x: number, y: number, s: number): [string, [number, number][]] => [
  "LWPOLYLINE",
  [[90, 4], [70, 1], [10, x], [20, y], [10, x + s], [20, y], [10, x + s], [20, y + s], [10, x], [20, y + s]],
];

describe("parseDxf", () => {
  it("polilinha fechada e círculo dentro viram área com furo", () => {
    const d = parseDxf(dxf([square(0, 0, 40), ["CIRCLE", [[10, 20], [20, 20], [40, 10]]]]));
    expect(d.largura).toBeCloseTo(40, 3);
    expect(area(d.regiao)).toBeCloseTo(1600 - Math.PI * 100, 0);
    expect(pointInRegion(d.regiao, { x: 0, y: 0 })).toBe(false);
  });

  it("emenda linhas e arcos soltos num contorno fechado (estádio)", () => {
    // Retângulo 40×20 com as pontas arredondadas por dois arcos; tudo em pedaços soltos.
    const d = parseDxf(
      dxf([
        ["LINE", [[10, 10], [20, 0], [11, 50], [21, 0]]],
        ["ARC", [[10, 50], [20, 10], [40, 10], [50, -90], [51, 90]]],
        ["LINE", [[10, 50], [20, 20], [11, 10], [21, 20]]],
        ["ARC", [[10, 10], [20, 10], [40, 10], [50, 90], [51, 270]]],
      ]),
    );
    expect(d.abertos).toBe(0);
    expect(d.largura).toBeCloseTo(60, 1);
    expect(area(d.regiao)).toBeCloseTo(40 * 20 + Math.PI * 100, 0);
  });

  it("bulge desenha meio círculo; polegadas viram mm", () => {
    // Do (0,0) ao (2,0) com bulge 1 = semicírculo de raio 1 polegada.
    const d = parseDxf(dxf([["LWPOLYLINE", [[90, 2], [70, 1], [10, 0], [20, 0], [42, 1], [10, 2], [20, 0]]]], 1));
    expect(d.largura).toBeCloseTo(50.8, 1);
    expect(d.altura).toBeCloseTo(25.4, 1);
    expect(area(d.regiao)).toBeCloseTo((Math.PI * 25.4 * 25.4) / 2, -1);
  });

  it("spline fechada (círculo racional quadrático) tem a área do círculo", () => {
    const w = Math.SQRT1_2;
    const ctrl = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0]].map(([x, y]) => [x * 10, y * 10]);
    const g: [number, number][] = [[70, 1], [71, 2], [72, 12], [73, 9]];
    for (const k of [0, 0, 0, 0.25, 0.25, 0.5, 0.5, 0.75, 0.75, 1, 1, 1]) g.push([40, k]);
    ctrl.forEach(([x, y], i) => {
      g.push([10, x], [20, y]);
      g.push([41, i % 2 ? w : 1]);
    });
    const d = parseDxf(dxf([["SPLINE", g]]));
    expect(area(d.regiao)).toBeCloseTo(Math.PI * 100, 0);
  });

  it("linha solta vira traço fino; sem entidades é erro", () => {
    const d = parseDxf(dxf([["LINE", [[10, 0], [20, 0], [11, 30], [21, 0]]]]));
    expect(d.abertos).toBe(1);
    expect(d.altura).toBeCloseTo(1, 1);
    expect(() => parseDxf(dxf([["TEXT", [[1, "oi"]]]]))).toThrow(SvgInvalido);
  });

  it("detecta o formato pelo conteúdo", () => {
    expect(formatoDe(dxf([square(0, 0, 5)]))).toBe("dxf");
    expect(formatoDe("<svg></svg>")).toBe("svg");
    expect(formatoDe("olá")).toBeNull();
    expect(parseDesenho(dxf([square(0, 0, 5)])).largura).toBeCloseTo(5, 3);
  });
});
