import { beforeAll, describe, expect, it } from "vitest";
import {
  compatibilidade,
  FRESA_POR_ID,
  FRESAS,
  MAQUINAS,
  MERGULHO_RETO_MAX,
  parametrosSienci,
  PROJETOS,
  projetosParaMaquina,
  type MaquinaId,
} from "../src/catalog/sienci/index.js";
import { generatePlate } from "../src/generate.js";
import type { FontMap } from "../src/layout.js";
import { fonts } from "./helpers.js";

let f: FontMap;
beforeAll(async () => {
  f = await fonts();
});

const fresa = (id: string) => FRESA_POR_ID.get(id)!;
const codes = (r: { avisos: { codigo: string }[] }) => r.avisos.map((a) => a.codigo);

describe("catálogo Sienci", () => {
  it("tem dados completos em todas as fresas", () => {
    for (const fr of FRESAS) {
      expect(fr.diametro).toBeGreaterThan(0);
      expect(fr.comprimentoCorte).toBeGreaterThan(0);
      expect(fr.url).toMatch(/^https:\/\/sienci\.com\//);
      if (fr.tipo === "vbit") expect(fr.angulo).toBeGreaterThan(0);
    }
  });

  it("sabe o que prende em cada router e spindle", () => {
    expect(compatibilidade(fresa("reta-1-8-upcut"), "makita-rt0701").status).toBe("com-acessorio");
    expect(compatibilidade(fresa("reta-1-4-upcut"), "makita-rt0701").status).toBe("compativel");
    expect(compatibilidade(fresa("reta-1-8-upcut"), "autospin-t1").status).toBe("compativel");
    expect(compatibilidade(fresa("vbit-60-15mm"), "spindle-2-2kw-er20").status).toBe("compativel");
  });

  it("converte a tabela oficial para mm (madeira macia, velocidade regular, 1/8″ reta)", () => {
    expect(parametrosSienci("1/8-reta", "mdf", "regular")).toEqual({
      avanco: 2159, mergulho: 1092, sobreposicao: 1.52, passadaCanal: 4.06, passadaPocket: 9.14, rpm: 17000,
    });
    expect(parametrosSienci("aplainar-22", "acrilico", "regular")).toBeUndefined();
  });
});

describe("geração com máquina Sienci", () => {
  const placa = { largura: 200, altura: 100, espessura: 12, texto: [{ conteudo: "Oi", tamanho: 30, modo: "gravado" as const, profundidade: 2 }] };

  it("Makita: avisa da pinça 1/8″ e diz a posição do dial", () => {
    const r = generatePlate(placa, { fontes: f, sienci: { maquina: "longmill-mk2-30x30", fresa: "reta-1-8-upcut" } });
    expect(r.ok).toBe(true);
    expect(codes(r)).toContain("FRESA_PRECISA_ACESSORIO");
    expect(r.ajustesManuais).toHaveLength(1);
    expect(r.ajustesManuais[0].dial).toBe(3);
    expect(r.gcode).toContain("gire o dial do Makita RT0701 para 3");
  });

  it("AutoSpin: sem acessório e sem dial (rotação pelo G-code)", () => {
    const r = generatePlate(placa, { fontes: f, sienci: { maquina: "longmill-mk3-30x30", fresa: "reta-1-8-upcut" } });
    expect(r.ok).toBe(true);
    expect(codes(r)).not.toContain("FRESA_PRECISA_ACESSORIO");
    expect(r.ajustesManuais).toEqual([]);
    expect(r.gcode).toMatch(/^S17000 M3$/m);
  });

  it("usa a tabela Sienci com mergulho limitado para descida reta", () => {
    const r = generatePlate(placa, { fontes: f, sienci: { maquina: "longmill-mk3-30x30", fresa: "reta-1-8-upcut", velocidade: "regular" } });
    expect(r.parametros.principal).toMatchObject({ rpm: 17000, avanco: 2159, passada: 4.06, mergulho: MERGULHO_RETO_MAX });
    expect(r.fonteParametros).toMatch(/Sienci/);
  });

  it("recusa fresa que não serve para placas e cabeçote que não existe na máquina", () => {
    const bola = generatePlate(placa, { fontes: f, sienci: { maquina: "altmill-4x4", fresa: "bola-1-4" } });
    expect(bola.ok).toBe(false);
    expect(codes(bola)).toContain("FRESA_NAO_SUPORTADA");
    const makitaNaAltmill = generatePlate(placa, { fontes: f, sienci: { maquina: "altmill-4x4", cabecote: "makita-rt0701", fresa: "reta-1-4-upcut" } });
    expect(makitaNaAltmill.ok).toBe(false);
  });

  it("fresa de compressão: aumenta a passada para passar da parte upcut", () => {
    const r = generatePlate(
      { tipo: "letreiro", largura: 200, altura: 80, espessura: 6, material: "compensado", texto: [{ conteudo: "Oi", fonte: "pacifico", tamanho: 40 }] },
      { fontes: f, sienci: { maquina: "longmill-mk3-30x30", fresa: "reta-1-8-compressao", velocidade: "reduzida" } },
    );
    expect(r.ok).toBe(true);
    expect(codes(r)).toContain("COMPRESSAO_PASSADA");
    expect(r.parametros.principal.passada).toBe(3.5);
  });

  it("usa o curso real da máquina", () => {
    const grande = PROJETOS.find((p) => p.id === "placa-de-endereco")!;
    const r = generatePlate(grande.placa, { fontes: f, sienci: { maquina: "longmill-mk3-30x30", fresa: grande.fresa } });
    expect(codes(r)).toContain("PECA_MAIOR_QUE_MAQUINA");
  });
});

describe("projetos iniciais", () => {
  const maquinas = Object.keys(MAQUINAS) as MaquinaId[];

  it("cada projeto cabe em pelo menos uma máquina, e os pequenos cabem em todas", () => {
    for (const p of PROJETOS) {
      const cabe = maquinas.filter((m) => projetosParaMaquina(m).find((x) => x.projeto.id === p.id)!.cabe);
      expect(cabe.length).toBeGreaterThan(0);
      if (p.id !== "placa-de-endereco") expect(cabe).toEqual(maquinas);
    }
  });

  it.each(maquinas)("%s: todo projeto que cabe gera G-code aprovado, sem erros", (m) => {
    for (const pm of projetosParaMaquina(m)) {
      // A placa grande é lenta para gerar; basta testá-la numa máquina.
      if (!pm.cabe || (pm.projeto.id === "placa-de-endereco" && m !== "altmill-4x4")) continue;
      const p = pm.projeto;
      const r = generatePlate(p.placa, { fontes: f, sienci: { maquina: m, fresa: p.fresa, fresaRecorte: p.fresaRecorte, velocidade: p.velocidade } });
      expect({ projeto: p.id, erros: r.avisos.filter((a) => a.severidade === "erro") }).toEqual({ projeto: p.id, erros: [] });
      expect(r.verificacao?.ok).toBe(true);
    }
  });
});
