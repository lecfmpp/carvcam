import type { GenerateResult, Warning } from "@carvcam/cam-engine";
import { aidOfRef } from "./ids";
import type { Check } from "./types";

/** Engine warnings → checks in the assistant's terms (the same list the warning panel is built from). */
export function checksFromResult(result: GenerateResult | null, engineError?: string): Check[] {
  if (engineError) return [{ code: "ENGINE_ERROR", severity: "error", message: `The engine could not build this design: ${engineError}` }];
  if (!result) return [];
  const out: Check[] = result.warnings.map((w: Warning) => ({
    code: w.code,
    severity: w.severity,
    message: w.message,
    ...(w.suggestion ? { suggestion: w.suggestion } : {}),
    ...(w.element ? { element: aidOfRef(w.element) } : {}),
  }));
  // The G-code verifier (travel limits, plunges…) can fail even when the layout had no errors.
  if (result.verification && !result.verification.ok)
    for (const p of result.verification.problems.filter((x) => x.severity === "error").slice(0, 3)) out.push({ code: "GCODE_CHECK", severity: "error", message: p.message });
  return out;
}

const keyOf = (c: Check) => `${c.code}|${c.element ?? ""}|${c.severity}`;

/** Checks in `after` that were not in `before` (same code, element and severity = the same problem). */
export function newChecks(before: Check[], after: Check[]): Check[] {
  const seen = new Set(before.map(keyOf));
  return after.filter((c) => !seen.has(keyOf(c)));
}

export const hasErrors = (checks: Check[]) => checks.some((c) => c.severity === "error");
