import { fmt, type Aviso } from "../../avisos.js";
import type { CutParams } from "../../materials.js";
import type { MachineInput, MaterialId, ToolInput } from "../../schema.js";
import { CABECOTES, dialPara, type CabecoteId } from "./cabecotes.js";
import { compatibilidade, FRESA_POR_ID, paraFerramenta, type FresaSienci } from "./fresas.js";
import { limitesDaMaquina, MAQUINAS, type MaquinaId } from "./maquinas.js";
import { parametrosSienci, type Velocidade } from "./tabela.js";

/** Mergulho máximo para descida reta (resources.sienci.com, "Feeds & Speeds - LongMill"). */
export const MERGULHO_RETO_MAX = 300;

/** O que o usuário escolhe na interface: máquina, router/spindle, fresas e velocidade. */
export interface ConfigSienci {
  maquina: MaquinaId;
  /** Padrão: o cabeçote padrão da máquina. */
  cabecote?: CabecoteId;
  /** Fresa principal (gravação e relevo), id do catálogo. */
  fresa: string;
  /** Fresa para recortes e furos. Padrão: a principal. */
  fresaRecorte?: string;
  /** Padrão: a velocidade sugerida para a máquina. */
  velocidade?: Velocidade;
}

export interface AjusteManual {
  ferramenta: number;
  rpm: number;
  dial: number;
  mensagem: string;
}

export interface ConfigResolvida {
  maquina: MachineInput;
  ferramenta: ToolInput;
  ferramentaRecorte?: ToolInput;
  corte?: Partial<CutParams>;
  corteRecorte?: Partial<CutParams>;
  avisos: Aviso[];
  /** Quando o router não é controlado pelo G-code (Makita), o usuário precisa girar o dial. */
  ajustesManuais: AjusteManual[];
  fonte: string;
}

/** Traduz a escolha do usuário em limites, ferramentas e parâmetros de corte para o motor. */
export function resolverSienci(cfg: ConfigSienci, material: MaterialId): ConfigResolvida {
  const maq = MAQUINAS[cfg.maquina];
  const cabId = cfg.cabecote ?? maq.cabecotePadrao;
  const cab = CABECOTES[cabId];
  const velocidade = cfg.velocidade ?? maq.velocidadePadrao;
  const avisos: Aviso[] = [];
  const ajustesManuais: AjusteManual[] = [];

  if (!maq.cabecotes.includes(cabId)) {
    avisos.push({ codigo: "FRESA_INCOMPATIVEL", severidade: "erro", mensagem: `O ${cab.nome} não é uma opção para a ${maq.nome}.` });
  }

  const fresas: { f: FresaSienci; numero: number; papel: string }[] = [];
  const principal = buscar(cfg.fresa, avisos);
  if (principal) fresas.push({ f: principal, numero: 1, papel: "principal" });
  const recorte = cfg.fresaRecorte && cfg.fresaRecorte !== cfg.fresa ? buscar(cfg.fresaRecorte, avisos) : undefined;
  if (recorte) fresas.push({ f: recorte, numero: 2, papel: "de recorte" });

  const params: Partial<CutParams>[] = [];
  for (const { f, numero, papel } of fresas) {
    if (!f.usoNaV1) {
      avisos.push({
        codigo: "FRESA_NAO_SUPORTADA",
        severidade: "erro",
        mensagem: `A fresa ${papel} (${f.nome}) não serve para placas e letreiros.`,
        sugestao: f.indicacao,
      });
    }
    const c = compatibilidade(f, cabId);
    if (c.status === "incompativel") avisos.push({ codigo: "FRESA_INCOMPATIVEL", severidade: "erro", mensagem: c.motivo });
    if (c.status === "com-acessorio") {
      avisos.push({
        codigo: "FRESA_PRECISA_ACESSORIO",
        severidade: "aviso",
        mensagem: `Para usar a ${f.nome} no ${cab.nome} você precisa de: ${c.acessorio.nome}.`,
        dados: { url: c.acessorio.url },
      });
    }

    const t = f.linha ? parametrosSienci(f.linha, material, velocidade) : undefined;
    if (!t) {
      avisos.push({
        codigo: "SEM_TABELA_SIENCI",
        severidade: "aviso",
        mensagem: `A Sienci não publica parâmetros da ${f.nome} para este material; usando valores conservadores calculados.`,
      });
      params.push({});
      continue;
    }
    let passada = t.passadaCanal;
    if (f.compressaoUpcut && passada <= f.compressaoUpcut) {
      const minima = f.compressaoUpcut + 0.5;
      if (minima <= t.passadaPocket) {
        passada = minima;
        avisos.push({
          codigo: "COMPRESSAO_PASSADA",
          severidade: "aviso",
          mensagem: `Passada aumentada para ${fmt(minima)} mm: numa fresa de compressão a primeira passada precisa passar dos ${fmt(f.compressaoUpcut)} mm de corte para cima.`,
        });
      } else {
        avisos.push({
          codigo: "COMPRESSAO_PASSADA",
          severidade: "aviso",
          mensagem: `Com este material e velocidade a passada fica abaixo de ${fmt(f.compressaoUpcut)} mm, e a fresa de compressão vai lascar a face de cima.`,
          sugestao: "Use uma fresa downcut ou suba a velocidade da tabela.",
        });
      }
    }
    // O motor ainda desce reto (sem rampa). Fora de entalhe 3D, a Sienci recomenda
    // mergulho de 100–300 mm/min, bem abaixo do valor da tabela.
    const mergulho = Math.min(t.mergulho, MERGULHO_RETO_MAX);
    params.push({ rpm: t.rpm, avanco: t.avanco, mergulho, passada, sobreposicao: t.sobreposicao });

    if (cab.controleRpm === "manual") {
      const d = dialPara(cab, t.rpm);
      if (d) {
        ajustesManuais.push({
          ferramenta: numero,
          rpm: t.rpm,
          dial: d.posicao,
          mensagem: `Antes de cortar com a ${f.nome}, gire o dial do ${cab.nome} para ${d.posicao} (${d.rpm.toLocaleString("pt-BR")} RPM).`,
        });
      }
    }
  }

  return {
    maquina: limitesDaMaquina(cfg.maquina, cabId),
    ferramenta: principal ? paraFerramenta(principal, 1) : {},
    ferramentaRecorte: recorte ? paraFerramenta(recorte, 2) : undefined,
    corte: params[0],
    corteRecorte: recorte ? params[1] : undefined,
    avisos,
    ajustesManuais,
    fonte: `Tabela Sienci Labs, velocidade ${velocidade}`,
  };
}

function buscar(id: string, avisos: Aviso[]): FresaSienci | undefined {
  const f = FRESA_POR_ID.get(id);
  if (!f) avisos.push({ codigo: "FRESA_INCOMPATIVEL", severidade: "erro", mensagem: `Fresa "${id}" não está no catálogo Sienci.` });
  return f;
}
