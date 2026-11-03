import { generatePlate, invalidSpecResult, type GenerateOptions, type GenerateResult } from "./generate.js";
import { PlateSpecSchema, type PlateSpecInput } from "./schema.js";
import type { Warning } from "./warnings.js";

/**
 * Batch production: one sign template with {{field}} placeholders + a CSV with one row per sign.
 */

/**
 * RFC 4180 CSV reader: quoted fields, "" inside quotes, delimiters and newlines inside quotes,
 * CRLF/LF/CR line ends, a UTF-8 BOM. The delimiter is detected from the header line (outside
 * quotes): the most frequent of ",", ";" and tab (comma when tied or absent).
 * Header names are trimmed (an empty one becomes `column N`); values are kept as written.
 * Missing trailing fields become ""; extra fields are dropped; rows with only empty fields are skipped.
 */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const delim = detectDelimiter(src);
  const records: string[][] = [];
  let field = "";
  let rec: string[] = [];
  let quoted = false;
  let i = 0;
  const endRecord = () => {
    rec.push(field);
    records.push(rec);
    rec = [];
    field = "";
  };
  while (i < src.length) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else field += c;
      i++;
      continue;
    }
    if (c === '"' && field.trim() === "") {
      // Opening quote (spaces before it are ignored, as most spreadsheets do).
      field = "";
      quoted = true;
    } else if (c === delim) {
      rec.push(field);
      field = "";
    } else if (c === "\r" || c === "\n") {
      endRecord();
      if (c === "\r" && src[i + 1] === "\n") i++;
    } else field += c;
    i++;
  }
  if (field !== "" || rec.length) endRecord();

  const nonEmpty = records.filter((r) => r.some((v) => v.trim() !== ""));
  if (!nonEmpty.length) return { headers: [], rows: [] };
  const headers = nonEmpty[0].map((h, k) => h.trim() || `column ${k + 1}`);
  const rows = nonEmpty.slice(1).map((r) => Object.fromEntries(headers.map((h, k) => [h, r[k] ?? ""])));
  return { headers, rows };
}

function detectDelimiter(src: string): string {
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  for (const c of src) {
    if (c === '"') quoted = !quoted;
    else if (!quoted && (c === "\n" || c === "\r")) {
      if (counts[","] + counts[";"] + counts["\t"] > 0) break;
    } else if (!quoted && c in counts) counts[c]++;
  }
  let best = ",";
  for (const d of [";", "\t"]) if (counts[d] > counts[best]) best = d;
  return best;
}

const PLACEHOLDER = /\{\{\s*([^{}]*?)\s*\}\}/g;

/** Text contents (and the optional name/title) that may carry placeholders. */
function templateStrings(spec: PlateSpecInput): string[] {
  const extra = spec as { name?: unknown; title?: unknown };
  return [...(typeof extra.name === "string" ? [extra.name] : []), ...(typeof extra.title === "string" ? [extra.title] : []), ...(spec.texts ?? []).map((t) => t.content)];
}

/**
 * The unique {{field}} placeholders in the text contents (plus `name`/`title` when the spec
 * carries them), in order of appearance. Matching is case-insensitive; each field is returned
 * as first written. Spaces inside the braces are ignored ({{ Name }} = {{name}}).
 */
export function templateFields(spec: PlateSpecInput): string[] {
  const seen = new Map<string, string>();
  for (const s of templateStrings(spec)) {
    for (const m of s.matchAll(PLACEHOLDER)) {
      const f = m[1];
      if (f && !seen.has(f.toLowerCase())) seen.set(f.toLowerCase(), f);
    }
  }
  return [...seen.values()];
}

/**
 * A copy of the spec with every {{field}} replaced by the row's value (field names matched
 * case-insensitively, values trimmed). Unknown fields become "". Never mutates the input.
 */
export function fillTemplate(spec: PlateSpecInput, row: Record<string, string>): PlateSpecInput {
  const fill = filler(row);
  const out = structuredClone(spec) as PlateSpecInput & { name?: unknown; title?: unknown };
  if (typeof out.name === "string") out.name = fill(out.name);
  if (typeof out.title === "string") out.title = fill(out.title);
  if (out.texts) out.texts = out.texts.map((t) => ({ ...t, content: fill(t.content) }));
  return out;
}

function filler(row: Record<string, string>) {
  const lookup = new Map(Object.entries(row).map(([k, v]) => [k.trim().toLowerCase(), String(v ?? "").trim()]));
  return (s: string) => s.replace(PLACEHOLDER, (_m, f: string) => lookup.get(f.toLowerCase()) ?? "");
}

export interface BatchItem {
  index: number;
  row: Record<string, string>;
  fileName: string;
  result: GenerateResult;
}

export interface BatchResult {
  items: BatchItem[];
  /** Items with `result.ok`. */
  ok: number;
  failed: number;
  /** Sum of the estimated machine time of the items that are ok (the ones you will actually run). */
  totalTimeSec: number;
}

/** Safe ASCII file-name piece: accents removed, lowercase, [a-z0-9-] only, at most 40 chars. */
export function slug(value: string): string {
  const s = value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return s || "sign";
}

const MAX_TEXT = 60;

/**
 * Generates one sign per row. Each item is a normal generatePlate result, so a row that fails
 * (e.g. a name too long to fit → TEXT_DOES_NOT_FIT) fails alone and the rest still generate.
 * - A text whose content is empty after filling (e.g. an optional second line) is left out.
 * - A text longer than the schema allows (60 characters) fails that row with TEXT_DOES_NOT_FIT;
 *   any other schema error fails it with INVALID_SPEC. Nothing throws for a bad row.
 * - fileName: `001-<slug>.nc`, the slug coming from `fileNameField` (or the first template field).
 * - `title` (if given) is filled with the row too, so each file's header names its sign.
 * Synchronous and pure; `onProgress(done, total)` is called after each row.
 */
export function generateBatch(
  spec: PlateSpecInput,
  rows: Record<string, string>[],
  options: GenerateOptions & { fileNameField?: string; onProgress?(done: number, total: number): void },
): BatchResult {
  const { fileNameField, onProgress, ...genOptions } = options;
  const nameField = fileNameField ?? templateFields(spec)[0];
  const items: BatchItem[] = [];
  let ok = 0;
  let totalTimeSec = 0;
  rows.forEach((row, index) => {
    const filled = fillTemplate(spec, row);
    // Original index of each text that is kept, so warnings point at the template's text.
    const kept = (filled.texts ?? []).map((t, k) => ({ t, k })).filter(({ t }) => t.content.trim() !== "");
    if (filled.texts) filled.texts = kept.map(({ t }) => t);
    const rowOptions = genOptions.title ? { ...genOptions, title: filler(row)(genOptions.title) } : genOptions;
    const value = nameField ? (Object.entries(row).find(([k]) => k.trim().toLowerCase() === nameField.toLowerCase())?.[1] ?? "") : "";
    const fileName = `${String(index + 1).padStart(3, "0")}-${slug(value)}.nc`;

    let result: GenerateResult;
    const tooLong = kept.find(({ t }) => t.content.length > MAX_TEXT);
    const parsed = PlateSpecSchema.safeParse(filled);
    if (tooLong) {
      const t = tooLong.t;
      result = invalidSpecResult(filled, rowOptions, [
        {
          code: "TEXT_DOES_NOT_FIT",
          severity: "error",
          message: `"${t.content}" has ${t.content.length} characters; a text can have at most ${MAX_TEXT}.`,
          suggestion: "Shorten this row's value or split it into two lines.",
          element: { type: "text", index: tooLong.k },
        },
      ]);
    } else if (!parsed.success) {
      result = invalidSpecResult(filled, rowOptions, [schemaWarning(parsed.error)]);
    } else {
      result = generatePlate(filled, rowOptions);
    }
    if (result.ok) {
      ok++;
      totalTimeSec += result.verification?.stats.estimatedTimeSec ?? 0;
    }
    items.push({ index, row, fileName, result });
    onProgress?.(index + 1, rows.length);
  });
  return { items, ok, failed: items.length - ok, totalTimeSec };
}

function schemaWarning(e: { issues: { path: PropertyKey[]; message: string }[] }): Warning {
  const first = e.issues[0];
  return {
    code: "INVALID_SPEC",
    severity: "error",
    message: `This row makes an invalid sign: ${first ? `${first.path.map(String).join(".") || "spec"}: ${first.message}` : "unknown error"}.`,
    suggestion: "Check this row's values.",
  };
}
