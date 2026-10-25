import { describe, expect, it } from "vitest";
import { area } from "../src/geometry/clip.js";
import { ELEMENTOS } from "../src/catalog/elementos.js";
import { generatePlate } from "../src/generate.js";
import { parseSvg } from "../src/svg.js";

describe("biblioteca de elementos", () => {
  it("molduras geradas no tamanho da placa cortam sem perder traço", () => {
    for (const el of ELEMENTOS.filter((e) => e.gerar)) {
      for (const [W, H] of [[120, 80], [300, 150]]) {
        const w = W - 16;
        const h = H - 16;
        const r = generatePlate(
          { largura: W, altura: H, espessura: 12, recorteExterno: false, svgs: [{ conteudo: el.gerar!(w, h), x: W / 2, y: H / 2, largura: w, modo: "gravado", profundidade: 1.5 }] },
          { fontes: {}, ferramenta: { diametro: 3.175, comprimentoCorte: 12 } },
        );
        expect(r.ok, `${el.id} ${W}x${H}`).toBe(true);
        const det = r.avisos.find((a) => a.codigo === "DETALHE_MENOR_QUE_FRESA");
        expect(Number(det?.dados?.percentual ?? 0), `${el.id} ${W}x${H}`).toBeLessThan(2);
      }
    }
  });

  it("tem ids únicos e pelo menos 25 elementos", () => {
    expect(ELEMENTOS.length).toBeGreaterThanOrEqual(25);
    expect(new Set(ELEMENTOS.map((e) => e.id)).size).toBe(ELEMENTOS.length);
  });

  for (const el of ELEMENTOS) {
    it(`${el.id}: lê, tem área e gera G-code gravado aprovado`, () => {
      const d = parseSvg(el.svg);
      expect(area(d.regiao)).toBeGreaterThan(0);
      const W = Math.max(80, el.largura + 30);
      const H = Math.max(60, (el.largura * d.altura) / d.largura + 30);
      const r = generatePlate(
        { largura: W, altura: H, espessura: 12, recorteExterno: false, svgs: [{ conteudo: el.svg, nome: el.name, x: W / 2, y: H / 2, largura: el.largura, modo: "gravado", profundidade: 1.5 }] },
        { fontes: {}, ferramenta: { diametro: 3.175, comprimentoCorte: 12 } },
      );
      expect(r.avisos.filter((a) => a.severidade === "erro")).toEqual([]);
      expect(r.ok).toBe(true);
      // Só cantos vivos podem ficar sem cortar: nenhum traço mais fino que a fresa.
      const det = r.avisos.find((a) => a.codigo === "DETALHE_MENOR_QUE_FRESA");
      expect(Number(det?.dados?.percentual ?? 0)).toBeLessThan(2);
    });
  }
});
