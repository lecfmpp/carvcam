/** Elemento da especificação ao qual o aviso se refere (índice dentro da lista do tipo). */
export interface RefElemento {
  tipo: "texto" | "icone" | "forma" | "svg" | "furo" | "rasgo";
  indice: number;
}

/** Correção que a interface pode aplicar com um clique ("Aplicar sugestão"). */
export interface Correcao {
  elemento: RefElemento;
  campo: string;
  valor: number;
}

/**
 * Avisos com código estável (para a UI e a IA reagirem) e mensagem humana em pt-BR
 * (para mostrar direto ao usuário).
 */
export interface Aviso {
  codigo:
    | "TEXTO_NAO_CABE"
    | "DETALHE_MENOR_QUE_FRESA"
    | "ELEMENTO_NAO_USINAVEL"
    | "PROFUNDIDADE_EXCEDE"
    | "FERRAMENTA_CURTA"
    | "FURO_MENOR_QUE_FRESA"
    | "RASGO_MENOR_QUE_FRESA"
    | "FORA_DA_PECA"
    | "ILHAS_SOLTAS"
    | "PECA_MAIOR_QUE_MAQUINA"
    | "PROFUNDIDADES_DIFERENTES"
    | "PECA_PEQUENA_SEM_ABA"
    | "VBIT_SO_GRAVA"
    | "FONTE_INDISPONIVEL"
    | "NADA_A_CORTAR"
    | "FRESA_INCOMPATIVEL"
    | "FRESA_PRECISA_ACESSORIO"
    | "FRESA_NAO_SUPORTADA"
    | "SEM_TABELA_SIENCI"
    | "COMPRESSAO_PASSADA"
    | "SVG_INVALIDO";
  severidade: "erro" | "aviso";
  mensagem: string;
  sugestao?: string;
  dados?: Record<string, unknown>;
  elemento?: RefElemento;
  correcao?: Correcao;
}

export const hasErrors = (avisos: Aviso[]) => avisos.some((a) => a.severidade === "erro");

export const fmt = (n: number, d = 1) => n.toFixed(d).replace(/\.0+$/, "").replace(".", ",");
