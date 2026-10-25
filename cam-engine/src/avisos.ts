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
    | "NADA_A_CORTAR";
  severidade: "erro" | "aviso";
  mensagem: string;
  sugestao?: string;
  dados?: Record<string, unknown>;
}

export const hasErrors = (avisos: Aviso[]) => avisos.some((a) => a.severidade === "erro");

export const fmt = (n: number, d = 1) => n.toFixed(d).replace(/\.0+$/, "").replace(".", ",");
