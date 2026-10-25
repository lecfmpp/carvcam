import { fmt, hasErrors, type Aviso } from "./avisos.js";
import { PathBuilder } from "./cam/builder.js";
import { hatch, peck, pocket, profile, vcarve, type Direcao } from "./cam/operations.js";
import { area, bounds, intersection, offset, unreachable, type Region } from "./geometry/clip.js";
import { buildLayout, type ElementoCorte, type FontMap, type Layout } from "./layout.js";
import { resolverSienci, type AjusteManual, type ConfigSienci } from "./catalog/sienci/config.js";
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
  /** Parâmetros da fresa de recorte. Padrão: os mesmos de `corte`. */
  corteRecorte?: Partial<CutParams>;
  /**
   * Máquina, cabeçote e fresas do catálogo Sienci Labs. Quando presente, substitui
   * `maquina`, `ferramenta`, `ferramentaRecorte`, `corte` e `corteRecorte` pelos dados do catálogo
   * e pela tabela oficial de avanço e rotação.
   */
  sienci?: ConfigSienci;
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
  /** Ajustes que o usuário faz à mão antes de cortar (ex.: dial do Makita). */
  ajustesManuais: AjusteManual[];
  /** De onde vieram os parâmetros de corte. */
  fonteParametros: string;
  /** Geometria em coordenadas do bloco, para a prévia 2D/3D da UI. */
  layout: Layout;
}

export function generatePlate(input: PlateSpecInput, options: GenerateOptions): GenerateResult {
  const spec = PlateSpecSchema.parse(input);
  const sienci = options.sienci ? resolverSienci(options.sienci, spec.material) : null;
  const opts: GenerateOptions = sienci
    ? { ...options, maquina: sienci.maquina, ferramenta: sienci.ferramenta, ferramentaRecorte: sienci.ferramentaRecorte, corte: sienci.corte, corteRecorte: sienci.corteRecorte }
    : options;
  const tool = ToolSchema.parse(opts.ferramenta ?? {});
  let cutTool = opts.ferramentaRecorte ? ToolSchema.parse(opts.ferramentaRecorte) : tool;
  // Duas fresas precisam de números (T) diferentes para a troca de ferramenta funcionar.
  if (cutTool !== tool && cutTool.id === tool.id) cutTool = { ...cutTool, id: tool.id + 1 };
  const machine: Machine = MachineSchema.parse(opts.maquina ?? {});
  const direcao = opts.direcao ?? "convencional";
  const layout = buildLayout(spec, opts.fontes, tool, cutTool, machine);
  const avisos = [...(sienci?.avisos ?? []), ...layout.avisos];

  const pMain = cutParams(spec.material, tool, machine, opts.corte);
  const pCut = cutTool === tool ? pMain : cutParams(spec.material, cutTool, machine, opts.corteRecorte ?? opts.corte);
  const ferramentas = cutTool.id === tool.id ? [tool] : [tool, cutTool];
  const ajustesManuais = sienci?.ajustesManuais ?? [];
  const fonteParametros = sienci?.fonte ?? "Cálculo genérico por avanço por dente";
  const base = {
    ok: false,
    avisos,
    operacoes: [],
    verificacao: null,
    parametros: { principal: pMain, recorte: pCut },
    ferramentas,
    ajustesManuais,
    fonteParametros,
    layout,
  };

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
    if (g.hachura) {
      const h = g.hachura;
      const largura = tool.tipo === "vbit" ? 2 * g.profundidade * Math.tan(((tool.angulo ?? 60) * Math.PI) / 360) : tool.diametro;
      if (h.espacamento <= largura) {
        const sugerido = Math.ceil(largura * 1.8 * 2) / 2;
        avisos.push({
          codigo: "HACHURA_FECHADA",
          severidade: "aviso",
          mensagem: `As linhas da hachura de ${g.rotulo} ficam a ${fmt(h.espacamento)} mm, menos que a largura do corte (${fmt(largura)} mm); a área vai sair toda rebaixada.`,
          sugestao: `Use pelo menos ${fmt(sugerido)} mm entre as linhas.`,
          elemento: g.ref,
          correcao: g.ref ? { elemento: g.ref, campo: "hachura.espacamento", valor: sugerido } : undefined,
        });
      }
      run(`Hachura: ${g.rotulo}`, "gravacao", tool, pMain, g.profundidade, (b) => {
        hatch(b, g.regiao, { raio: tool.tipo === "vbit" ? 0 : rMain, profundidade: g.profundidade, passada: pMain.passada, espacamento: h.espacamento, angulo: h.angulo, direcao });
      });
      continue;
    }
    if (tool.tipo === "vbit") {
      const meio = ((tool.angulo ?? 60) * Math.PI) / 360;
      // Limite: o pedido, o comprimento de corte, a parte cônica da fresa e o material.
      const max = Math.min(g.profundidade, tool.comprimentoCorte, rMain / Math.tan(meio), spec.espessura - 0.5);
      run(`V-carve: ${g.rotulo}`, "gravacao", tool, pMain, max, (b) => {
        const res = vcarve(b, g.regiao, { meioAngulo: meio, profundidadeMax: max, passada: pMain.passada, direcao });
        if (res.areaPlana > 1) {
          avisos.push({
            codigo: "VCARVE_FUNDO_PLANO",
            severidade: "aviso",
            mensagem: `Partes largas de ${g.rotulo} passariam de ${fmt(max)} mm de profundidade; ali o fundo fica plano e é limpo com a fresa em V (mais demorado).`,
            sugestao: max < g.profundidade ? "A fresa não desce mais que isso. Use uma fresa em V maior ou afine o desenho." : `Aumente a profundidade máxima para cerca de ${fmt(Math.min(tool.comprimentoCorte, spec.espessura * 0.6))} mm, ou afine o desenho.`,
            dados: { areaPlana: Math.round(res.areaPlana) },
            elemento: g.ref,
          });
        }
      });
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
    {
      titulo: opts.titulo ?? tituloPadrao(spec.texto.map((t) => t.conteudo)),
      bloco: layout.bloco,
      alturaSegura: machine.alturaSegura,
      notas: [`Maquina: ${machine.nome}`, `Parametros: ${fonteParametros}`, ...ajustesManuais.map((a) => a.mensagem)],
    },
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
      elemento: el.ref,
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
      elemento: el.ref ?? nearestItem(el, missed, r),
    });
  }
}

/** No fundo do relevo, o elemento em pé que encosta na maior parte da área não cortada. */
function nearestItem(el: ElementoCorte, missed: Region, r: number) {
  let best: { ref: ElementoCorte["ref"]; a: number } = { ref: undefined, a: 0 };
  const near = offset(missed, r);
  for (const it of el.itens ?? []) {
    const a = area(intersection(near, it.regiao));
    if (a > best.a) best = { ref: it.ref, a };
  }
  return best.ref;
}

function tituloPadrao(textos: string[]) {
  return textos.length ? `Placa: ${textos.join(" / ")}` : "Placa";
}

const round1 = (v: number) => Math.round(v * 10) / 10;
