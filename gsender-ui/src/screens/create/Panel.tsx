import type { PlateSpecInput } from "@gsender-next/cam-engine";
import { AlertCircle, AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, Circle, Copy, Eye, EyeOff, Heart, Layers, Minus, MoveVertical, Plus, Square, Trash2, Type, XCircle } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Issue, Seg, Stepper, VideoCard } from "../../components/ui";
import { BITS, bitById, compat, materialById, MATERIALS } from "../../lib/catalog";
import { useDesign } from "../../state/design";
import { toast } from "../../state/ui";
import { useActiveMachine, useWorkshop } from "../../state/workshop";
import { addElement, FONTS, ICONS, listElements, parseId, type Box, type ElementId, type ElementRow, type Forma, type Texto } from "./elements";
import type { IssueAction, UiIssue } from "./issues";

type Modo = "relevo" | "gravado" | "recorte";

interface Props {
  issues: UiIssue[];
  errors: number;
  warnings: number;
  busy: boolean;
  engineError: string | null;
  sel: ElementId | null;
  setSel(id: ElementId | null): void;
  boxes: Map<ElementId, Box>;
  focusKey: string | null;
  setFocusKey(k: string | null): void;
  onDuplicate(id: ElementId): void;
  onDelete(id: ElementId): void;
}

/** Painel à direita da tela Create: material, fresa, problemas, forma e elementos. */
export function CreatePanel(p: Props) {
  const nav = useNavigate();
  const { design, patch, patchSpec, setMaterial, newBlank } = useDesign();
  const spec = design.spec;
  const material = materialById(design.material);
  const bit = bitById(design.bit);
  const rows = listElements(spec);
  const selRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    selRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [p.sel]);

  const run = (a: IssueAction) => {
    if (a.kind === "spec") {
      patchSpec(() => a.spec);
      toast(`${a.label === "Apply suggestion" ? "Suggestion applied" : a.label}. Re-checking…`);
    } else if (a.kind === "bit") {
      patch({ bit: a.bit });
      toast(`Switched to the ${bitById(a.bit)?.name ?? "new"} bit.`);
    } else window.open(a.url, "_blank", "noopener");
  };

  const status = p.errors ? (
    <>
      <XCircle size={15} strokeWidth={1.75} color="var(--alarm-text)" />
      {p.errors} error{p.errors > 1 ? "s" : ""} · {p.warnings} warning{p.warnings === 1 ? "" : "s"}
    </>
  ) : p.warnings ? (
    <>
      <CheckCircle2 size={15} strokeWidth={1.75} color="var(--ready-text)" />
      Ready · {p.warnings} warning{p.warnings === 1 ? "" : "s"}
    </>
  ) : (
    <>
      <CheckCircle2 size={15} strokeWidth={1.75} color="var(--ready-text)" />
      Ready to carve
    </>
  );

  const sign = spec.tipo !== "letreiro";

  return (
    <aside className="sidepanel create-panel" aria-label="Design">
      <div className="create-panel__head">
        <div className="create-panel__titlerow">
          <input className="create-panel__name" value={design.name} aria-label="Design name" onChange={(e) => patch({ name: e.target.value })} />
          <button
            className="btn btn--outline btn--sm"
            onClick={() => {
              newBlank();
              p.setSel(null);
              toast("Blank board ready. Pick the wood and add text or shapes.");
            }}
          >
            <Plus size={14} strokeWidth={1.75} />
            Blank board
          </button>
        </div>
        <Chips material={material.id} thickness={spec.espessura} bitId={design.bit} onMaterial={(id) => setMaterial(id)} onThickness={(t) => setMaterial(material.id, t)} onBit={(id) => patch({ bit: id })} />
        <div className="create-status" aria-live="polite">
          {status}
          <span className="muted">· {p.busy ? "re-checking…" : "re-checked on every change"}</span>
        </div>
        <VideoCard id="create-design" />
      </div>

      <div className="sidepanel__body create-panel__body">
        {p.engineError ? <Issue kind="error" eyebrow="Error · blocks Continue" title="This design couldn't be checked" body={p.engineError} /> : null}
        {spec.texto?.length === 0 && !spec.formas?.length && !spec.icones?.length && !spec.furos?.length ? (
          <div className="create-blankmsg">
            Blank {spec.espessura} mm {material.id} board, {spec.largura} × {spec.altura} mm. Pick the wood and thickness above, then add text, shapes or lines with the tools on the left.
          </div>
        ) : null}
        {p.issues.map((i) => (
          <IssueCard key={i.key} issue={i} focused={p.focusKey === i.key} onFocus={() => p.setFocusKey(p.focusKey === i.key ? null : i.key)} onRun={run} onSelect={() => i.target && p.setSel(i.target)} />
        ))}

        <ShapeSection spec={spec} patchSpec={patchSpec} />

        <section className="create-section">
          <div className="create-section__head">
            <h3>
              Elements <span className="muted">{rows.length}</span>
            </h3>
            <span className="tiny muted">Click to edit · same as on the board</span>
          </div>
          {rows.length === 0 ? <div className="create-empty">Nothing on the board yet. Add text or a shape below, or pick a tool on the left and click on the board.</div> : null}
          {rows.map((r) => {
            const open = p.sel === r.id;
            const flagged = p.issues.find((i) => i.target === r.id);
            return (
              <div key={r.id} ref={open ? selRef : undefined} className={`create-row ${open ? "is-open" : ""}`}>
                <div className="create-row__head" role="button" tabIndex={0} aria-expanded={open} onClick={() => p.setSel(open ? null : r.id)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && p.setSel(open ? null : r.id)}>
                  <span className="create-row__icon">
                    <RowIcon row={r} spec={spec} />
                  </span>
                  <span className="create-row__text">
                    <span className="create-row__name">{r.name}</span>
                    <span className="tiny muted">{r.sub}</span>
                  </span>
                  {flagged ? flagged.level === "error" ? <AlertCircle size={16} color="var(--alarm-text)" /> : <AlertTriangle size={16} color="var(--paused)" /> : null}
                  {open ? (
                    <span className="create-row__tools" onClick={(e) => e.stopPropagation()}>
                      {r.kind !== "holes" ? (
                        <button aria-label="Duplicate" title="Duplicate (Ctrl+D)" onClick={() => p.onDuplicate(r.id)}>
                          <Copy size={14} />
                        </button>
                      ) : null}
                      <button aria-label="Delete" title="Delete (Del)" onClick={() => p.onDelete(r.id)}>
                        <Trash2 size={14} />
                      </button>
                      <button aria-label="Collapse" onClick={() => p.setSel(null)}>
                        <ChevronUp size={14} />
                      </button>
                    </span>
                  ) : (
                    <ChevronRight size={16} color="var(--text-3)" />
                  )}
                </div>
                {open ? <Inspector id={r.id} spec={spec} patchSpec={patchSpec} sign={sign} /> : null}
              </div>
            );
          })}
          <AddChips spec={spec} onAdd={(next, id) => {
            patchSpec(() => next);
            if (id) p.setSel(id);
          }} />
        </section>
      </div>

      <div className="sidepanel__foot">
        {p.errors ? (
          <div className="sidepanel__hint">
            <AlertCircle size={15} strokeWidth={1.75} color="var(--alarm-text)" />
            Fix {p.errors} error{p.errors > 1 ? "s" : ""} to continue.
          </div>
        ) : (
          <div className="sidepanel__hint">
            Checked for a {bit?.name ?? "bit"} bit in {spec.espessura} mm {material.id}.
          </div>
        )}
        <button className="btn btn--primary btn--lg" disabled={p.errors > 0 || p.busy && !!p.engineError} onClick={() => nav("/prepare")}>
          Continue to Prepare
          {p.errors ? null : <ArrowRight size={18} strokeWidth={2} />}
        </button>
      </div>
    </aside>
  );
}

// ------------------------------------------------------------------ chips

function Chips(props: { material: string; thickness: number; bitId: string; onMaterial(id: string): void; onThickness(t: number): void; onBit(id: string): void }) {
  const [open, setOpen] = useState<null | "material" | "thick" | "bit">(null);
  const ref = useRef<HTMLDivElement>(null);
  const { bits } = useWorkshop();
  const { headId } = useActiveMachine();
  const m = materialById(props.material);
  const bit = bitById(props.bitId);
  const usable = BITS.filter((b) => bits.includes(b.id) && !b.notForSigns && b.profile !== "surfacing").map((b) => ({ b, c: compat(b, headId) })).filter((x) => x.c.level !== "no");

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(null);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  const chip = (id: "material" | "thick" | "bit", label: ReactNode, icon: ReactNode, cls = "") => (
    <button className={`create-chip ${cls}`} aria-haspopup="listbox" aria-expanded={open === id} onClick={() => setOpen(open === id ? null : id)}>
      {icon}
      <span className="create-chip__label">{label}</span>
      <ChevronDown size={14} color="var(--text-3)" />
    </button>
  );

  return (
    <div className="create-chips" ref={ref}>
      {chip("material", m.id, <Layers size={15} strokeWidth={1.6} color="var(--text-3)" />, "create-chip--material")}
      {chip("thick", <span className="create-chip__thick mono"><b>{props.thickness}</b><small>mm</small></span>, <MoveVertical size={15} strokeWidth={1.6} color="var(--text-3)" />, "create-chip--thick")}
      {chip("bit", bit?.name ?? "Pick a bit", <span className="create-chip__bitdot" />, "create-chip--bit")}
      {open ? (
        <div className="popover create-chips__pop" role="listbox" aria-label={open === "material" ? "Material" : open === "thick" ? "Thickness" : "Bit"}>
          {open === "material"
            ? MATERIALS.map((x) => (
                <button key={x.id} role="option" className="menu-item" aria-checked={x.id === m.id} aria-selected={x.id === m.id} onClick={() => (props.onMaterial(x.id), setOpen(null))}>
                  <span className="create-swatch" style={{ background: x.face }} />
                  <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span>{x.id}</span>
                    <span className="tiny muted">{x.sub}</span>
                  </span>
                </button>
              ))
            : null}
          {open === "thick"
            ? m.thick.map((t) => (
                <button key={t} role="option" className="menu-item mono" aria-checked={t === props.thickness} aria-selected={t === props.thickness} onClick={() => (props.onThickness(t), setOpen(null))}>
                  {t} mm
                </button>
              ))
            : null}
          {open === "bit" ? (
            <>
              <div className="tiny muted" style={{ padding: "6px 12px" }}>
                My bits that fit your machine and carve signs
              </div>
              {usable.map(({ b, c }) => (
                <button key={b.id} role="option" className="menu-item" aria-checked={b.id === props.bitId} aria-selected={b.id === props.bitId} onClick={() => (props.onBit(b.id), setOpen(null))}>
                  <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span>{b.name}</span>
                    <span className="tiny muted">{b.use}</span>
                    {c.level === "accessory" ? <span className="tiny" style={{ color: "var(--paused)" }}>{c.label}</span> : null}
                  </span>
                </button>
              ))}
              {usable.length === 0 ? <div className="tiny muted" style={{ padding: 12 }}>None of your bits fit. Add bits in My bits.</div> : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ issues

function IssueCard({ issue: i, focused, onFocus, onRun, onSelect }: { issue: UiIssue; focused: boolean; onFocus(): void; onRun(a: IssueAction): void; onSelect(): void }) {
  const eyebrow = i.level === "error" ? "Error · blocks Continue" : i.level === "warning" ? "Warning · you can continue" : "Note";
  const actions = (
    <>
      {i.apply ? (
        <button className="btn btn--light btn--sm" onClick={() => onRun(i.apply!)}>
          {i.apply.label}
        </button>
      ) : null}
      {i.alts.map((a) => (
        <button key={a.label} className="btn btn--outline btn--sm" onClick={() => onRun(a)}>
          {a.label}
        </button>
      ))}
      {i.level !== "error" && i.target ? (
        <button className="btn btn--outline btn--sm" aria-pressed={focused} onClick={onFocus}>
          {focused ? <EyeOff size={14} /> : <Eye size={14} />}
          {focused ? "Hide on preview" : "Show on preview"}
        </button>
      ) : null}
    </>
  );
  const hasActions = !!i.apply || i.alts.length > 0 || (i.level !== "error" && !!i.target);
  return (
    <div className={`create-issue create-issue--${i.level}`} onClick={(e) => (e.target as HTMLElement).closest("button") || onSelect()}>
      <Issue kind={i.level} eyebrow={eyebrow} title={i.title} body={i.detail || undefined} fix={i.suggestion} actions={hasActions ? actions : undefined} />
    </div>
  );
}

// ------------------------------------------------------------------ shape

function ShapeSection({ spec, patchSpec }: { spec: PlateSpecInput; patchSpec(fn: (s: PlateSpecInput) => PlateSpecInput): void }) {
  const [open, setOpen] = useState(false);
  const edge = spec.borda?.tipo ?? "reta";
  const set = (fn: (s: PlateSpecInput) => PlateSpecInput) => patchSpec(fn);
  return (
    <section className="create-section create-shape">
      <button className="create-section__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <h3>Shape</h3>
        <span className="tiny muted">
          {spec.tipo === "letreiro" ? "Cut-out lettering" : "Sign"} · {spec.largura} × {spec.altura} mm
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open ? (
        <div className="create-fields">
          <Field label="Type">
            <Seg<"placa" | "letreiro">
              label="Type"
              value={spec.tipo ?? "placa"}
              onChange={(t) =>
                set((s) => ({
                  ...s,
                  tipo: t,
                  texto: s.texto?.map((x) => ({ ...x, modo: t === "letreiro" ? "recorte" : x.modo === "recorte" ? "relevo" : x.modo })),
                }))
              }
              options={[
                ["placa", "Sign"],
                ["letreiro", "Cut-out lettering"],
              ]}
            />
          </Field>
          <div className="create-two">
            <Field label="Width">
              <Stepper label="Width" value={spec.largura} step={5} min={30} max={1200} unit="mm" onChange={(v) => set((s) => ({ ...s, largura: v }))} />
            </Field>
            <Field label="Height">
              <Stepper label="Height" value={spec.altura} step={5} min={20} max={1200} unit="mm" onChange={(v) => set((s) => ({ ...s, altura: v }))} />
            </Field>
          </div>
          {spec.tipo !== "letreiro" ? (
            <>
              <Field label="Edge">
                <Seg<"reta" | "arredondada" | "chanfrada">
                  label="Edge"
                  value={edge}
                  onChange={(t) => set((s) => ({ ...s, borda: { tipo: t, raio: t === "reta" ? 0 : s.borda?.raio || 8 } }))}
                  options={[
                    ["reta", "Straight"],
                    ["arredondada", "Rounded"],
                    ["chanfrada", "Chamfered"],
                  ]}
                />
              </Field>
              {edge !== "reta" ? (
                <Slider label="Corner radius" value={spec.borda?.raio ?? 8} min={2} max={30} step={1} onChange={(v) => set((s) => ({ ...s, borda: { tipo: edge, raio: v } }))} />
              ) : null}
              <label className="create-check">
                <input type="checkbox" checked={(spec.moldura ?? 6) > 0} onChange={(e) => set((s) => ({ ...s, moldura: e.target.checked ? 6 : 0 }))} />
                Frame <span className="muted">raised border 6 mm in</span>
              </label>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

// ------------------------------------------------------------------ inspector

function Field({ label, children, aside }: { label: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="create-field">
      <div className="create-field__label">
        <span>{label}</span>
        {aside}
      </div>
      {children}
    </div>
  );
}

function Slider(props: { label: string; value: number; min: number; max: number; step: number; unit?: string; onChange(v: number): void }) {
  return (
    <Field label={props.label} aside={<span className="mono tiny">{props.value} {props.unit ?? "mm"}</span>}>
      <input className="create-range" type="range" aria-label={props.label} min={props.min} max={props.max} step={props.step} value={props.value} onChange={(e) => props.onChange(Number(e.target.value))} />
    </Field>
  );
}

function ModeSeg({ value, sign, onChange, allowThrough = true }: { value: Modo; sign: boolean; onChange(m: Modo): void; allowThrough?: boolean }) {
  if (!sign) return <div className="tiny muted">Cut-out lettering: every element is cut all the way through.</div>;
  const opts: [Modo, string][] = [
    ["relevo", "Raised"],
    ["gravado", "Engraved"],
  ];
  if (allowThrough) opts.push(["recorte", "Cut through"]);
  return (
    <Field label="Style">
      <Seg<Modo> label="Style" value={value} onChange={onChange} options={opts} />
    </Field>
  );
}

function Inspector({ id, spec, patchSpec, sign }: { id: ElementId; spec: PlateSpecInput; patchSpec(fn: (s: PlateSpecInput) => PlateSpecInput): void; sign: boolean }) {
  const { kind, index } = parseId(id);
  if (kind === "t") {
    const t = spec.texto?.[index];
    if (!t) return null;
    const setT = (p: Partial<Texto>) => patchSpec((s) => ({ ...s, texto: s.texto?.map((x, i) => (i === index ? { ...x, ...p } : x)) }));
    const sample = (t.conteudo || "Ana").slice(0, 6);
    return (
      <div className="create-fields create-inspector">
        <Field label="Content">
          <input className="create-input" value={t.conteudo} maxLength={60} onChange={(e) => setT({ conteudo: e.target.value || " " })} />
        </Field>
        <Field label="Font" aside={<span className="tiny muted">Archivo Black is the easiest to carve</span>}>
          <div className="create-fonts" role="radiogroup" aria-label="Font">
            {FONTS.map((f) => (
              <button key={f.id} role="radio" aria-checked={(t.fonte ?? "archivo-black") === f.id} className="create-font" onClick={() => setT({ fonte: f.id })}>
                <span className="create-font__sample" style={{ fontFamily: f.css }}>
                  {sample}
                </span>
                <span className="create-font__name">{f.name}</span>
                <span className="create-font__tag">{f.tag}</span>
              </button>
            ))}
          </div>
        </Field>
        <Slider label="Letter height" value={t.tamanho} min={8} max={70} step={1} onChange={(v) => setT({ tamanho: v })} />
        <ModeSeg value={t.modo ?? "relevo"} sign={sign} onChange={(m) => setT({ modo: m })} />
        {sign && (t.modo ?? "relevo") !== "recorte" ? <Slider label="Depth" value={t.profundidade ?? 3} min={1} max={12} step={0.5} onChange={(v) => setT({ profundidade: v })} /> : null}
        <Field label="Position">
          <Seg<"auto" | "drag">
            label="Position"
            value={t.x === undefined ? "auto" : "drag"}
            onChange={(v) => {
              if (v === "auto") setT({ x: undefined, y: undefined });
              else toast("Drag the text on the preview to place it.");
            }}
            options={[
              ["auto", "Automatic"],
              ["drag", "Drag on preview"],
            ]}
          />
        </Field>
      </div>
    );
  }
  if (kind === "f") {
    const f = spec.formas?.[index];
    if (!f) return null;
    const setF = (p: Partial<Forma>) => patchSpec((s) => ({ ...s, formas: s.formas?.map((x, i) => (i === index ? ({ ...x, ...p } as Forma) : x)) }));
    const len = f.tipo === "linha" ? Math.round(Math.hypot(f.x2 - f.x, f.y2 - f.y)) : 0;
    const ang = f.tipo === "linha" ? Math.round((Math.atan2(f.y2 - f.y, f.x2 - f.x) * 180) / Math.PI) : 0;
    const setLine = (L: number, a: number) => {
      if (f.tipo !== "linha") return;
      const cx = (f.x + f.x2) / 2;
      const cy = (f.y + f.y2) / 2;
      const dx = (Math.cos((a * Math.PI) / 180) * L) / 2;
      const dy = (Math.sin((a * Math.PI) / 180) * L) / 2;
      const r = (v: number) => Math.round(v * 10) / 10;
      setF({ x: r(cx - dx), y: r(cy - dy), x2: r(cx + dx), y2: r(cy + dy) });
    };
    return (
      <div className="create-fields create-inspector">
        {f.tipo === "retangulo" ? (
          <div className="create-two">
            <Field label="Width">
              <Stepper label="Width" value={f.largura} step={2} min={4} max={1000} unit="mm" onChange={(v) => setF({ largura: v })} />
            </Field>
            <Field label="Height">
              <Stepper label="Height" value={f.altura} step={2} min={4} max={1000} unit="mm" onChange={(v) => setF({ altura: v })} />
            </Field>
          </div>
        ) : f.tipo === "circulo" ? (
          <Field label="Diameter">
            <Stepper label="Diameter" value={f.diametro} step={2} min={4} max={1000} unit="mm" onChange={(v) => setF({ diametro: v })} />
          </Field>
        ) : (
          <div className="create-two">
            <Field label="Length">
              <Stepper label="Length" value={len} step={5} min={5} max={1000} unit="mm" onChange={(v) => setLine(v, ang)} />
            </Field>
            <Field label="Angle">
              <Stepper label="Angle" value={ang} step={15} min={-180} max={180} unit="°" onChange={(v) => setLine(len, v)} />
            </Field>
          </div>
        )}
        <ModeSeg value={f.modo ?? "gravado"} sign={sign} onChange={(m) => setF({ modo: m })} allowThrough={f.tipo !== "linha"} />
        {sign && (f.modo ?? "gravado") !== "recorte" ? <Slider label="Depth" value={f.profundidade ?? 2} min={0.5} max={8} step={0.5} onChange={(v) => setF({ profundidade: v })} /> : null}
      </div>
    );
  }
  if (kind === "i") {
    const c = spec.icones?.[index];
    if (!c) return null;
    const setI = (p: Partial<typeof c>) => patchSpec((s) => ({ ...s, icones: s.icones?.map((x, i) => (i === index ? { ...x, ...p } : x)) }));
    return (
      <div className="create-fields create-inspector">
        <Field label="Icon">
          <Seg label="Icon" value={c.id} onChange={(v) => setI({ id: v })} options={ICONS.map((x) => [x.id, x.name] as [typeof c.id, string])} />
        </Field>
        <Slider label="Size" value={c.tamanho} min={10} max={40} step={1} onChange={(v) => setI({ tamanho: v })} />
        <ModeSeg value={c.modo ?? "relevo"} sign={sign} onChange={(m) => setI({ modo: m })} allowThrough={false} />
      </div>
    );
  }
  return <HolesInspector spec={spec} patchSpec={patchSpec} />;
}

function HolesInspector({ spec, patchSpec }: { spec: PlateSpecInput; patchSpec(fn: (s: PlateSpecInput) => PlateSpecInput): void }) {
  const kind = spec.rasgos?.length ? "slot" : spec.furos?.length ? "holes" : "none";
  const d = spec.furos?.[0]?.diametro ?? 5;
  return (
    <div className="create-fields create-inspector">
      <Field label="Holes">
        <Seg<"none" | "holes" | "slot">
          label="Holes"
          value={kind}
          onChange={(v) => patchSpec((s) => withHoles(s, v, d))}
          options={[
            ["none", "None"],
            ["holes", "2 holes"],
            ["slot", "Hanging slot"],
          ]}
        />
      </Field>
      {kind === "holes" ? (
        <Field label="Hole diameter">
          <Stepper label="Hole diameter" value={d} step={0.5} min={2} max={12} unit="mm" onChange={(v) => patchSpec((s) => ({ ...s, furos: s.furos?.map((f) => ({ ...f, diametro: v })) }))} />
        </Field>
      ) : null}
    </div>
  );
}

function withHoles(s: PlateSpecInput, v: "none" | "holes" | "slot", d = 5): PlateSpecInput {
  if (v === "none") return { ...s, furos: [], rasgos: [] };
  if (v === "holes")
    return {
      ...s,
      rasgos: [],
      furos: [
        { x: 14, y: s.altura - 14, diametro: d },
        { x: s.largura - 14, y: s.altura - 14, diametro: d },
      ],
    };
  return { ...s, furos: [], rasgos: [{ x: s.largura / 2, y: s.altura - 14, comprimento: 14, largura: 6, angulo: 0 }] };
}

function RowIcon({ row, spec }: { row: ElementRow; spec: PlateSpecInput }) {
  if (row.kind === "text") return <Type size={16} strokeWidth={1.5} />;
  if (row.kind === "icon") return <Heart size={16} strokeWidth={1.5} />;
  if (row.kind === "holes") return <Circle size={10} strokeWidth={2} />;
  const f = spec.formas?.[parseId(row.id).index];
  if (f?.tipo === "circulo") return <Circle size={16} strokeWidth={1.5} />;
  if (f?.tipo === "linha") return <Minus size={16} strokeWidth={1.5} />;
  return <Square size={16} strokeWidth={1.5} />;
}

function AddChips({ spec, onAdd }: { spec: PlateSpecInput; onAdd(s: PlateSpecInput, id: ElementId | null): void }) {
  const cx = spec.largura / 2;
  const cy = spec.altura / 2;
  const add = (t: "text" | "rect" | "circle" | "line") => {
    // Texto novo sem posição: o motor empilha e centraliza.
    if (t === "text") {
      const [s, id] = addElement(spec, "text", cx, cy);
      const last = s.texto!.length - 1;
      s.texto![last] = { ...s.texto![last], x: undefined, y: undefined };
      return onAdd(s, id);
    }
    const [s, id] = addElement(spec, t, cx, cy);
    onAdd(s, id);
  };
  const hasHoles = !!(spec.furos?.length || spec.rasgos?.length);
  return (
    <div className="create-add">
      <button className="create-add__chip" onClick={() => add("text")}>
        + Text
      </button>
      <button className="create-add__chip" onClick={() => add("rect")}>
        + Rectangle
      </button>
      <button className="create-add__chip" onClick={() => add("circle")}>
        + Circle
      </button>
      <button className="create-add__chip" onClick={() => add("line")}>
        + Line
      </button>
      {spec.tipo !== "letreiro" ? (
        <button
          className="create-add__chip"
          onClick={() => {
            const icons = spec.icones ?? [];
            onAdd({ ...spec, icones: [...icons, { id: "coracao", x: spec.largura - 22, y: 22, tamanho: 18, modo: "gravado", profundidade: 2 }] }, `i:${icons.length}`);
          }}
        >
          + Icon
        </button>
      ) : null}
      {spec.tipo !== "letreiro" && !hasHoles ? (
        <button className="create-add__chip" onClick={() => onAdd(withHoles(spec, "holes"), "holes")}>
          + Mounting holes
        </button>
      ) : null}
    </div>
  );
}
