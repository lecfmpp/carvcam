import { beforeAll, describe, expect, it } from "vitest";
import { difference, offset } from "../src/geometry/clip.js";
import { generatePlate, type GenerateResult } from "../src/generate.js";
import type { FontMap } from "../src/layout.js";
import { simulate, type Heightmap } from "../src/sim/heightmap.js";
import { ToolSchema } from "../src/schema.js";
import { example, fonts, samplePoints } from "./helpers.js";

/**
 * Critério de "pronto" da v1: "placa 20×10 cm, MDF 15 mm, 'Casa da Ana' em relevo de 3 mm,
 * borda arredondada, 2 furos" gera um G-code que passa no verificador e, simulado, produz a peça certa.
 */
describe("aceite: placa Casa da Ana", () => {
  let f: FontMap;
  let res: GenerateResult;
  let hm: Heightmap;
  const ex = example("casa-da-ana");
  const tool = ToolSchema.parse(ex.ferramenta);
  const r = tool.diametro / 2;

  beforeAll(async () => {
    f = await fonts();
    res = generatePlate(ex.placa, { fontes: f, ferramenta: ex.ferramenta });
    hm = simulate(res.gcode, tool, { x0: -5, y0: -5, width: 230, height: 130 }, 0.25);
  });

  it("gera G-code aprovado no verificador, sem erros", () => {
    expect(res.avisos.filter((a) => a.severidade === "erro")).toEqual([]);
    expect(res.verificacao?.problemas.filter((p) => p.severidade === "erro")).toEqual([]);
    expect(res.ok).toBe(true);
    expect(res.operacoes.map((o) => o.tipo)).toEqual(["relevo", "furo", "furo", "perfil"]);
  });

  it("deixa as letras e a moldura intactas (nenhum corte indevido)", () => {
    const { peca, relevo } = res.layout;
    const inner = offset(peca, -6);
    const letras = difference(inner, relevo!.regiao);
    const moldura = difference(peca, inner);
    // 0,4 mm de folga para a discretização da simulação.
    for (const p of samplePoints(offset(letras, -0.4), 0.5)) expect(hm.at(p.x, p.y)).toBeGreaterThan(-0.01);
    for (const p of samplePoints(offset(moldura, -0.4), 1)) expect(hm.at(p.x, p.y)).toBeGreaterThan(-0.01);
  });

  it("rebaixa o fundo do relevo exatamente 3 mm onde a fresa alcança", () => {
    const fundo = res.layout.relevo!.regiao;
    const furos = offset(res.layout.furos.flatMap((f) => f.regiao), 0.5);
    const alcancavel = difference(offset(offset(offset(fundo, -r), r), -0.4), furos);
    const pts = samplePoints(alcancavel, 1);
    expect(pts.length).toBeGreaterThan(5000);
    for (const p of pts) expect(hm.at(p.x, p.y)).toBeCloseTo(-3, 2);
  });

  it("fura atravessando o material e recorta o contorno com abas", () => {
    for (const [x, y] of [[25, 95], [195, 95]]) expect(hm.at(x, y)).toBeLessThanOrEqual(-15);
    // Caminho do centro da fresa no recorte: através do material, exceto nas 4 abas.
    const anel = difference(offset(res.layout.peca, r + 0.3), offset(res.layout.peca, r - 0.3));
    const pts = samplePoints(anel, 0.5);
    const atravessou = pts.filter((p) => hm.at(p.x, p.y) <= -15).length / pts.length;
    // Abas de 3 mm: a fresa sobe até Z-12 num material de 15 mm.
    const naAba = pts.filter((p) => Math.abs(hm.at(p.x, p.y) - -12) < 0.05).length;
    expect(atravessou).toBeGreaterThan(0.8);
    expect(atravessou).toBeLessThan(0.99);
    expect(naAba).toBeGreaterThan(20);
  });

  it("não toca no material fora da peça além da largura do recorte", () => {
    const fora = difference(
      [[{ x: -5, y: -5 }, { x: 225, y: -5 }, { x: 225, y: 125 }, { x: -5, y: 125 }]],
      offset(res.layout.peca, 2 * r + 0.4),
    );
    for (const p of samplePoints(fora, 2)) expect(hm.at(p.x, p.y)).toBe(0);
  });

  it("fica dentro de um tempo razoável", () => {
    expect(res.verificacao!.estatisticas.tempoEstimadoSeg).toBeLessThan(40 * 60);
    expect(res.verificacao!.estatisticas.linhas).toBeLessThan(40000);
  });
});
