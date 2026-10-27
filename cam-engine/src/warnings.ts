/** The spec element a warning refers to (index within that type's list). */
export interface ElementRef {
  type: "text" | "icon" | "shape" | "svg" | "hole" | "slot";
  index: number;
}

/** A fix the UI can apply with one click ("Apply suggestion"). */
export interface Fix {
  element: ElementRef;
  field: string;
  value: number;
}

/**
 * Every warning code the engine can produce (stable; the UI maps each one to a card with a way out).
 * A test in the UI fails when a code is added here without a mapping.
 */
export const WARNING_CODES = [
  "TEXT_DOES_NOT_FIT",
  "DETAIL_SMALLER_THAN_BIT",
  "ELEMENT_NOT_MACHINABLE",
  "DEPTH_EXCEEDS",
  "TOOL_TOO_SHORT",
  "HOLE_SMALLER_THAN_BIT",
  "SLOT_SMALLER_THAN_BIT",
  "OUTSIDE_PART",
  "LOOSE_ISLANDS",
  "PART_LARGER_THAN_MACHINE",
  "DIFFERENT_DEPTHS",
  "SMALL_PART_WITHOUT_TABS",
  "VBIT_ENGRAVE_ONLY",
  "FONT_UNAVAILABLE",
  "NOTHING_TO_CUT",
  "BIT_INCOMPATIBLE",
  "BIT_NEEDS_ACCESSORY",
  "BIT_NOT_SUPPORTED",
  "NO_SIENCI_TABLE",
  "COMPRESSION_STEPDOWN",
  "INVALID_SVG",
  "VCARVE_FLAT_BOTTOM",
  "ENGRAVED_IN_FLOOR",
  "HATCH_TOO_DENSE",
  "KEEP_OUT_OVERLAP",
  "KEEP_OUT_TOO_TALL",
  "INVALID_SPEC",
] as const;

export type WarningCode = (typeof WARNING_CODES)[number];

/**
 * Warnings carry a stable code (for the UI and the assistant to react to) and a human-readable
 * English message (to show straight to the user).
 */
export interface Warning {
  code: WarningCode;
  severity: "error" | "warning";
  message: string;
  suggestion?: string;
  data?: Record<string, unknown>;
  element?: ElementRef;
  fix?: Fix;
}

export const hasErrors = (warnings: Warning[]) => warnings.some((a) => a.severity === "error");

export const fmt = (n: number, d = 1) => n.toFixed(d).replace(/\.0+$/, "");
