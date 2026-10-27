/** Elemento da especificação ao qual o aviso se refere (índice dentro da lista do tipo). */
export interface ElementRef {
  type: "text" | "icon" | "shape" | "svg" | "hole" | "slot";
  index: number;
}

/** Correção que a interface pode aplicar com um clique ("Aplicar sugestão"). */
export interface Fix {
  element: ElementRef;
  field: string;
  value: number;
}

/**
 * Avisos com código estável (para a UI e a IA reagirem) e mensagem humana em pt-BR
 * (para mostrar direto ao usuário).
 */
export interface Warning {
  code:
    | "TEXT_DOES_NOT_FIT"
    | "DETAIL_SMALLER_THAN_BIT"
    | "ELEMENT_NOT_MACHINABLE"
    | "DEPTH_EXCEEDS"
    | "TOOL_TOO_SHORT"
    | "HOLE_SMALLER_THAN_BIT"
    | "SLOT_SMALLER_THAN_BIT"
    | "OUTSIDE_PART"
    | "LOOSE_ISLANDS"
    | "PART_LARGER_THAN_MACHINE"
    | "DIFFERENT_DEPTHS"
    | "SMALL_PART_WITHOUT_TABS"
    | "VBIT_ENGRAVE_ONLY"
    | "FONT_UNAVAILABLE"
    | "NOTHING_TO_CUT"
    | "BIT_INCOMPATIBLE"
    | "BIT_NEEDS_ACCESSORY"
    | "BIT_NOT_SUPPORTED"
    | "NO_SIENCI_TABLE"
    | "COMPRESSION_STEPDOWN"
    | "INVALID_SVG"
    | "VCARVE_FLAT_BOTTOM"
    | "ENGRAVED_IN_FLOOR"
    | "HATCH_TOO_DENSE";
  severity: "error" | "warning";
  message: string;
  suggestion?: string;
  data?: Record<string, unknown>;
  element?: ElementRef;
  fix?: Fix;
}

export const hasErrors = (warnings: Warning[]) => warnings.some((a) => a.severity === "error");

export const fmt = (n: number, d = 1) => n.toFixed(d).replace(/\.0+$/, "").replace(".", ",");
