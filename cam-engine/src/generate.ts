import { fmt, hasErrors, type Aviso } from "./avisos.js";
import { PathBuilder } from "./cam/builder.js";
import { peck, pocket, profile, trace, type Direcao } from "./cam/operations.js";
import { area, bounds, offset, unreachable, type Region } from "./geometry/clip.js";
import { buildLayout, type ElementoCorte, type FontMap, type Layout } from "./layout.js";
import { cutParams, type CutParams } from "./materials.js";
import { postGrbl, type PostOperation } from "./post/grbl.js";
import {
  MachineSchema,
  PlateSpecSchema,
  ToolSchema,
  type Machine,
  type MachineInput,
  type PlateSpecInput,
  type Tool,
  type ToolInput,
} from "./schema.js";
import { verifyGcode, type VerifyResult } from "./verify.js";

export interface GenerateOptions {
  fontes: FontMap;
  /** Fresa principal (gravação e relevo). Padrão: reta de 1/8". */
  ferramenta?: ToolInput;
  /** Fresa para furos e recortes. Padrão: a mesma da principal. */
  ferramentaRecorte?: ToolInput;
  maquina?: MachineInput;
  corte?: Partial<CutParams>;
  direcao?: Direcao;
  abas?: { quantidade?: number; largura?: number; altura?: number };
  titulo?: string;
}

export interface OperacaoInfo {
  nome: string;
  tipo: "gravacao" | "relevo" | "vazado" | "furo" | "perfil";
  ferramenta: number;
  profundidade: number;
}

export interface GenerateResult {
  /** Verdadeiro quando não há erros e o G-code passou no verificador. */
  ok: boolean;
  gcode: string;
  avisos: Aviso[];
  operacoes: OperacaoInfo[];
  verificacao: VerifyResult | null;
  parametros: { principal: CutParams; recorte: CutParams };
  ferramentas: Tool[];
  /** Geometria em coordenadas do bloco, para a prévia 2D/3D da UI. */
  layout: Layout;
}

export function generatePlate(input: PlateSpecInput, opts: GenerateOptions): GenerateResult {
  const spec = PlateSpecSchema.parse(input);
  const tool = ToolSchema.parse(opts.ferramenta ?? {});
  let cutTool = opts.ferramentaRecorte ? ToolSchema.parse(opts.ferramentaRecorte) : tool;
  // Duas fresas precisam de números (T) diferentes para a troca de ferramenta funcionar.
  if (cutTool !== tool && cutTool.id === tool.id) cutTool = { ...cutTool, id: tool.id + 1 };
  const machine: Machine = MachineSchema.parse(opts.maquina ?? {});
  const direcao = opts.direcao ?? "convencional";
  const layout = buildLayout(spec, opts.fontes, tool, cutTool, machine);
  const avisos = [...layout.avisos];

  const pMain = cutParams(spec.material, tool, machine, opts.corte);
  const pCut = cutTool === tool ? pMain : cutParams(spec.material, cutTool, machine, opts.corte);
  const ferramentas = cutTool.id === tool.id ? [tool] : [tool, cutTool];
  const base = { ok: false, avisos, operacoes: [], verificacao: null, parametros: { principal: pMain, recorte: pCut }, ferramentas, layout };

  if (hasErrors(avisos)) return { ...base, gcode: "" };

  const feedsFor = (p: CutParams) => ({ avanco: p.avanco, mergulho: p.mergulho, alturaRecuo: machine.alturaRecuo, alturaSegura: machine.alturaSegura });
  const ops: PostOperation[] = [];
  const operacoes: OperacaoInfo[] = [];

  // A posição da fresa continua de uma operação para a outra, para ordenar pelo mais próximo.
  let pos = { x: 0, y: 0 };
  const run = (nome: string, tipo: OperacaoInfo["tipo"], t: Tool, p: CutParams, profundidade: number, body: (b: PathBuilder) => void) => {
    const b = new PathBuilder(feedsFor(p));
    b.x = pos.x;
    b.y = pos.y;
    body(b);
    b.safe();
    if (b.moves.length === 0) return;
    pos = { x: b.x, y: b.y };
    ops.push({ nome, ferramenta: t, rpm: p.rpm, moves: b.moves });
    operacoes.push({ nome, tipo, ferramenta: t.id, profundidade });
  };

  const rMain = tool.diametro / 2;
  const rCut = cutTool.diametro / 2;

  // 1. Gravações (rasas, com a fresa principal).
  for (const g of layout.gravados) {
    if (tool.tipo === "vbit") {
      run(`Gravação em V: ${g.rotulo}`, "gravacao", tool, pMain, g.profundidade, (b) => trace(b, g.regiao, g.profundidade, direcao));
      continue;
    }
    checkDetail(g, rMain, tool, avisos, "gravado");
    run(`Gravação: ${g.rotulo}`, "gravacao", tool, pMain, g.profundidade, (b) => {
      pocket(b, g.regiao, { raio: rMain, sobreposicao: pMain.sobreposicao, profundidade: g.profundidade, passada: pMain.passada, direcao });
    });
  }

  // 2. Fundo do relevo.
  if (layout.relevo) {
    const rel = layout.relevo;
    checkDetail(rel, rMain, tool, avisos, "relevo");
    run("Rebaixo do fundo (relevo)", "relevo", tool, pMain, rel.profundidade, (b) => {
      pocket(b, rel.regiao, { raio: rMain, sobreposicao: pMain.sobreposicao, profundidade: rel.profundidade, passada: pMain.passada, direcao });
    });
  }

  // 3. Vazados (estêncil), 4. furos e rasgos, 5. contorno externo: fresa de recorte.
  for (const v of layout.vazados) {
    checkDetail(v, rCut, cutTool, avisos, "recorte");
    run(`Vazado: ${v.rotulo}`, "vazado", cutTool, pCut, v.profundidade, (b) => {
      profile(b, v.regiao, { raio: rCut, profundidade: v.profundidade, passada: pCut.passada, direcao, lado: "dentro" });
    });
  }

  for (const f of layout.furos) {
    const bb = bounds(f.regiao);
    const d = Math.min(bb.maxX - bb.minX, bb.maxY - bb.minY);
    run(`Furo: ${f.rotulo}`, "furo", cutTool, pCut, f.profundidade, (b) => {
      if (d <= cutTool.diametro + 0.1) peck(b, { x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 }, f.profundidade, pCut.passada);
      else pocket(b, f.regiao, { raio: rCut, sobreposicao: pCut.sobreposicao, profundidade: f.profundidade, passada: pCut.passada, direcao });
    });
  }

  if (layout.perfil) {
    const per = layout.perfil;
    const abas = {
      quantidade: opts.abas?.quantidade ?? 4,
      largura: opts.abas?.largura ?? 6,
      altura: opts.abas?.altura ?? round1(Math.min(3, spec.espessura * 0.35)),
      espessura: spec.espessura,
    };
    run(`Recorte: ${per.rotulo}`, "perfil", cutTool, pCut, per.profundidade, (b) => {
      const res = profile(b, per.regiao, { raio: rCut, profundidade: per.profundidade, passada: pCut.passada, direcao, lado: "fora", abas });
      if (res.contornosSemAba > 0) {
        avisos.push({
          codigo: "PECA_PEQUENA_SEM_ABA",
          severidade: "aviso",
          mensagem: `${res.contornosSemAba} peça(s) são pequenas demais para abas de fixação e vão se soltar no fim do corte.`,
          sugestao: "Prenda essas partes com fita dupla-face antes de cortar, ou aumente o tamanho.",
        });
      }
    });
  }

  const gcode = postGrbl(
    { titulo: opts.titulo ?? tituloPadrao(spec.texto.map((t) => t.conteudo)), bloco: layout.bloco, alturaSegura: machine.alturaSegura },
    ops,
  );

  const rMax = Math.max(rMain, rCut);
  const verificacao = verifyGcode(gcode, {
    xMin: -rMax - 1,
    xMax: layout.bloco.largura + rMax + 1,
    yMin: -rMax - 1,
    yMax: layout.bloco.altura + rMax + 1,
    zMin: -(spec.espessura + 1),
    zMax: machine.alturaSegura + 0.001,
    avancoMax: machine.avancoMaxXY,
    rpmMin: machine.rpmMin,
    rpmMax: machine.rpmMax,
  });

  return { ...base, ok: verificacao.ok && !hasErrors(avisos), gcode, operacoes, verificacao };
}

/**
 * Avisa quando a fresa não alcança parte do desenho: traços mais finos que a fresa
 * (somem na gravação) ou vãos entre letras mais estreitos que ela (sobra material no relevo).
 */
function checkDetail(el: ElementoCorte, r: number, tool: Tool, avisos: Aviso[], modo: "gravado" | "relevo" | "recorte") {
  const total = area(el.regiao);
  if (total <= 0) return;
  if (area(offset(el.regiao, -r)) <= 0) {
    avisos.push({
      codigo: "ELEMENTO_NAO_USINAVEL",
      severidade: "erro",
      mensagem: `Os traços de ${el.rotulo} são mais finos que a fresa de ${fmt(tool.diametro, 2)} mm; nada seria cortado.`,
      sugestao: "Aumente o tamanho, use uma fonte mais grossa ou uma fresa mais fina.",
    });
    return;
  }
  const missed: Region = offset(unreachable(el.regiao, r), -0.1 * tool.diametro);
  const missedArea = area(missed);
  if (missedArea > 0.5) {
    const pct = (missedArea / total) * 100;
    const onde = modo === "relevo" ? "vãos entre elementos" : "traços";
    avisos.push({
      codigo: "DETALHE_MENOR_QUE_FRESA",
      severidade: "aviso",
      mensagem: `Alguns ${onde} de ${el.rotulo} são mais estreitos que a fresa de ${fmt(tool.diametro, 2)} mm; cerca de ${fmt(pct)}% dessa área não será cortada.`,
      sugestao: modo === "relevo" ? "Aumente o espaçamento ou o tamanho do texto, ou use uma fresa mais fina." : "Aumente o tamanho, use uma fonte mais grossa ou uma fresa mais fina.",
      dados: { areaMm2: Math.round(missedArea), percentual: Math.round(pct * 10) / 10 },
    });
  }
}

function tituloPadrao(textos: string[]) {
  return textos.length ? `Placa: ${textos.join(" / ")}` : "Placa";
}

const round1 = (v: number) => Math.round(v * 10) / 10;
