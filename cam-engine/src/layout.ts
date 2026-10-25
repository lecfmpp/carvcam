import type opentype from "opentype.js";
import { fmt, type Aviso, type RefElemento } from "./avisos.js";
import { area, bounds, difference, intersection, offset, translate, union, type Region } from "./geometry/clip.js";
import { circle, icon, plateOutline, slot, stroke } from "./geometry/shapes.js";
import { centerAt, textToRegion } from "./geometry/text.js";
import { parseSvg, placeSvg, SvgInvalido } from "./svg.js";
import type { FontId, Machine, Modo, PlateSpec, Tool } from "./schema.js";

export interface ElementoCorte {
  /** Ex.: "texto 1 (Casa da Ana)", "ícone 2 (coração)". */
  rotulo: string;
  ref?: RefElemento;
  /** Só no fundo do relevo: os elementos em pé, para saber a qual deles um aviso se refere. */
  itens?: { ref: RefElemento; regiao: Region }[];
  regiao: Region;
  profundidade: number;
}

/** Tudo em coordenadas do bloco: X0 Y0 no canto inferior esquerdo, Z0 na face de cima. */
export interface Layout {
  bloco: { largura: number; altura: number; espessura: number };
  /** Contorno da peça final. */
  peca: Region;
  gravados: ElementoCorte[];
  /** Fundo a rebaixar ao redor dos elementos em relevo. */
  relevo: ElementoCorte | null;
  /** Elementos vazados (estêncil) dentro da placa. */
  vazados: ElementoCorte[];
  furos: ElementoCorte[];
  /** Contorno externo a recortar (fresa por fora). Null quando não há recorte. */
  perfil: ElementoCorte | null;
  avisos: Aviso[];
}

export type FontMap = Partial<Record<FontId, opentype.Font>>;

const THROUGH = 0.3; // mm além da espessura nos cortes vazados (entra na mesa de sacrifício)

export function buildLayout(spec: PlateSpec, fonts: FontMap, tool: Tool, cutTool: Tool, machine: Machine): Layout {
  const avisos: Aviso[] = [];
  const m = spec.recorteExterno ? spec.margem : 0;
  const bloco = { largura: spec.largura + 2 * m, altura: spec.altura + 2 * m, espessura: spec.espessura };
  const through = spec.espessura + THROUGH;

  if (bloco.largura > machine.cursoX || bloco.altura > machine.cursoY) {
    avisos.push({
      codigo: "PECA_MAIOR_QUE_MAQUINA",
      severidade: "erro",
      mensagem: `O bloco (${fmt(bloco.largura)} × ${fmt(bloco.altura)} mm) é maior que a área útil da máquina (${fmt(machine.cursoX)} × ${fmt(machine.cursoY)} mm).`,
      sugestao: "Diminua a placa ou divida o projeto em partes.",
    });
  }
  if (spec.espessura > cutTool.comprimentoCorte && (spec.recorteExterno || spec.tipo === "letreiro")) {
    avisos.push({
      codigo: "FERRAMENTA_CURTA",
      severidade: "erro",
      mensagem: `A fresa de recorte corta até ${fmt(cutTool.comprimentoCorte)} mm, mas o material tem ${fmt(spec.espessura)} mm.`,
      sugestao: "Use uma fresa mais longa ou um material mais fino.",
    });
  }

  // ---- Elementos (texto e ícones) em coordenadas da peça ----
  type Placed = { rotulo: string; regiao: Region; modo: Modo; profundidade: number; tamanho: number; idx: number; tipo: "texto" | "icone" | "forma" | "svg" };
  const placed: Placed[] = [];

  const autoTexts: { idx: number; regiao: Region; tamanho: number }[] = [];
  spec.texto.forEach((t, i) => {
    const font = fonts[t.fonte];
    if (!font) {
      avisos.push({ codigo: "FONTE_INDISPONIVEL", severidade: "erro", mensagem: `A fonte "${t.fonte}" não foi carregada.` });
      return;
    }
    const raw = textToRegion(font, t.conteudo, t.tamanho);
    if (t.x !== undefined && t.y !== undefined) {
      placed.push({ rotulo: `texto ${i + 1} (${t.conteudo})`, regiao: centerAt(raw, t.x, t.y), modo: t.modo, profundidade: t.profundidade, tamanho: t.tamanho, idx: i, tipo: "texto" });
    } else {
      autoTexts.push({ idx: i, regiao: raw, tamanho: t.tamanho });
    }
  });

  // Empilha os textos sem posição, centralizados na placa, na ordem em que vieram.
  if (autoTexts.length) {
    const heights = autoTexts.map((a) => {
      const b = bounds(a.regiao);
      return b.maxY - b.minY;
    });
    const gaps = autoTexts.slice(1).map((a) => a.tamanho * 0.45);
    const total = heights.reduce((s, h) => s + h, 0) + gaps.reduce((s, g) => s + g, 0);
    let top = spec.altura / 2 + total / 2;
    autoTexts.forEach((a, k) => {
      const cy = top - heights[k] / 2;
      const t = spec.texto[a.idx];
      placed.push({ rotulo: `texto ${a.idx + 1} (${t.conteudo})`, regiao: centerAt(a.regiao, spec.largura / 2, cy), modo: t.modo, profundidade: t.profundidade, tamanho: t.tamanho, idx: a.idx, tipo: "texto" });
      top -= heights[k] + (gaps[k] ?? 0);
    });
  }

  spec.formas.forEach((f, i) => {
    const nome = { retangulo: "retângulo", circulo: "círculo", linha: "linha" }[f.tipo];
    const regiao =
      f.tipo === "retangulo"
        ? plateOutline(f.x - f.largura / 2, f.y - f.altura / 2, f.largura, f.altura, f.raio > 0 ? "arredondada" : "reta", f.raio)
        : f.tipo === "circulo"
          ? circle(f.x, f.y, f.diametro / 2)
          : stroke(f.x, f.y, f.x2, f.y2, f.espessura);
    const tamanho = f.tipo === "retangulo" ? Math.min(f.largura, f.altura) : f.tipo === "circulo" ? f.diametro : f.espessura;
    placed.push({ rotulo: `${nome} ${i + 1}`, regiao, modo: f.modo, profundidade: f.profundidade, tamanho, idx: i, tipo: "forma" });
  });

  spec.svgs.forEach((sv, i) => {
    const nome = sv.nome ? `desenho ${i + 1} (${sv.nome})` : `desenho ${i + 1}`;
    try {
      const d = parseSvg(sv.conteudo);
      // "tamanho" do desenho é a largura: é o campo que a correção sugerida ajusta.
      placed.push({ rotulo: nome, regiao: placeSvg(d, sv.x, sv.y, sv.largura), modo: sv.modo, profundidade: sv.profundidade, tamanho: sv.largura, idx: i, tipo: "svg" });
    } catch (e) {
      avisos.push({
        codigo: "SVG_INVALIDO",
        severidade: "erro",
        mensagem: `Não deu para ler ${nome}: ${e instanceof SvgInvalido ? e.message : "arquivo SVG inválido."}`,
        sugestao: "Exporte de novo como SVG simples (textos convertidos em curvas) ou apague este desenho.",
        elemento: { tipo: "svg", indice: i },
      });
    }
  });

  spec.icones.forEach((ic, i) => {
    placed.push({ rotulo: `ícone ${i + 1} (${ic.id})`, regiao: icon(ic.id, ic.x, ic.y, ic.tamanho), modo: ic.modo, profundidade: ic.profundidade, tamanho: ic.tamanho, idx: i, tipo: "icone" });
  });

  const toBlock = (r: Region) => translate(r, m, m);

  // ---- Letreiro: as próprias letras são a peça ----
  if (spec.tipo === "letreiro") {
    const pecaLocal = union(...placed.map((p) => p.regiao));
    const box = { largura: spec.largura, altura: spec.altura };
    checkFit(pecaLocal, box, "o letreiro", placed.map((p) => p.tamanho), avisos);
    const peca = toBlock(pecaLocal);
    if (area(peca) <= 0) avisos.push({ codigo: "NADA_A_CORTAR", severidade: "erro", mensagem: "O letreiro não tem nenhuma letra ou ícone." });
    return {
      bloco,
      peca,
      gravados: [],
      relevo: null,
      vazados: [],
      furos: buildHoles(spec, cutTool, peca, m, through, avisos),
      perfil: { rotulo: "contorno do letreiro", regiao: peca, profundidade: through },
      avisos,
    };
  }

  // ---- Placa ----
  const pecaLocal = plateOutline(0, 0, spec.largura, spec.altura, spec.borda.tipo, spec.borda.raio);
  const peca = toBlock(pecaLocal);
  const hasRelief = placed.some((p) => p.modo === "relevo");
  const inner = hasRelief && spec.moldura > 0 ? offset(pecaLocal, -spec.moldura) : offset(pecaLocal, -1);

  for (const p of placed) {
    const ref = { tipo: p.tipo, indice: p.idx } as RefElemento;
    checkFit(p.regiao, null, p.rotulo, [p.tamanho], avisos, inner, ref);
    if (p.modo !== "recorte" && p.profundidade >= spec.espessura) {
      avisos.push({
        codigo: "PROFUNDIDADE_EXCEDE",
        severidade: "erro",
        mensagem: `A profundidade de ${p.rotulo} (${fmt(p.profundidade)} mm) atravessaria o material de ${fmt(spec.espessura)} mm.`,
        sugestao: `Use no máximo ${fmt(spec.espessura * 0.6)} mm, ou escolha o modo "recorte".`,
        elemento: ref,
        correcao: { elemento: ref, campo: "profundidade", valor: Math.floor(spec.espessura * 0.6 * 10) / 10 },
      });
    }
    if (p.modo !== "recorte" && p.profundidade > tool.comprimentoCorte) {
      avisos.push({
        codigo: "FERRAMENTA_CURTA",
        severidade: "erro",
        mensagem: `A fresa corta até ${fmt(tool.comprimentoCorte)} mm de profundidade, e ${p.rotulo} pede ${fmt(p.profundidade)} mm.`,
        elemento: ref,
      });
    }
    if (tool.tipo === "vbit" && p.modo !== "gravado") {
      avisos.push({
        codigo: "VBIT_SO_GRAVA",
        severidade: "erro",
        mensagem: `A fresa em V só faz gravação. ${p.rotulo} está em modo "${p.modo}".`,
        sugestao: "Troque para uma fresa reta ou mude o elemento para gravado.",
        elemento: ref,
      });
    }
  }

  const gravados: ElementoCorte[] = placed
    .filter((p) => p.modo === "gravado")
    .map((p) => ({ rotulo: p.rotulo, ref: { tipo: p.tipo, indice: p.idx }, regiao: toBlock(intersection(p.regiao, pecaLocal)), profundidade: p.profundidade }));

  let relevo: ElementoCorte | null = null;
  const reliefItems = placed.filter((p) => p.modo === "relevo");
  if (reliefItems.length) {
    const depths = [...new Set(reliefItems.map((p) => p.profundidade))];
    const depth = Math.max(...depths);
    if (depths.length > 1) {
      avisos.push({
        codigo: "PROFUNDIDADES_DIFERENTES",
        severidade: "aviso",
        mensagem: `Os elementos em relevo pedem profundidades diferentes; todos vão usar ${fmt(depth)} mm, porque o fundo é um só.`,
      });
    }
    // Sem moldura, o fundo vai até a borda (e um pouco além, para não sobrar rebarba).
    const field = spec.moldura > 0 ? inner : offset(pecaLocal, cutTool.diametro / 2 + 0.5);
    const fundo = difference(field, union(...reliefItems.map((p) => p.regiao)));
    relevo = {
      rotulo: "fundo do relevo",
      regiao: toBlock(fundo),
      profundidade: depth,
      itens: reliefItems.map((p) => ({ ref: { tipo: p.tipo, indice: p.idx }, regiao: toBlock(p.regiao) })),
    };
  }

  const vazados: ElementoCorte[] = placed
    .filter((p) => p.modo === "recorte")
    .map((p) => {
      const r = intersection(p.regiao, inner);
      const ilhas = r.filter((path) => pathIsHole(path)).length;
      if (ilhas > 0) {
        avisos.push({
          codigo: "ILHAS_SOLTAS",
          severidade: "aviso",
          mensagem: `${capitalize(p.rotulo)} tem ${ilhas} miolo(s) (como o centro do "o") que vão se soltar no recorte.`,
          sugestao: "Use uma fonte estêncil, ou deixe esse elemento em relevo ou gravado.",
          elemento: { tipo: p.tipo, indice: p.idx },
        });
      }
      return { rotulo: p.rotulo, ref: { tipo: p.tipo, indice: p.idx } as RefElemento, regiao: toBlock(r), profundidade: through };
    });

  const furos = buildHoles(spec, cutTool, peca, m, through, avisos);
  const perfil = spec.recorteExterno ? { rotulo: "contorno da placa", regiao: peca, profundidade: through } : null;

  if (!gravados.length && !relevo && !vazados.length && !furos.length && !perfil) {
    avisos.push({ codigo: "NADA_A_CORTAR", severidade: "erro", mensagem: "Não há nada para cortar nesta placa." });
  }

  return { bloco, peca, gravados, relevo, vazados, furos, perfil, avisos };
}

function buildHoles(spec: PlateSpec, tool: Tool, peca: Region, m: number, depth: number, avisos: Aviso[]): ElementoCorte[] {
  const out: ElementoCorte[] = [];
  spec.furos.forEach((f, i) => {
    if (f.diametro < tool.diametro - 0.01) {
      avisos.push({
        codigo: "FURO_MENOR_QUE_FRESA",
        severidade: "erro",
        mensagem: `O furo ${i + 1} tem ${fmt(f.diametro)} mm, menor que a fresa de ${fmt(tool.diametro, 2)} mm.`,
        sugestao: `Aumente o furo para pelo menos ${fmt(tool.diametro, 2)} mm.`,
        elemento: { tipo: "furo", indice: i },
        correcao: { elemento: { tipo: "furo", indice: i }, campo: "diametro", valor: Math.ceil(tool.diametro * 10) / 10 },
      });
      return;
    }
    const r = circle(f.x + m, f.y + m, f.diametro / 2);
    checkInside(r, peca, `o furo ${i + 1}`, avisos, { tipo: "furo", indice: i });
    out.push({ rotulo: `furo ${i + 1}`, ref: { tipo: "furo", indice: i }, regiao: r, profundidade: depth });
  });
  spec.rasgos.forEach((s, i) => {
    if (s.largura < tool.diametro - 0.01) {
      avisos.push({
        codigo: "RASGO_MENOR_QUE_FRESA",
        severidade: "erro",
        mensagem: `O rasgo ${i + 1} tem ${fmt(s.largura)} mm de largura, menor que a fresa de ${fmt(tool.diametro, 2)} mm.`,
        elemento: { tipo: "rasgo", indice: i },
        correcao: { elemento: { tipo: "rasgo", indice: i }, campo: "largura", valor: Math.ceil(tool.diametro * 10) / 10 },
      });
      return;
    }
    const r = slot(s.x + m, s.y + m, s.comprimento, s.largura, s.angulo);
    checkInside(r, peca, `o rasgo ${i + 1}`, avisos, { tipo: "rasgo", indice: i });
    out.push({ rotulo: `rasgo ${i + 1}`, ref: { tipo: "rasgo", indice: i }, regiao: r, profundidade: depth });
  });
  return out;
}

function checkInside(r: Region, peca: Region, rotulo: string, avisos: Aviso[], ref: RefElemento) {
  if (area(difference(r, peca)) > 0.01) {
    avisos.push({ codigo: "FORA_DA_PECA", severidade: "erro", mensagem: `${capitalize(rotulo)} sai para fora da peça.`, elemento: ref });
  }
}

function checkFit(
  r: Region,
  box: { largura: number; altura: number } | null,
  rotulo: string,
  tamanhos: number[],
  avisos: Aviso[],
  inner?: Region,
  ref?: RefElemento,
) {
  const b = bounds(r);
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  let factor = 1;
  let fits = true;
  if (box) {
    fits = w <= box.largura + 1e-6 && h <= box.altura + 1e-6;
    factor = Math.min(box.largura / w, box.altura / h);
  } else if (inner) {
    fits = area(difference(r, inner)) < 0.01;
    if (!fits) {
      const ib = bounds(inner);
      factor = Math.min((ib.maxX - ib.minX) / w, (ib.maxY - ib.minY) / h);
    }
  }
  if (!fits) {
    const sugerido = Math.floor(Math.min(...tamanhos) * Math.min(1, factor) * 0.95);
    avisos.push({
      codigo: "TEXTO_NAO_CABE",
      severidade: "erro",
      mensagem: `${capitalize(rotulo)} não cabe na área disponível da placa.`,
      sugestao: sugerido > 0 ? `Reduza o tamanho para cerca de ${sugerido} mm ou aumente a placa.` : "Aumente a placa.",
      dados: { tamanhoSugerido: sugerido },
      elemento: ref,
      correcao: ref && sugerido > 0 && (ref.tipo === "texto" || ref.tipo === "icone") ? { elemento: ref, campo: "tamanho", valor: sugerido } : ref && sugerido > 0 && ref.tipo === "svg" ? { elemento: ref, campo: "largura", valor: sugerido } : undefined,
    });
  }
}

function pathIsHole(path: { x: number; y: number }[]) {
  let s = 0;
  for (let i = 0; i < path.length; i++) {
    const a = path[i];
    const b = path[(i + 1) % path.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s < 0;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
