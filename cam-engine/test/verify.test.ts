import { describe, expect, it } from "vitest";
import { verifyGcode, type VerifyLimits } from "../src/verify.js";

const lim: VerifyLimits = { xMin: -5, xMax: 105, yMin: -5, yMax: 105, zMin: -10, zMax: 10, avancoMax: 3000, rpmMin: 10000, rpmMax: 30000 };
const head = "G21 G90\nG0 Z5\nS18000 M3\n";
const errors = (g: string) => verifyGcode(g, lim).problemas.filter((p) => p.severidade === "erro").map((p) => p.mensagem);

describe("verificador de G-code", () => {
  it("aceita um corte simples e calcula tempo e extensão", () => {
    const r = verifyGcode(head + "G0 X10 Y10\nG1 Z-1 F300\nG1 X20 F1200\nG0 Z5\nM5\nM30\n", lim);
    expect(r.ok).toBe(true);
    expect(r.estatisticas.extensao.zMin).toBe(-1);
    // 1 mm de mergulho abaixo da face + 10 mm de corte lateral.
    expect(r.estatisticas.comprimentoCorte).toBe(11);
    expect(r.estatisticas.tempoEstimadoSeg).toBeGreaterThan(0);
  });

  it.each([
    ["comando $ do GRBL", head + "$H\n", /sistema/],
    ["polegadas", "G20 G90\nG0 X1\n", /G20/],
    ["incremental", "G21 G91\nG0 X1\n", /G91/],
    ["G0 para dentro do material", head + "G0 Z-1\n", /rápido/],
    ["G0 lateral dentro do material", head + "G1 Z-1 F300\nG0 X50\n", /lateral/],
    ["corte com spindle desligado", "G21 G90\nG0 Z5\nG1 Z-1 F300\n", /spindle desligado/],
    ["avanço acima do máximo", head + "G1 Z-1 F9000\n", /acima do máximo/],
    ["sai da área", head + "G0 X200\n", /área permitida/],
    ["profundo demais", head + "G1 Z-12 F300\n", /limite/],
    ["comando fora da lista", head + "G28\n", /G28/],
    ["movimento sem G21", "G90\nG0 X1\n", /G21/],
  ])("rejeita %s", (_nome, g, msg) => {
    expect(errors(g).some((m) => msg.test(m))).toBe(true);
  });

  it("considera o arco inteiro, não só os pontos final e inicial", () => {
    // Meia volta de raio 60 centrada em (50, 50): passa por y = 110, fora da área.
    const g = head + "G0 X-10 Y50\nG1 Z-1 F300\nG2 X110 Y50 I60 J0 F1000\n";
    expect(errors(g).some((m) => /área permitida/.test(m))).toBe(true);
  });
});
