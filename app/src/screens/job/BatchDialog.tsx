import { parseCsv, slug, templateFields, type GenerateResult } from "@carvcam/cam-engine";
import { AlertTriangle, Check, Download, FileUp, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ProBadge, useProGate } from "../../account/ProGate";
import { Issue } from "../../components/ui";
import { engineOptions, runBatch, runEngine } from "../../engine/useEngine";
import type { BatchDone } from "../../engine/protocol";
import { fillRow, mapPlaceholders, okTime, sampleCsv, unusedColumns } from "../../lib/batch";
import { materialById } from "../../lib/catalog";
import { useDesign } from "../../state/design";
import { applyCorrection } from "../create/elements";
import type { BatchRow } from "../../lib/batch";
import { toast } from "../../state/ui";
import { ToolpathOverlay, useSegments } from "../../stage/Board";
import { CostPanel } from "./CostPanel";
import type { JobCtx } from "./Job";
import { fmtMin } from "./jobUtil";
import { JobModal } from "./Modal";

const MAX_ROWS = 500;

/** Small top view of one row's sign. */
function Thumb({ result, label, face }: { result: GenerateResult | null | undefined; label: string; face: string }) {
  const segs = useSegments(result?.gcode);
  const st = result?.layout.stock;
  const W = 150;
  const s = st ? Math.min(W / st.width, 96 / st.height) : 1;
  const err = result && !result.ok ? (result.warnings.find((w) => w.severity === "error")?.message ?? "Doesn't generate") : null;
  return (
    <div className="bthumb">
      <div className="bthumb__view">
        {result === undefined ? (
          <span className="tiny muted">Generating…</span>
        ) : st ? (
          <div style={{ position: "relative", width: st.width * s, height: st.height * s, background: face, boxShadow: "0 8px 18px rgba(0,0,0,.35)" }}>
            <ToolpathOverlay segments={segs} width={st.width} height={st.height} scale={s} opacity={0.8} />
          </div>
        ) : (
          <span className="tiny muted">No preview</span>
        )}
      </div>
      <div className="bthumb__label" title={label}>
        {err ? <XCircle size={13} color="var(--alarm-text)" strokeWidth={2} /> : result ? <Check size={13} color="var(--ready-text)" strokeWidth={2.2} /> : null}
        <span>{label}</span>
      </div>
      {err ? <div className="bthumb__err">{err}</div> : null}
    </div>
  );
}

/**
 * Batch from CSV (Pro feature "batch"): one .nc per row with {{placeholders}} filled in.
 * Anyone can open it, paste a CSV and see the previews; generating and downloading ask for Pro.
 */
export function BatchDialog({ ctx, onClose }: { ctx: JobCtx; onClose(): void }) {
  const nav = useNavigate();
  const gate = useProGate("batch");
  const { design, machine, headId, preset } = ctx;
  const fields = useMemo(() => templateFields(design.spec), [design.spec]);
  const [text, setText] = useState("");
  const [nameField, setNameField] = useState<string>("");
  const [thumbs, setThumbs] = useState<(GenerateResult | null | undefined)[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [out, setOut] = useState<BatchDone | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const csv = useMemo(() => parseCsv(text), [text]);
  const rows = csv.rows.slice(0, MAX_ROWS);
  const map = mapPlaceholders(fields, csv.headers);
  const missing = map.filter((m) => !m.column);
  const extra = unusedColumns(fields, csv.headers);
  const fileField = nameField || map.find((m) => m.column)?.column || csv.headers[0] || "";
  const options = useMemo(() => engineOptions(design, machine.id, headId, preset), [design, machine.id, headId, preset]);
  const face = materialById(design.material).face;

  // Preview: the first three rows, generated like the batch will (without simulation).
  const previewKey = JSON.stringify([rows.slice(0, 3), design.spec, options]);
  useEffect(() => {
    if (!rows.length || !fields.length) return setThumbs([]);
    let alive = true;
    const first = rows.slice(0, 3);
    setThumbs(first.map(() => undefined));
    const t = setTimeout(() => {
      first.forEach((row, i) =>
        runEngine(fillRow(design.spec, row), options, false).then((r) => {
          if (alive) setThumbs((th) => th.map((x, k) => (k === i ? r.result : x)));
        }),
      );
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey]);

  // A new CSV invalidates the results.
  useEffect(() => setOut(null), [text, nameField]);

  const generate = async () => {
    if (!gate.allowed) return gate.ask();
    setOut(null);
    setProgress({ done: 0, total: rows.length });
    const r = await runBatch({ spec: design.spec, rows, headers: csv.headers, options, fileNameField: fileField || undefined, zip: true }, (done, total) => setProgress({ done, total }));
    setProgress(null);
    if (!r.ok) toast(`Batch failed: ${r.error}`);
    setOut(r);
  };

  const download = () => {
    if (!gate.allowed) return gate.ask();
    if (!out?.zip) return;
    const url = URL.createObjectURL(new Blob([out.zip as BlobPart], { type: "application/zip" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${slug(design.name)}-batch.zip` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const onFile = async (f: File | null | undefined) => {
    if (!f) return;
    setText(await f.text());
  };

  const busy = !!progress;
  const textRef = useRef<HTMLTextAreaElement>(null);

  /** A failed row's way out: the engine's fix applied to the template (every row gets it). */
  const fixFor = (r: BatchRow) => {
    if (!r.fix) return null;
    const f = r.fix;
    const cur = (design.spec as unknown as Record<string, Record<string, unknown>[] | undefined>)[`${f.element.type}s`]?.[f.element.index]?.[f.field];
    const what = f.field === "size" ? `Make that text ${f.value} mm for every row` : f.field === "width" ? `Make it ${f.value} mm wide for every row` : `Set ${f.field} to ${f.value} for every row`;
    return { label: typeof cur === "number" && cur === f.value ? null : what, spec: applyCorrection(design.spec, f.element, f.field, f.value) };
  };
  /** Selects the row's line in the CSV so the user can shorten or correct it. */
  const editRow = (r: BatchRow) => {
    const ta = textRef.current;
    if (!ta) return;
    const lines = text.split(/\r?\n/);
    const line = r.index + 1;
    const start = lines.slice(0, line).reduce((n, l) => n + l.length + 1, 0);
    ta.focus();
    ta.setSelectionRange(start, start + (lines[line]?.length ?? 0));
    ta.scrollIntoView({ block: "center", behavior: "smooth" });
  };
  const okRows = out?.rows.filter((r) => r.ok) ?? [];

  return (
    <JobModal
      label="Batch from CSV"
      eyebrow={
        <>
          <ProBadge /> One file per row
        </>
      }
      title="Batch from CSV"
      onClose={onClose}
      wide
      foot={
        <>
          <span className="job-fine">{rows.length ? `${rows.length} row${rows.length > 1 ? "s" : ""}${csv.rows.length > MAX_ROWS ? ` (first ${MAX_ROWS})` : ""}` : "Paste or open a CSV to start"}</span>
          {out?.zip ? (
            <button className="btn btn--outline btn--sm" onClick={download} style={{ gap: 6 }}>
              <Download size={15} strokeWidth={1.75} />
              Download ZIP
            </button>
          ) : null}
          <button className="btn btn--primary btn--sm" disabled={!rows.length || !fields.length || busy} onClick={generate}>
            {busy ? `Generating ${progress!.done} / ${progress!.total}…` : `Generate ${rows.length || ""} file${rows.length === 1 ? "" : "s"}`}
          </button>
        </>
      }
    >
      <div className="batch-intro">
        <div className="job-body">
          Type <code className="batch-code">{"{{name}}"}</code> in any text in Create. Each CSV row makes one sign with its values filled in, and you get one .nc file per row.
        </div>
        <div className="batch-fields">
          <span className="job-label">Placeholders in this design</span>
          {fields.length ? (
            fields.map((f) => {
              const m = map.find((x) => x.field === f);
              const ok = !csv.headers.length || !!m?.column;
              return (
                <span key={f} className={`batch-chip${csv.headers.length ? (ok ? " batch-chip--ok" : " batch-chip--miss") : ""}`}>
                  {`{{${f}}}`}
                  {csv.headers.length ? ok ? <Check size={12} strokeWidth={2.4} /> : <XCircle size={12} strokeWidth={2} /> : null}
                </span>
              );
            })
          ) : (
            <span className="tiny muted">None yet</span>
          )}
        </div>
      </div>

      {!fields.length ? (
        <Issue
          kind="info"
          eyebrow="Add a placeholder first"
          title="This design has no {{placeholders}} yet"
          body={'Edit a text in Create and type, for example, "Welcome {{name}}". Then come back here with your list.'}
          actions={
            <button className="btn btn--light btn--sm" onClick={() => nav("/create")}>
              Back to Create
            </button>
          }
        />
      ) : null}

      <div className="batch-csv">
        <div className="batch-csv__head">
          <span className="job-label">CSV · first line = column names</span>
          <span style={{ display: "flex", gap: 8 }}>
            <button className="link" style={{ color: "var(--text-2)" }} onClick={() => setText(sampleCsv(fields))}>
              Use an example
            </button>
            <button className="btn btn--outline btn--sm" onClick={() => fileRef.current?.click()} style={{ gap: 6 }}>
              <FileUp size={15} strokeWidth={1.75} />
              Open CSV
            </button>
          </span>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
        <textarea
          ref={textRef}
          className="batch-text mono"
          value={text}
          spellCheck={false}
          placeholder={`${fields[0] ?? "name"}\nAna\nLeo\nMia`}
          onChange={(e) => setText(e.target.value)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            onFile(e.dataTransfer.files?.[0]);
          }}
          aria-label="CSV text"
        />
        {csv.headers.length ? (
          <div className="batch-cols">
            <span className="tiny muted">Columns:</span>
            {csv.headers.map((h) => (
              <span key={h} className={`batch-col${extra.includes(h) ? " batch-col--unused" : ""}`}>
                {h}
              </span>
            ))}
            <label className="batch-filename tiny">
              File names from
              <select value={fileField} onChange={(e) => setNameField(e.target.value)}>
                {csv.headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
        {missing.length && csv.headers.length ? (
          <div role="status" className="job-warn">
            <AlertTriangle size={16} color="var(--paused)" strokeWidth={1.75} />
            <span>
              <b>No column for {missing.map((m) => `{{${m.field}}}`).join(", ")}.</b> Those texts come out empty{extra.length ? `. Unused columns: ${extra.join(", ")}` : ""}.
            </span>
          </div>
        ) : null}
      </div>

      {rows.length && fields.length ? (
        <div className="batch-preview">
          <span className="job-label">Preview · first {Math.min(3, rows.length)} rows</span>
          <div className="batch-thumbs">
            {rows.slice(0, 3).map((row, i) => (
              <Thumb key={i} result={thumbs[i]} face={face} label={`${i + 1}. ${(map.find((m) => m.column)?.column ? row[map.find((m) => m.column)!.column!] : Object.values(row)[0]) || "(empty)"}`} />
            ))}
          </div>
        </div>
      ) : null}

      {busy ? (
        <div className="batch-progress">
          <div className="bar">
            <div className="bar__fill" style={{ width: `${(100 * progress!.done) / Math.max(1, progress!.total)}%` }} />
          </div>
          <span className="mono tiny muted">
            {progress!.done} / {progress!.total}
          </span>
        </div>
      ) : null}

      {out?.ok ? (
        <div className="batch-results">
          <div className="batch-results__head">
            <span className="job-label">Results</span>
            <span className="tiny">
              <span style={{ color: "var(--ready-text)" }}>{out.okCount} ok</span>
              {out.failed ? <span style={{ color: "var(--alarm-text)" }}> · {out.failed} failed</span> : null}
              <span className="muted"> · {fmtMin(okTime(out.rows) / 60)} machine time</span>
            </span>
          </div>
          <div className="batch-list">
            {out.rows.map((r) => (
              <div key={r.index} className={`batch-item${r.ok ? "" : " batch-item--bad"}`}>
                <span className="job-op__n">{r.index + 1}</span>
                {r.ok ? <Check size={14} color="var(--ready-text)" strokeWidth={2.4} /> : <XCircle size={14} color="var(--alarm-text)" strokeWidth={2} />}
                <span className="batch-item__main">
                  <span className="batch-item__file mono">{r.ok ? r.fileName : Object.values(r.row).join(" · ")}</span>
                  {r.message ? <span className={r.ok ? "batch-item__msg" : "batch-item__msg batch-item__msg--bad"}>{r.message}</span> : null}
                  {!r.ok ? (
                    <span className="batch-item__fix">
                      {(() => {
                        const f = fixFor(r);
                        return f?.label ? (
                          <button
                            className="btn btn--light btn--sm"
                            onClick={() => {
                              useDesign.getState().patchSpec(() => f.spec);
                              toast("Template updated. Generate again to redo the failed rows.");
                            }}
                          >
                            {f.label}
                          </button>
                        ) : null;
                      })()}
                      <button className="btn btn--outline btn--sm" onClick={() => editRow(r)}>
                        Edit this row
                      </button>
                      <button className="btn btn--outline btn--sm" onClick={() => nav("/create")}>
                        Open the design
                      </button>
                    </span>
                  ) : null}
                </span>
                <span className="job-op__time">{r.ok ? fmtMin(r.timeSec / 60) : "—"}</span>
              </div>
            ))}
          </div>
          {okRows.length ? <CostPanel ctx={ctx} title="Cost for this batch" quantity={okRows.length} timeSec={okTime(out.rows) / okRows.length} /> : null}
        </div>
      ) : null}
      {gate.dialog}
    </JobModal>
  );
}
