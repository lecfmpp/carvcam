import { beforeAll, describe, expect, it } from "vitest";
import { area, bounds, pointInRegion } from "../src/geometry/clip.js";
import { generatePlate } from "../src/generate.js";
import type { FontMap } from "../src/layout.js";
import { parseSvg, SvgInvalido } from "../src/svg.js";
import { fonts } from "./helpers.js";

let f: FontMap;
beforeAll(async () => {
  f = await fonts();
});

const size = (svg: string) => {
  const d = parseSvg(svg);
  return { ...d, b: bounds(d.regiao) };
};

describe("parseSvg", () => {
  it("lê unidades em mm pelo viewBox e centra o desenho", () => {
    const d = size(`<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 200 100"><rect x="20" y="10" width="40" height="20"/></svg>`);
    expect(d.largura).toBeCloseTo(20, 3);
    expect(d.altura).toBeCloseTo(10, 3);
    expect(d.b.minX).toBeCloseTo(-10, 3);
    expect(area(d.regiao)).toBeCloseTo(200, 1);
  });

  it("px sem unidade vale 1/96 de polegada", () => {
    const d = size(`<svg width="96" height="96"><rect width="96" height="48"/></svg>`);
    expect(d.largura).toBeCloseTo(25.4, 3);
    expect(d.altura).toBeCloseTo(12.7, 3);
  });

  it("evenodd faz furo; nonzero com o mesmo sentido não faz", () => {
    const anel = (rule: string) =>
      `<svg viewBox="0 0 100 100" width="100mm" height="100mm"><path fill-rule="${rule}" d="M0 0H100V100H0Z M25 25H75V75H25Z"/></svg>`;
    expect(area(parseSvg(anel("evenodd")).regiao)).toBeCloseTo(10000 - 2500, 0);
    expect(area(parseSvg(anel("nonzero")).regiao)).toBeCloseTo(10000, 0);
    expect(pointInRegion(parseSvg(anel("evenodd")).regiao, { x: 0, y: 0 })).toBe(false);
  });

  it("círculo, arco e curvas viram contornos com a área certa", () => {
    const c = parseSvg(`<svg viewBox="0 0 20 20" width="20mm" height="20mm"><circle cx="10" cy="10" r="10"/></svg>`);
    expect(area(c.regiao)).toBeCloseTo(Math.PI * 100, 0);
    // Semicírculo com arco relativo e flags grudadas.
    const a = parseSvg(`<svg viewBox="0 0 20 20" width="20mm" height="20mm"><path d="M0 10a10 10 0 01 20 0z"/></svg>`);
    expect(area(a.regiao)).toBeCloseTo((Math.PI * 100) / 2, 0);
    expect(a.altura).toBeCloseTo(10, 1);
  });

  it("aplica transform de grupos e Y para cima", () => {
    // Retângulo largo no topo do SVG (Y pequeno) deve ficar em cima na peça.
    const d = parseSvg(
      `<svg viewBox="0 0 100 100" width="100mm" height="100mm"><g transform="translate(10 0) scale(2)"><rect x="0" y="0" width="10" height="5"/></g><rect x="0" y="90" width="5" height="10"/></svg>`,
    );
    expect(d.largura).toBeCloseTo(30, 3);
    expect(d.altura).toBeCloseTo(100, 3);
    // O retângulo largo (20 × 10) está no topo: ponto do lado direito, em cima, é cheio.
    expect(pointInRegion(d.regiao, { x: 10, y: 45 })).toBe(true);
    expect(pointInRegion(d.regiao, { x: 10, y: -45 })).toBe(false);
  });

  it("traço sem preenchimento vira faixa com a largura do traço", () => {
    const d = parseSvg(`<svg viewBox="0 0 100 100" width="100mm" height="100mm"><line x1="10" y1="50" x2="90" y2="50" stroke="#000" stroke-width="4"/></svg>`);
    expect(d.altura).toBeCloseTo(4, 1);
    expect(d.largura).toBeCloseTo(84, 1);
  });

  it("classes em <style> e preenchimento branco subtrai", () => {
    const d = parseSvg(
      `<svg viewBox="0 0 100 100" width="100mm" height="100mm"><style>.a{fill:#222}.b{fill:#fff}</style><rect class="a" width="100" height="100"/><circle class="b" cx="50" cy="50" r="20"/></svg>`,
    );
    expect(area(d.regiao)).toBeCloseTo(10000 - Math.PI * 400, -1);
  });

  it("recusa arquivo sem formas cortáveis", () => {
    expect(() => parseSvg(`<svg viewBox="0 0 10 10"><text>oi</text></svg>`)).toThrow(SvgInvalido);
    expect(() => parseSvg(`não é svg`)).toThrow(SvgInvalido);
  });
});

describe("SVG na placa", () => {
  const estrela = `<svg viewBox="0 0 100 100" width="100mm" height="100mm"><polygon points="50,5 61,38 95,38 67,59 78,92 50,72 22,92 33,59 5,38 39,38"/></svg>`;

  it("gera uma placa com um desenho importado em relevo e marca a referência", () => {
    const r = generatePlate(
      { largura: 160, altura: 120, espessura: 12, svgs: [{ conteudo: estrela, nome: "estrela", x: 80, y: 60, largura: 70, modo: "relevo", profundidade: 3 }] },
      { fontes: f, ferramenta: { comprimentoCorte: 22 } },
    );
    expect(r.avisos.filter((a) => a.severidade === "erro")).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.layout?.relevo?.itens?.[0].ref).toEqual({ tipo: "svg", indice: 0 });
  });

  it("desenho grande demais sugere nova largura; SVG quebrado vira aviso", () => {
    const r = generatePlate(
      { largura: 100, altura: 80, espessura: 12, svgs: [{ conteudo: estrela, x: 50, y: 40, largura: 150 }, { conteudo: "<svg><g/></svg>", x: 10, y: 10, largura: 10 }] },
      { fontes: f, ferramenta: { comprimentoCorte: 22 } },
    );
    const nc = r.avisos.find((a) => a.codigo === "TEXTO_NAO_CABE");
    expect(nc?.correcao?.campo).toBe("largura");
    expect(nc!.correcao!.valor).toBeLessThan(80);
    expect(r.avisos.find((a) => a.codigo === "SVG_INVALIDO")?.elemento).toEqual({ tipo: "svg", indice: 1 });
  });
});
