import type { PlateSpecInput } from "../../schema.js";
import type { CabecoteId } from "./cabecotes.js";
import { compatibilidade, FRESA_POR_ID } from "./fresas.js";
import { MAQUINAS, type MaquinaId } from "./maquinas.js";
import type { Velocidade } from "./tabela.js";

/**
 * Projetos prontos para testar a máquina e fazer os primeiros cortes. A ordem é a sugerida
 * para quem acabou de montar a máquina (depois de aplainar a mesa com o Surfacing do gSender).
 */
export interface ProjetoInicial {
  id: string;
  titulo: string;
  descricao: string;
  nivel: "primeiro-corte" | "facil" | "intermediario";
  /** O que a pessoa aprende fazendo. */
  aprende: string[];
  fresa: string;
  fresaRecorte?: string;
  velocidade?: Velocidade;
  placa: PlateSpecInput;
}

export const PROJETOS: ProjetoInicial[] = [
  {
    id: "teste-de-profundidade",
    titulo: "Teste de profundidade",
    descricao: "Grava 1, 2 e 3 em profundidades de 1, 2 e 3 mm numa sobra de MDF. Sem recorte: nada se solta.",
    nivel: "primeiro-corte",
    aprende: ["Prender o material", "Zerar X, Y e Z", "Conferir a profundidade com um paquímetro"],
    fresa: "reta-1-8-upcut",
    velocidade: "reduzida",
    placa: {
      largura: 120, altura: 40, espessura: 12, material: "mdf", recorteExterno: false,
      texto: [
        { conteudo: "1", tamanho: 22, modo: "gravado", profundidade: 1, x: 20, y: 20 },
        { conteudo: "2", tamanho: 22, modo: "gravado", profundidade: 2, x: 60, y: 20 },
        { conteudo: "3", tamanho: 22, modo: "gravado", profundidade: 3, x: 100, y: 20 },
      ],
    },
  },
  {
    id: "porta-copos",
    titulo: "Porta-copos com inicial",
    descricao: "Disco de 10 cm com uma letra gravada, recortado com abas. Lembra o porta-copos dos primeiros projetos da Sienci.",
    nivel: "primeiro-corte",
    aprende: ["Recorte com abas", "Soltar a peça e lixar as abas"],
    fresa: "reta-1-8-upcut",
    placa: {
      largura: 100, altura: 100, espessura: 6, material: "mdf",
      borda: { tipo: "arredondada", raio: 50 },
      texto: [{ conteudo: "A", tamanho: 45, modo: "gravado", profundidade: 2 }],
    },
  },
  {
    id: "placa-de-porta",
    titulo: "Placa de porta em relevo",
    descricao: "\"Casa da Ana\" em relevo de 3 mm, com moldura, cantos arredondados e dois furos para parafusar.",
    nivel: "facil",
    aprende: ["Relevo (rebaixar o fundo)", "Furos de fixação", "Peça mais longa (~20 min)"],
    fresa: "reta-1-8-upcut",
    placa: {
      largura: 200, altura: 100, espessura: 15, material: "mdf",
      borda: { tipo: "arredondada", raio: 10 },
      texto: [{ conteudo: "Casa da Ana", tamanho: 16, modo: "relevo", profundidade: 3 }],
      furos: [{ x: 15, y: 85, diametro: 5 }, { x: 185, y: 85, diametro: 5 }],
    },
  },
  {
    id: "plaquinha-de-pet",
    titulo: "Plaquinha de pet",
    descricao: "Nome gravado com coração e folha, rasgo para pendurar. Usa duas fresas: 1/16″ para os detalhes e 1/8″ para o recorte.",
    nivel: "intermediario",
    aprende: ["Troca de fresa no meio do trabalho", "Rezerar o Z depois da troca"],
    fresa: "reta-1-16-downcut",
    fresaRecorte: "reta-1-8-upcut",
    placa: {
      largura: 150, altura: 90, espessura: 12, material: "madeira_macia",
      borda: { tipo: "chanfrada", raio: 8 },
      texto: [
        { conteudo: "LUNA", fonte: "bebas-neue", tamanho: 30, modo: "gravado", profundidade: 2 },
        { conteudo: "desde 2024", fonte: "archivo-black", tamanho: 9, modo: "gravado", profundidade: 1.5 },
      ],
      icones: [
        { id: "coracao", x: 22, y: 70, tamanho: 16, modo: "gravado", profundidade: 2 },
        { id: "folha", x: 128, y: 70, tamanho: 16, modo: "gravado", profundidade: 2 },
      ],
      rasgos: [{ x: 75, y: 80, comprimento: 14, largura: 6 }],
    },
  },
  {
    id: "letreiro-bem-vindos",
    titulo: "Letreiro \"Bem-vindos\"",
    descricao: "Letras cursivas ligadas, recortadas de compensado com fresa de compressão (as duas faces ficam limpas).",
    nivel: "intermediario",
    aprende: ["Letreiro recortado", "Fresa de compressão em compensado"],
    fresa: "reta-1-8-compressao",
    velocidade: "regular",
    placa: {
      tipo: "letreiro", largura: 260, altura: 110, espessura: 6, material: "compensado",
      texto: [{ conteudo: "Bem-vindos", fonte: "pacifico", tamanho: 40 }],
    },
  },
  {
    id: "chaveiro-acrilico",
    titulo: "Chaveiro de acrílico",
    descricao: "Tag de acrílico com nome gravado em V e furo para a argola. Fresa de 1 canal para o acrílico não derreter.",
    nivel: "intermediario",
    aprende: ["Cortar plástico", "Gravação com fresa em V"],
    fresa: "vbit-30-1-8",
    fresaRecorte: "reta-1-8-1canal",
    placa: {
      largura: 70, altura: 30, espessura: 3, material: "acrilico",
      borda: { tipo: "arredondada", raio: 8 },
      texto: [{ conteudo: "LEO", fonte: "bebas-neue", tamanho: 14, modo: "gravado", profundidade: 0.6, x: 42, y: 15 }],
      furos: [{ x: 10, y: 15, diametro: 5 }],
    },
  },
  {
    id: "placa-de-endereco",
    titulo: "Placa de endereço grande",
    descricao: "Número em relevo numa placa de 90 × 30 cm, com fresa de 1/4″. Só cabe nas máquinas maiores.",
    nivel: "intermediario",
    aprende: ["Peças grandes", "Fresa de 1/4″ para rebaixos rápidos"],
    fresa: "reta-1-4-upcut",
    placa: {
      largura: 900, altura: 300, espessura: 19, material: "mdf",
      borda: { tipo: "arredondada", raio: 20 },
      moldura: 15,
      texto: [{ conteudo: "1234", fonte: "archivo-black", tamanho: 160, modo: "relevo", profundidade: 4 }],
      furos: [{ x: 30, y: 270, diametro: 8 }, { x: 870, y: 270, diametro: 8 }],
    },
  },
];

export interface ProjetoNaMaquina {
  projeto: ProjetoInicial;
  cabe: boolean;
  /** Acessórios necessários (ex.: pinça 1/8″ no Makita). */
  acessorios: string[];
  /** Motivo para não dar (bloco maior que a máquina, fresa que não prende…). */
  impedimentos: string[];
}

/** Lista os projetos com o que cada um precisa nesta máquina e cabeçote. */
export function projetosParaMaquina(maquina: MaquinaId, cabecote?: CabecoteId): ProjetoNaMaquina[] {
  const m = MAQUINAS[maquina];
  const cab = cabecote ?? m.cabecotePadrao;
  return PROJETOS.map((projeto) => {
    const p = projeto.placa;
    const margem = (p.recorteExterno ?? true) ? 2 * (p.margem ?? 10) : 0;
    const impedimentos: string[] = [];
    const acessorios: string[] = [];
    if (p.largura + margem > m.curso.x || p.altura + margem > m.curso.y) {
      impedimentos.push(`O bloco (${p.largura + margem} × ${p.altura + margem} mm) não cabe na ${m.nome}.`);
    }
    for (const id of [projeto.fresa, projeto.fresaRecorte].filter(Boolean) as string[]) {
      const c = compatibilidade(FRESA_POR_ID.get(id)!, cab);
      if (c.status === "incompativel") impedimentos.push(c.motivo);
      if (c.status === "com-acessorio" && !acessorios.includes(c.acessorio.nome)) acessorios.push(c.acessorio.nome);
    }
    return { projeto, cabe: impedimentos.length === 0, acessorios, impedimentos };
  });
}

