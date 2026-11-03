import { fillTemplate, type BatchItem, type PlateSpecInput } from "@carvcam/cam-engine";

/**
 * Batch from CSV, the UI side (pure, tested): which placeholders a CSV covers, the specs for the
 * preview thumbnails, the light result list sent back by the worker and the ZIP's summary.csv.
 */

export interface FieldMap {
  field: string;
  /** CSV column that fills it (matched ignoring case and spaces), or null when missing. */
  column: string | null;
}

const norm = (s: string) => s.trim().toLowerCase();

export function mapPlaceholders(fields: string[], headers: string[]): FieldMap[] {
  return fields.map((field) => ({ field, column: headers.find((h) => norm(h) === norm(field)) ?? null }));
}

/** Columns the template doesn't use (shown so the user can spot a typo like {{nmae}}). */
export function unusedColumns(fields: string[], headers: string[]) {
  const f = new Set(fields.map(norm));
  return headers.filter((h) => !f.has(norm(h)));
}

/** The sign a row makes, as generateBatch builds it: placeholders filled, empty texts left out. */
export function fillRow(spec: PlateSpecInput, row: Record<string, string>): PlateSpecInput {
  const filled = fillTemplate(spec, row);
  if (filled.texts) filled.texts = filled.texts.filter((t) => t.content.trim() !== "");
  return filled;
}

/** One batch row as the UI needs it (no layout, no G-code). */
export interface BatchRow {
  index: number;
  row: Record<string, string>;
  fileName: string;
  ok: boolean;
  /** Why it failed (first error), or the first warning when ok. */
  message?: string;
  timeSec: number;
  /** Code of the first error, and the engine's one-click fix for it (applies to the template, so every row gets it). */
  code?: string;
  fix?: { element: { type: "text" | "icon" | "shape" | "svg" | "hole" | "slot"; index: number }; field: string; value: number };
}

export function toBatchRow(item: BatchItem): BatchRow {
  const r = item.result;
  const first = r.warnings.find((w) => w.severity === "error");
  const err = first?.message ?? r.verification?.problems.find((p) => p.severity === "error")?.message;
  const warn = r.warnings.find((w) => w.severity === "warning")?.message;
  return {
    index: item.index,
    row: item.row,
    fileName: item.fileName,
    ok: r.ok,
    message: r.ok ? warn : (err ?? "This row could not be generated."),
    timeSec: r.ok ? Math.round(r.verification?.stats.estimatedTimeSec ?? 0) : 0,
    ...(!r.ok && first ? { code: first.code, ...(first.fix ? { fix: first.fix } : {}) } : {}),
  };
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** summary.csv: one line per row: file, status, minutes, message, then the row's own columns. */
export function batchSummaryCsv(rows: BatchRow[], headers: string[]): string {
  const head = ["file", "status", "machine_min", "message", ...headers];
  const lines = rows.map((r) => [r.ok ? r.fileName : "", r.ok ? "ok" : "failed", r.ok ? (r.timeSec / 60).toFixed(1) : "", r.message ?? "", ...headers.map((h) => r.row[h] ?? "")].map(csvCell).join(","));
  return [head.map(csvCell).join(","), ...lines].join("\r\n") + "\r\n";
}

/** Total machine time of the rows that are ok, seconds. */
export const okTime = (rows: BatchRow[]) => rows.reduce((a, r) => a + (r.ok ? r.timeSec : 0), 0);

/** A small CSV to start from, built from the template's placeholders. */
export function sampleCsv(fields: string[]) {
  const f = fields.length ? fields : ["name"];
  const names = ["Ana", "Leo", "Mia"];
  return [f.join(","), ...names.map((n) => f.map((_, k) => (k === 0 ? n : "")).join(","))].join("\n");
}
