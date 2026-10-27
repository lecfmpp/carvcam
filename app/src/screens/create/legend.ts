import type { GenerateResult } from "@carvcam/cam-engine";

/**
 * The canvas legend, in words a first-timer understands: what happens to the wood in each colour.
 * Only rows for things that are actually in the design are listed.
 */

export type LegendKey = "face" | "lowered" | "through" | "tabs" | "leftover";

export interface LegendRow {
  key: LegendKey;
  label: string;
}

const fmt = (n: number) => String(Math.round(n * 10) / 10);

export function legendRows(input: { result: GenerateResult | null; thickness: number; tabs: number; leftover: boolean }): LegendRow[] {
  const L = input.result?.layout;
  if (!L) return [];
  const T = L.stock.thickness || input.thickness;
  const rows: LegendRow[] = [{ key: "face", label: "Top of the wood, not carved" }];

  const depths = [...(L.relief ? [L.relief.depth] : []), ...L.engraved.map((g) => g.depth)].filter((d) => d > 0 && d < T);
  if (depths.length) {
    const lo = Math.min(...depths);
    const hi = Math.max(...depths);
    rows.push({ key: "lowered", label: hi - lo < 0.05 ? `Carved down ${fmt(hi)} mm` : `Carved down ${fmt(lo)}–${fmt(hi)} mm` });
  }

  const through = !!L.profile || L.cutouts.length > 0 || L.holes.length > 0 || L.engraved.some((g) => g.depth >= T);
  if (through) rows.push({ key: "through", label: "Cut all the way through" });

  if (L.profile && input.tabs > 0) rows.push({ key: "tabs", label: input.tabs === 1 ? "1 tab keeps the piece attached" : `${input.tabs} tabs keep the piece attached` });

  if (input.leftover) rows.push({ key: "leftover", label: "Too tight for the bit: sand or carve by hand" });
  return rows;
}

/** "1/8″ bit: inside corners come out rounded (1.6 mm radius)". */
export function cornerNote(bit: { inch?: string; d: number; profile?: string } | undefined): string | null {
  if (!bit || bit.profile === "v") return null;
  const name = bit.inch ? `${bit.inch} bit` : `${fmt(bit.d)} mm bit`;
  return `${name}: inside corners come out rounded (${fmt(bit.d / 2)} mm radius)`;
}

/** "Pockets are cleared in 1.3 mm steps (40% of the bit)" (Pro). */
export function stepoverNote(result: GenerateResult | null, bitD: number | undefined): string | null {
  const so = result?.params.main.stepover;
  if (!so || !bitD) return null;
  return `Pockets are cleared in ${fmt(so)} mm steps (${Math.round((so / bitD) * 100)}% of the bit)`;
}

/** "1 problem to fix" / "2 things to check". */
export function issuesNote(errors: number, total: number): string | null {
  if (!total) return null;
  if (errors) return errors === 1 ? "1 problem to fix" : `${errors} problems to fix`;
  return total === 1 ? "1 thing to check" : `${total} things to check`;
}
