import { beforeAll, describe, expect, it } from "vitest";
import { PathBuilder } from "../src/cam/builder.js";
import { pocket } from "../src/cam/operations.js";
import { rect } from "../src/geometry/shapes.js";
import { generatePlate } from "../src/generate.js";
import type { FontMap } from "../src/layout.js";
import { postGrbl } from "../src/post/grbl.js";
import { simulate } from "../src/sim/heightmap.js";
import { PlateSpecSchema, ToolSchema, type PlateSpecInput } from "../src/schema.js";
import { example, fonts } from "./helpers.js";

let f: FontMap;
beforeAll(async () => {
  f = await fonts();
});

const longTool = { comprimentoCorte: 22 };
const codes = (spec: PlateSpecInput, extra = {}) => generatePlate(spec, { fontes: f, ferramenta: longTool, ...extra }).avisos.map((a) => a.codigo);
const base: PlateSpecInput = { largura: 200, altura: 100, espessura: 15 };

describe("pocket", () => {
  it("esvazia um quadrado inteiro na profundidade pedida, sem passar da parede", () => {
    const tool = ToolSchema.parse({});
    const b = new PathBuilder({ avanco: 1000, mergulho: 300, alturaRecuo: 3, alturaSegura: 10 });
    pocket(b, rect(10, 10, 20, 20), { raio: tool.diametro / 2, sobreposicao: 1.2, profundidade: 2, passada: 1, direcao: "convencional" });
    b.safe();
    const g = postGrbl({ titulo: "t", bloco: { largura: 40, altura: 40, espessura: 5 }, alturaSegura: 10 }, [{ nome: "p", ferramenta: tool, rpm: 18000, moves: b.moves }]);
    const hm = simulate(g, tool, { x0: 0, y0: 0, width: 40, height: 40 }, 0.2);
    for (let y = 11; y <= 29; y += 0.5) for (let x = 11; x <= 29; x += 0.5) expect(hm.at(x, y)).toBeCloseTo(-2, 3);
    for (const [x, y] of [[9.7, 20], [30.3, 20], [20, 9.7], [20, 30.3]]) expect(hm.at(x, y)).toBe(0);
  });
});

describe("especificação", () => {
  it("aplica os padrões", () => {
    const s = PlateSpecSchema.parse(base);
    expect(s.material).toBe("mdf");
    expect(s.recorteExterno).toBe(true);
    expect(s.borda.tipo).toBe("reta");
  });
  it("rejeita medidas inválidas", () => {
    expect(() => PlateSpecSchema.parse({ ...base, largura: -1 })).toThrow();
    expect(() => PlateSpecSchema.parse({ ...base, texto: [{ conteudo: "", tamanho: 10 }] })).toThrow();
  });
});

describe("checagens de fabricabilidade", () => {
  it("texto grande demais", () => {
    expect(codes({ ...base, texto: [{ conteudo: "Casa da Ana", tamanho: 40 }] })).toContain("TEXTO_NAO_CABE");
  });
  it("profundidade que atravessaria o material", () => {
    expect(codes({ ...base, texto: [{ conteudo: "A", tamanho: 30, modo: "gravado", profundidade: 16 }] })).toContain("PROFUNDIDADE_EXCEDE");
  });
  it("furo menor que a fresa", () => {
    expect(codes({ ...base, furos: [{ x: 20, y: 20, diametro: 2 }] })).toContain("FURO_MENOR_QUE_FRESA");
  });
  it("furo fora da peça", () => {
    expect(codes({ ...base, furos: [{ x: 199, y: 50, diametro: 6 }] })).toContain("FORA_DA_PECA");
  });
  it("texto com traços mais finos que a fresa", () => {
    expect(codes({ ...base, texto: [{ conteudo: "ana", tamanho: 6, modo: "gravado", profundidade: 1 }] })).toContain("ELEMENTO_NAO_USINAVEL");
  });
  it("miolos que se soltam num vazado", () => {
    expect(codes({ ...base, texto: [{ conteudo: "OA", tamanho: 40, modo: "recorte" }] })).toContain("ILHAS_SOLTAS");
  });
  it("fresa curta para o recorte", () => {
    const c = generatePlate({ ...base }, { fontes: f }).avisos.map((a) => a.codigo);
    expect(c).toContain("FERRAMENTA_CURTA");
  });
  it("fresa em V só grava", () => {
    expect(codes({ ...base, texto: [{ conteudo: "A", tamanho: 30, modo: "relevo" }] }, { ferramenta: { tipo: "vbit", angulo: 60, comprimentoCorte: 22 } })).toContain("VBIT_SO_GRAVA");
  });
  it("peça maior que a máquina", () => {
    expect(codes({ ...base, largura: 900 })).toContain("PECA_MAIOR_QUE_MAQUINA");
  });
  it("não devolve G-code quando há erro", () => {
    const r = generatePlate({ ...base, furos: [{ x: 20, y: 20, diametro: 1 }] }, { fontes: f, ferramenta: longTool });
    expect(r.ok).toBe(false);
    expect(r.gcode).toBe("");
  });
});

describe("exemplos", () => {
  it("letreiro cursivo: recorta letras ligadas e os miolos", () => {
    const ex = example("letreiro-pacifico");
    const r = generatePlate(ex.placa, { fontes: f, ferramenta: ex.ferramenta, maquina: ex.maquina });
    expect(r.ok).toBe(true);
    expect(r.operacoes).toHaveLength(1);
    // Letras ligadas viram poucas peças (o pingo do "i" e o hífen ficam soltos), com vários miolos.
    const externos = r.layout.peca.filter((p) => area1(p) > 0).length;
    const miolos = r.layout.peca.filter((p) => area1(p) < 0).length;
    expect(externos).toBeLessThan("Bem-vindos".length);
    expect(miolos).toBeGreaterThanOrEqual(4);
  });

  it("duas fresas: troca de ferramenta com M6 entre gravação e recorte", () => {
    const ex = example("placa-gravada-icones");
    const r = generatePlate(ex.placa, { fontes: f, ferramenta: ex.ferramenta, ferramentaRecorte: ex.ferramentaRecorte });
    expect(r.ok).toBe(true);
    const lines = r.gcode.split("\n");
    expect(lines.filter((l) => /^T\d M6$/.test(l))).toEqual(["T1 M6", "T2 M6"]);
    expect(lines.indexOf("T2 M6")).toBeGreaterThan(lines.findIndex((l) => l.includes("Gravação")));
  });

  it("G-code só usa comandos da lista permitida e nunca G0 abaixo de Z0", () => {
    const ex = example("casa-da-ana");
    const g = generatePlate(ex.placa, { fontes: f, ferramenta: ex.ferramenta }).gcode;
    let rapid = false;
    for (const raw of g.split("\n")) {
      const l = raw.replace(/;.*/, "").trim();
      if (!l) continue;
      expect(l).toMatch(/^([GMTSFXYZP]-?[\d.]+\s?)+$/);
      if (/G0\b/.test(l)) rapid = true;
      if (/G1\b/.test(l)) rapid = false;
      const z = /Z(-?[\d.]+)/.exec(l);
      if (rapid && z) expect(Number(z[1])).toBeGreaterThanOrEqual(0);
    }
  });
});

function area1(p: { x: number; y: number }[]) {
  let s = 0;
  for (let i = 0; i < p.length; i++) s += p[i].x * p[(i + 1) % p.length].y - p[(i + 1) % p.length].x * p[i].y;
  return s / 2;
}
