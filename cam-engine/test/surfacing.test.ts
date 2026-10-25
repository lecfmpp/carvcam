import { describe, expect, it } from "vitest";
import { simulate } from "../src/sim/heightmap.js";
import { generateSurfacing } from "../src/surfacing.js";

describe("aplainar a mesa", () => {
  it("varre a área inteira na profundidade pedida, com parâmetros da tabela Sienci", () => {
    const r = generateSurfacing({ largura: 300, altura: 200, profundidade: 0.5, sienci: { maquina: "longmill-mk3-30x30", cabecote: "autospin-t1" } });
    expect(r.ok).toBe(true);
    expect(r.verificacao.problemas.filter((p) => p.severidade === "erro")).toEqual([]);
    expect(r.parametros.rpm).toBe(17000);
    expect(r.parametros.sobreposicao).toBeCloseTo(8.89, 1);
    expect(r.passadas).toBe(1);
    const hm = simulate(r.gcode, r.ferramenta, { x0: -15, y0: -15, width: 330, height: 230 }, 1);
    for (let y = 0; y <= 200; y += 5) for (let x = 0; x <= 300; x += 5) expect(hm.at(x, y)).toBeCloseTo(-0.5, 3);
    expect(hm.at(-14, 100)).toBe(0);
  });

  it("divide profundidades maiores em passadas e informa o dial do Makita", () => {
    const r = generateSurfacing({ largura: 400, altura: 300, profundidade: 2, sienci: { maquina: "longmill-mk2-30x30", cabecote: "makita-rt0701", velocidade: "reduzida" } });
    expect(r.ok).toBe(true);
    expect(r.passadas).toBeGreaterThan(1);
    expect(r.dial?.posicao).toBe(3);
    expect(r.gcode).toContain("dial");
  });

  it("recusa área maior que a máquina", () => {
    const r = generateSurfacing({ largura: 2000, altura: 300, profundidade: 0.5, sienci: { maquina: "longmill-mk3-30x30" } });
    expect(r.ok).toBe(false);
  });
});
