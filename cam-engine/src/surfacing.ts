import { depthLevels, PathBuilder } from "./cam/builder.js";
import { CABECOTES, dialPara, type CabecoteId } from "./catalog/sienci/cabecotes.js";
import { FRESA_POR_ID, paraFerramenta } from "./catalog/sienci/fresas.js";
import { limitesDaMaquina, type MaquinaId } from "./catalog/sienci/maquinas.js";
import { parametrosSienci, type Velocidade } from "./catalog/sienci/tabela.js";
import { cutParams, type CutParams } from "./materials.js";
import { postGrbl } from "./post/grbl.js";
import { MachineSchema, ToolSchema, type MachineInput, type Tool, type ToolInput } from "./schema.js";
import { verifyGcode, type VerifyResult } from "./verify.js";

/**
 * Aplainamento da mesa de sacrifício: varredura em zigue-zague ao longo de X, avançando em Y.
 * Origem do trabalho: canto frontal esquerdo da área, Z0 na face atual da mesa.
 * O centro da fresa percorre a área inteira [0, largura] × [0, altura].
 */
export interface SurfacingInput {
  largura: number;
  altura: number;
  /** Quanto tirar da mesa (mm). */
  profundidade: number;
  passada?: number;
  sobreposicao?: number;
  ferramenta?: ToolInput;
  maquina?: MachineInput;
  corte?: Partial<CutParams>;
  /** Preenche máquina, fresa (22 mm) e parâmetros a partir do catálogo Sienci. */
  sienci?: { maquina: MaquinaId; cabecote?: CabecoteId; velocidade?: Velocidade };
}

export interface SurfacingResult {
  ok: boolean;
  gcode: string;
  linhas: number;
  passadas: number;
  ferramenta: Tool;
  parametros: CutParams;
  verificacao: VerifyResult;
  /** Posição do dial quando o router é ajustado à mão (Makita). */
  dial?: { posicao: number; rpm: number };
}

const FRESA_APLAINAR = "aplainar-22mm";

export function generateSurfacing(input: SurfacingInput): SurfacingResult {
  let maquinaIn = input.maquina;
  let ferramentaIn = input.ferramenta;
  let corte = input.corte ?? {};
  let dial: SurfacingResult["dial"];
  if (input.sienci) {
    maquinaIn = maquinaIn ?? limitesDaMaquina(input.sienci.maquina, input.sienci.cabecote);
    ferramentaIn = ferramentaIn ?? paraFerramenta(FRESA_POR_ID.get(FRESA_APLAINAR)!, 1);
    const t = parametrosSienci("aplainar-22", "mdf", input.sienci.velocidade ?? "regular");
    if (t) corte = { rpm: t.rpm, avanco: t.avanco, mergulho: Math.min(t.mergulho, 300), passada: t.passadaPocket, sobreposicao: t.sobreposicao, ...corte };
    const cab = input.sienci.cabecote ? CABECOTES[input.sienci.cabecote] : undefined;
    if (cab && cab.controleRpm === "manual" && t) dial = dialPara(cab, t.rpm);
  }
  const machine = MachineSchema.parse(maquinaIn ?? {});
  const tool = ToolSchema.parse(ferramentaIn ?? { diametro: 22, comprimentoCorte: 12, nome: "22mm Surfacing Bit" });
  const p = cutParams("mdf", tool, machine, {
    ...corte,
    ...(input.passada ? { passada: input.passada } : {}),
    ...(input.sobreposicao ? { sobreposicao: input.sobreposicao } : {}),
  });
  if (!input.sobreposicao && !corte.sobreposicao) p.sobreposicao = Math.round(tool.diametro * 0.4 * 100) / 100;
  if (!input.passada && !corte.passada) p.passada = Math.min(p.passada, 1);

  const W = input.largura;
  const H = input.altura;
  const rows: number[] = [];
  for (let y = 0; y < H - 1e-6; y += p.sobreposicao) rows.push(round3(y));
  rows.push(H);

  const b = new PathBuilder({ avanco: p.avanco, mergulho: p.mergulho, alturaRecuo: machine.alturaRecuo, alturaSegura: machine.alturaSegura });
  const levels = depthLevels(input.profundidade, p.passada);
  for (const z of levels) {
    b.travel({ x: 0, y: rows[0] });
    b.plunge(z);
    rows.forEach((y, i) => {
      const xa = i % 2 === 0 ? 0 : W;
      const xb = i % 2 === 0 ? W : 0;
      if (i > 0) b.feed({ x: xa, y }, z);
      b.feed({ x: xb, y }, z);
    });
    b.retract();
  }
  b.safe();

  const notas = dial ? [`Makita: gire o dial para ${dial.posicao} ${dial.rpm} RPM antes de ligar`] : [];
  const gcode = postGrbl(
    { titulo: "Aplainar a mesa", bloco: { largura: W, altura: H, espessura: input.profundidade }, alturaSegura: machine.alturaSegura, notas },
    [{ nome: "Aplainamento", ferramenta: tool, rpm: p.rpm, moves: b.moves }],
  );
  const verificacao = verifyGcode(gcode, {
    xMin: -1,
    xMax: Math.min(machine.cursoX, W) + 1,
    yMin: -1,
    yMax: Math.min(machine.cursoY, H) + 1,
    zMin: -(input.profundidade + 0.5),
    zMax: machine.alturaSegura + 0.001,
    avancoMax: machine.avancoMaxXY,
    rpmMin: machine.rpmMin,
    rpmMax: machine.rpmMax,
  });
  return { ok: verificacao.ok && W <= machine.cursoX && H <= machine.cursoY, gcode, linhas: rows.length, passadas: levels.length, ferramenta: tool, parametros: p, verificacao, dial };
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;
