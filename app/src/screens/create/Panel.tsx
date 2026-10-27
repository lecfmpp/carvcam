import type { PlateSpecInput } from "@carvcam/cam-engine";
import { AlertCircle, AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, Circle, Copy, FileUp, Heart, Hexagon, ImagePlus, Layers, Move, Wand2, Minus, MoveVertical, PenTool, Shapes, Square, Star, Trash2, Type, XCircle } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AccItem, Seg, Stepper, useSheet } from "../../components/ui";
import { BITS, bitById, compat, materialById, MATERIALS } from "../../lib/catalog";
import { useDesign } from "../../state/design";
import { toast } from "../../state/ui";
import { useActiveMachine, useWorkshop } from "../../state/workshop";
import { addElement, arcFromBend, bendOf, elementOf, FONTS, ICONS, idOfTarget, listElements, parseId, patchElement, refOf, type Target, type Box, type ElementId, type ElementRow, type Shape, type SvgEl, type Text, svgAspect } from "./elements";
import type { UiIssue } from "./issues";
import { useUi } from "../../state/ui";
import { importSvgFile, pickSvgFile } from "./svgImport";
import { TraceDialog } from "./traceDialog";
import { ProjectActions } from "./ProjectActions";
import { addLibraryElement, LibraryDialog } from "./libraryDialog";
import { tracingFromFile, useTracingUi } from "./tracing";
import type { TracingImage } from "../../state/design";

type Mode = "relief" | "engrave" | "cutout";

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

/** Panel on the right of the Create screen: material, bit, issues, shape and elements. */
export function CreatePanel(p: Props) {
  const nav = useNavigate();
  const { design, patch, patchSpec, setMaterial } = useDesign();
  const spec = design.spec;
  const material = materialById(design.material);
  const bit = bitById(design.bit);
  const rows = listElements(spec);
  const selRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    selRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [p.sel]);

  const sheet = useSheet();
  // One section open at a time, so the panel fits without scrolling. Selecting an element opens Elements;
  // "Pick another bit" (from a warning) opens Wood & bit.
  const [sec, setSec] = useState<"wood" | "shape" | "tracing" | "elements">("elements");
  const toggle = (k: typeof sec) => setSec(sec === k && k !== "elements" ? "elements" : k);
  useEffect(() => {
    if (p.sel) setSec("elements");
  }, [p.sel]);
  const bitMenuReq = useUi((s) => s.bitMenuReq);
  useEffect(() => {
    if (bitMenuReq > seenBitMenuReq) setSec("wood");
  }, [bitMenuReq]);

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

  const sign = spec.type !== "lettering";

  return (
    <aside className={`sidepanel create-panel ${sheet.cls}`} aria-label="Design">
      {sheet.handle}
      <div className="create-panel__head">
        <div className="create-panel__titlerow">
          <input className="create-panel__name" value={design.name} aria-label="Design name" onChange={(e) => patch({ name: e.target.value })} />
          <ProjectActions onReset={() => p.setSel(null)} />
        </div>
        <div className="create-status" aria-live="polite">
          {status}
          <span className="muted">· {p.busy ? "re-checking…" : "re-checked on every change"}</span>
        </div>
      </div>

      <div className="sidepanel__body create-panel__body">
        <AccItem n={1} title="Wood & bit" summary={`${material.id} · ${spec.thickness} mm · ${bit?.name ?? "pick a bit"}`} open={sec === "wood"} onToggle={() => toggle("wood")}>
          <Chips material={material.id} thickness={spec.thickness} bitId={design.bit} onMaterial={(id) => setMaterial(id)} onThickness={(t) => setMaterial(material.id, t)} onBit={(id) => patch({ bit: id })} />
        </AccItem>
        <ShapeSection n={2} open={sec === "shape"} onToggle={() => toggle("shape")} spec={spec} patchSpec={patchSpec} />
        <TracingSection n={3} open={sec === "tracing"} onToggle={() => toggle("tracing")} spec={spec} onAdded={(id) => p.setSel(id)} />

        <AccItem n={4} title="Elements" summary={rows.length ? `${rows.length} on the board · click one to edit` : "Nothing on the board yet"} open={sec === "elements"} onToggle={() => toggle("elements")}>
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
        </AccItem>
      </div>

      <div className="sidepanel__foot">
        {p.errors ? (
          <div className="sidepanel__hint">
            <AlertCircle size={15} strokeWidth={1.75} color="var(--alarm-text)" />
            Fix {p.errors} error{p.errors > 1 ? "s" : ""} to continue.
          </div>
        ) : (
          <div className="sidepanel__hint">
            Checked for a {bit?.name ?? "bit"} bit in {spec.thickness} mm {material.id}.
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

let seenBitMenuReq = 0;

function Chips(props: { material: string; thickness: number; bitId: string; onMaterial(id: string): void; onThickness(t: number): void; onBit(id: string): void }) {
  const [open, setOpen] = useState<null | "material" | "thick" | "bit">(null);
  const ref = useRef<HTMLDivElement>(null);
  // An issue's "Pick another bit" opens this menu.
  const bitMenuReq = useUi((s) => s.bitMenuReq);
  useEffect(() => {
    if (bitMenuReq > seenBitMenuReq) {
      seenBitMenuReq = bitMenuReq;
      setOpen("bit");
    }
  }, [bitMenuReq]);
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

// ------------------------------------------------------------------ shape

function ShapeSection({ n, open, onToggle, spec, patchSpec }: { n: number; open: boolean; onToggle(): void; spec: PlateSpecInput; patchSpec(fn: (s: PlateSpecInput) => PlateSpecInput): void }) {
  const edge = spec.edge?.type ?? "straight";
  const set = (fn: (s: PlateSpecInput) => PlateSpecInput) => patchSpec(fn);
  return (
    <AccItem n={n} title="Shape" summary={`${spec.type === "lettering" ? "Cut-out lettering" : "Sign"} · ${spec.width} × ${spec.height} mm`} open={open} onToggle={onToggle}>
        <div className="create-fields">
          <Field label="Type">
            <Seg<"plate" | "lettering">
              label="Type"
              value={spec.type ?? "plate"}
              onChange={(t) =>
                set((s) => ({
                  ...s,
                  type: t,
                  texts: s.texts?.map((x) => ({ ...x, mode: t === "lettering" ? "cutout" : x.mode === "cutout" ? "relief" : x.mode })),
                }))
              }
              options={[
                ["plate", "Sign"],
                ["lettering", "Cut-out lettering"],
              ]}
            />
          </Field>
          <div className="create-two">
            <Field label="Width">
              <Stepper label="Width" value={spec.width} step={5} min={30} max={1200} unit="mm" onChange={(v) => set((s) => ({ ...s, width: v }))} />
            </Field>
            <Field label="Height">
              <Stepper label="Height" value={spec.height} step={5} min={20} max={1200} unit="mm" onChange={(v) => set((s) => ({ ...s, height: v }))} />
            </Field>
          </div>
          {spec.type !== "lettering" ? (
            <>
              <Field label="Edge">
                <Seg<"straight" | "rounded" | "chamfered">
                  label="Edge"
                  value={edge}
                  onChange={(t) => set((s) => ({ ...s, edge: { type: t, radius: t === "straight" ? 0 : s.edge?.radius || 8 } }))}
                  options={[
                    ["straight", "Straight"],
                    ["rounded", "Rounded"],
                    ["chamfered", "Chamfered"],
                  ]}
                />
              </Field>
              {edge !== "straight" ? (
                <Slider label="Corner radius" value={spec.edge?.radius ?? 8} min={2} max={30} step={1} onChange={(v) => set((s) => ({ ...s, edge: { type: edge, radius: v } }))} />
              ) : null}
              <label className="create-check">
                <input type="checkbox" checked={(spec.frame ?? 6) > 0} onChange={(e) => set((s) => ({ ...s, frame: e.target.checked ? 6 : 0 }))} />
                Frame <span className="muted">raised border 6 mm in</span>
              </label>
            </>
          ) : null}
        </div>
    </AccItem>
  );
}

/**
 * Upload design: an SVG or DXF file (the highlight), or a picture to trace: shown under the design (not cut), drawn over with
 * the pen, or convert it to vectors automatically.
 */
function TracingSection({ n, open, onToggle, spec, onAdded }: { n: number; open: boolean; onToggle(): void; spec: PlateSpecInput; onAdded(id: ElementId): void }) {
  const t = useDesign((s) => s.design.tracing);
  const patchSpec = useDesign((s) => s.patchSpec);
  const patch = useDesign((s) => s.patch);
  const { moving, setMoving } = useTracingUi();
  const [tracingOpen, setTracingOpen] = useState(false);
  const set = (p: Partial<TracingImage>) => t && patch({ tracing: { ...t, ...p } });
  const load = async () => {
    const file = await pickImageFile();
    if (!file) return;
    try {
      patch({ tracing: await tracingFromFile(file, spec) });
    } catch (e) {
      toast(e instanceof Error ? e.message : "This image could not be opened.");
    }
  };
  return (
    <>
      <AccItem n={n} title="Upload design" summary={t ? `SVG or DXF file · tracing ${t.name}` : "SVG or DXF file, or trace a picture"} open={open} onToggle={onToggle}>
        <div className="create-upload">
          <div className="create-upload__title">
            <FileUp size={16} strokeWidth={1.75} color="var(--accent)" /> Design file
          </div>
          <div className="tiny muted">Vector drawings from Inkscape, Illustrator, Affinity, Fusion or LightBurn come in ready to carve. You can also drop the file on the board.</div>
          <button
            className="btn btn--primary"
            onClick={async () => {
              const file = await pickSvgFile();
              const out = file ? await importSvgFile(file, useDesign.getState().design.spec) : null;
              if (!out) return;
              patchSpec(() => out[0]);
              onAdded(out[1]);
            }}
          >
            <FileUp size={16} /> Upload SVG or DXF…
          </button>
        </div>
        <div className="create-upload__or">
          <span>or trace a picture</span>
        </div>
        <div className="create-fields">
          {!t ? (
            <>
              <div className="tiny muted">A photo, scan or logo goes under the board: trace it with the pen, or convert it to a carvable drawing (with Polish to clean it up). The picture itself is never carved.</div>
              <button className="btn btn--outline" onClick={load}>
                <ImagePlus size={16} /> Choose image…
              </button>
            </>
          ) : (
            <>
              <div className="create-two">
                <Field label="Show">
                  <Seg<"on" | "off">
                    label="Show"
                    value={t.visible ? "on" : "off"}
                    onChange={(v) => set({ visible: v === "on" })}
                    options={[
                      ["on", "Visible"],
                      ["off", "Hidden"],
                    ]}
                  />
                </Field>
                <Field label="Width">
                  <Stepper label="Width" value={t.width} step={5} min={10} max={3000} unit="mm" onChange={(v) => set({ width: v })} />
                </Field>
              </div>
              <Slider label="Opacity" unit="%" value={Math.round(t.opacity * 100)} min={10} max={100} step={5} onChange={(v) => set({ opacity: v / 100 })} />
              <div className="create-two">
                <button className={`btn ${moving ? "btn--light" : "btn--outline"}`} aria-pressed={moving} onClick={() => setMoving(!moving)}>
                  <Move size={16} /> {moving ? "Done moving" : "Move on board"}
                </button>
                <button className="btn btn--outline" onClick={() => set({ x: spec.width / 2, y: spec.height / 2, width: Math.round(Math.min(spec.width, spec.height / t.aspect) * 10) / 10 })}>
                  Fit to sign
                </button>
              </div>
              <button className="btn btn--primary" onClick={() => setTracingOpen(true)}>
                <Wand2 size={16} /> Convert to vector…
              </button>
              <div className="create-two">
                <button className="btn btn--quiet btn--sm" onClick={load}>
                  Replace image
                </button>
                <button
                  className="btn btn--quiet btn--sm"
                  onClick={() => {
                    setMoving(false);
                    patch({ tracing: undefined });
                  }}
                >
                  Remove image
                </button>
              </div>
            </>
          )}
        </div>
      </AccItem>
      {tracingOpen && t ? <TraceDialog tracing={t} onClose={() => setTracingOpen(false)} onAdded={onAdded} /> : null}
    </>
  );
}

function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/gif,image/bmp";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
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

/**
 * Depth. With a V-bit, engraving becomes V-carving: the depth follows the stroke width
 * and the value here is just the limit.
 */
function DepthSlider({ mode, value, min, max, onChange }: { mode: Mode; value: number; min: number; max: number; onChange(v: number): void }) {
  const bitId = useDesign((s) => s.design.bit);
  const vcarve = mode === "engrave" && bitById(bitId)?.profile === "v";
  if (!vcarve) return <Slider label="Depth" value={value} min={min} max={max} step={0.5} onChange={onChange} />;
  return (
    <>
      <Slider label="Max depth (V-carve)" value={value} min={0.5} max={12} step={0.5} onChange={onChange} />
      <div className="tiny muted">The V-bit goes deeper where the lines are wider, up to this limit.</div>
    </>
  );
}

function ModeSeg({ value, sign, onChange, allowThrough = true }: { value: Mode; sign: boolean; onChange(m: Mode): void; allowThrough?: boolean }) {
  if (!sign) return <div className="tiny muted">Cut-out lettering: every element is cut all the way through.</div>;
  const opts: [Mode, string][] = [
    ["relief", "Raised"],
    ["engrave", "Engraved"],
  ];
  if (allowThrough) opts.push(["cutout", "Cut through"]);
  return (
    <Field label="Style">
      <Seg<Mode> label="Style" value={value} onChange={onChange} options={opts} />
    </Field>
  );
}

function Inspector({ id, spec, patchSpec, sign }: { id: ElementId; spec: PlateSpecInput; patchSpec(fn: (s: PlateSpecInput) => PlateSpecInput): void; sign: boolean }) {
  const body = <InspectorBody id={id} spec={spec} patchSpec={patchSpec} sign={sign} />;
  if (id === "holes") return body;
  return (
    <>
      {body}
      <ShapeTools key={id} id={id} spec={spec} patchSpec={patchSpec} />
    </>
  );
}

/** Common adjustments: thicken/thin, outline ring and combining with other elements. */
function ShapeTools({ id, spec, patchSpec }: { id: ElementId; spec: PlateSpecInput; patchSpec(fn: (s: PlateSpecInput) => PlateSpecInput): void }) {
  const el = elementOf(spec, id);
  const [open, setOpen] = useState(() => !!el && (!!el.offset || !!el.outline || !!el.hatch || (el.operation ?? "normal") !== "normal"));
  const bit = bitById(useDesign((s) => s.design.bit));
  if (!el) return null;
  // Initial hatch spacing: with a flat bit, ~1.8× the cut width so the lines show.
  const hatchGap = bit && bit.profile !== "v" ? Math.ceil(bit.d * 1.8 * 2) / 2 : 2;
  const set = (p: Record<string, unknown>) => patchSpec((s) => patchElement(s, id, p));
  const ring = el.outline;
  // A ring narrower than a flat bit can't be cut at all (the bit doesn't fit in it), so it starts
  // a bit wider than the bit. V-bits carve any width.
  const ringWidth = bit && bit.profile !== "v" ? Math.ceil(bit.d * 1.3 * 2) / 2 : 2;
  const ringTooThin = !!ring && !!bit && bit.profile !== "v" && (ring.width ?? 2) < bit.d;
  const op = el.operation ?? "normal";
  return (
    <div className="create-fields create-inspector create-more">
      <button className="create-more__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Outline, fill &amp; combine
      </button>
      {open ? (
        <>
          <Slider label="Thicker / thinner" value={el.offset ?? 0} min={-3} max={6} step={0.25} onChange={(v) => set({ offset: v })} />
          <Field label="Outline ring">
            <Seg<"off" | "on">
              label="Outline ring"
              value={ring ? "on" : "off"}
              onChange={(v) => set({ outline: v === "on" ? { distance: 2, width: ringWidth } : undefined })}
              options={[
                ["off", "None"],
                ["on", "Add ring"],
              ]}
            />
          </Field>
          {ring ? (
            <div className="create-two">
              <Field label="Gap">
                <Stepper label="Gap" value={ring.distance ?? 2} step={0.5} min={0} max={30} unit="mm" onChange={(v) => set({ outline: { ...ring, distance: v } })} />
              </Field>
              <Field label="Ring width">
                <Stepper label="Ring width" value={ring.width ?? 2} step={0.5} min={0.5} max={20} unit="mm" onChange={(v) => set({ outline: { ...ring, width: v } })} />
              </Field>
            </div>
          ) : null}
          {ringTooThin ? (
            <div className="tiny" style={{ color: "var(--paused)" }}>
              The ring is narrower than the {bit!.name} bit ({bit!.d.toFixed(2)} mm), so the bit can't cut it.{" "}
              <button className="link" onClick={() => set({ outline: { ...ring, width: ringWidth } })}>
                Make it {ringWidth} mm
              </button>
            </div>
          ) : null}
          <Field label="Combine with others">
            <Seg<"normal" | "subtract" | "mask">
              label="Combine with others"
              value={op}
              onChange={(v) => set({ operation: v })}
              options={[
                ["normal", "Normal"],
                ["subtract", "Subtract"],
                ["mask", "Mask"],
              ]}
            />
          </Field>
          {op !== "normal" ? (
            <>
              <div className="tiny muted">
                {op === "subtract" ? "This element isn't carved: it cuts its shape out of the elements it applies to." : "This element isn't carved: the elements it applies to keep only the part inside it."}
              </div>
              <Targets id={id} spec={spec} targets={el.targets} onChange={(targets) => set({ targets })} />
            </>
          ) : null}
          {op === "normal" && (el.mode ?? "engrave") === "engrave" && spec.type !== "lettering" ? (
            <>
              <Field label="Engraving fill">
                <Seg<"solid" | "hatch">
                  label="Engraving fill"
                  value={el.hatch ? "hatch" : "solid"}
                  onChange={(v) => set({ hatch: v === "hatch" ? { spacing: hatchGap, angle: 45 } : undefined })}
                  options={[
                    ["solid", "Solid"],
                    ["hatch", "Outline + lines"],
                  ]}
                />
              </Field>
              {el.hatch ? (
                <div className="create-two">
                  <Field label="Line spacing">
                    <Stepper label="Line spacing" value={el.hatch.spacing ?? 2} step={0.5} min={0.5} max={20} unit="mm" onChange={(v) => set({ hatch: { ...el.hatch, spacing: v } })} />
                  </Field>
                  <Field label="Angle">
                    <Stepper label="Angle" value={el.hatch.angle ?? 45} step={15} min={-90} max={90} unit="°" onChange={(v) => set({ hatch: { ...el.hatch, angle: v } })} />
                  </Field>
                </div>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/**
 * Which elements subtract/mask applies to. No list (default) means all of them; unchecking
 * the first one makes the list explicit.
 */
function Targets({ id, spec, targets, onChange }: { id: ElementId; spec: PlateSpecInput; targets: Target[] | undefined; onChange(a: Target[] | undefined): void }) {
  const rows = listElements(spec).filter((r) => r.id !== id && r.kind !== "holes" && (elementOf(spec, r.id)?.operation ?? "normal") === "normal");
  if (!rows.length) return <div className="tiny muted">There's nothing else on the board for it to affect yet.</div>;
  const all = rows.map((r) => refOf(r.id)!);
  const on = (r: ElementId) => !targets || targets.some((a) => idOfTarget(a) === r);
  const toggle = (r: ElementId) => {
    const cur = targets ?? all;
    const next = on(r) ? cur.filter((a) => idOfTarget(a) !== r) : [...cur, refOf(r)!];
    // All checked goes back to the default ("all"), which also includes new elements.
    onChange(rows.every((x) => next.some((a) => idOfTarget(a) === x.id)) ? undefined : next);
  };
  return (
    <Field label="Applies to" aside={<span className="tiny muted">{targets ? `${targets.length} of ${rows.length}` : "All elements"}</span>}>
      <div className="create-targets">
        {rows.map((r) => (
          <label key={r.id} className="create-target">
            <input type="checkbox" checked={on(r.id)} onChange={() => toggle(r.id)} />
            <span>{r.name}</span>
          </label>
        ))}
      </div>
    </Field>
  );
}

function InspectorBody({ id, spec, patchSpec, sign }: { id: ElementId; spec: PlateSpecInput; patchSpec(fn: (s: PlateSpecInput) => PlateSpecInput): void; sign: boolean }) {
  const { kind, index } = parseId(id);
  if (kind === "t") {
    const t = spec.texts?.[index];
    if (!t) return null;
    const setT = (p: Partial<Text>) => patchSpec((s) => ({ ...s, texts: s.texts?.map((x, i) => (i === index ? { ...x, ...p } : x)) }));
    const sample = (t.content || "Ana").slice(0, 6);
    return (
      <div className="create-fields create-inspector">
        <Field label="Content">
          <input className="create-input" value={t.content} maxLength={60} onChange={(e) => setT({ content: e.target.value || " " })} />
        </Field>
        <Field label="Font" aside={<span className="tiny muted">Archivo Black is the easiest to carve</span>}>
          <div className="create-fonts" role="radiogroup" aria-label="Font">
            {FONTS.map((f) => (
              <button key={f.id} role="radio" aria-checked={(t.font ?? "archivo-black") === f.id} className="create-font" onClick={() => setT({ font: f.id })}>
                <span className="create-font__sample" style={{ fontFamily: f.css }}>
                  {sample}
                </span>
                <span className="create-font__name">{f.name}</span>
                <span className="create-font__tag">{f.tag}</span>
              </button>
            ))}
          </div>
        </Field>
        <Slider label="Letter height" value={t.size} min={8} max={70} step={1} onChange={(v) => setT({ size: v })} />
        <Slider label="Curve" unit="%" value={bendOf(t)} min={-100} max={100} step={5} onChange={(v) => setT({ arc: arcFromBend(t, v) })} />
        <ModeSeg value={t.mode ?? "relief"} sign={sign} onChange={(m) => setT({ mode: m })} />
        {sign && (t.mode ?? "relief") !== "cutout" ? <DepthSlider mode={t.mode ?? "relief"} value={t.depth ?? 3} min={1} max={12} onChange={(v) => setT({ depth: v })} /> : null}
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
    const f = spec.shapes?.[index];
    if (!f) return null;
    const setF = (p: Partial<Shape>) => patchSpec((s) => ({ ...s, shapes: s.shapes?.map((x, i) => (i === index ? ({ ...x, ...p } as Shape) : x)) }));
    const len = f.type === "line" ? Math.round(Math.hypot(f.x2 - f.x, f.y2 - f.y)) : 0;
    const ang = f.type === "line" ? Math.round((Math.atan2(f.y2 - f.y, f.x2 - f.x) * 180) / Math.PI) : 0;
    const setLine = (L: number, a: number) => {
      if (f.type !== "line") return;
      const cx = (f.x + f.x2) / 2;
      const cy = (f.y + f.y2) / 2;
      const dx = (Math.cos((a * Math.PI) / 180) * L) / 2;
      const dy = (Math.sin((a * Math.PI) / 180) * L) / 2;
      const r = (v: number) => Math.round(v * 10) / 10;
      setF({ x: r(cx - dx), y: r(cy - dy), x2: r(cx + dx), y2: r(cy + dy) });
    };
    return (
      <div className="create-fields create-inspector">
        {f.type === "rectangle" ? (
          <div className="create-two">
            <Field label="Width">
              <Stepper label="Width" value={f.width} step={2} min={4} max={1000} unit="mm" onChange={(v) => setF({ width: v })} />
            </Field>
            <Field label="Height">
              <Stepper label="Height" value={f.height} step={2} min={4} max={1000} unit="mm" onChange={(v) => setF({ height: v })} />
            </Field>
          </div>
        ) : f.type === "circle" ? (
          <Field label="Diameter">
            <Stepper label="Diameter" value={f.diameter} step={2} min={4} max={1000} unit="mm" onChange={(v) => setF({ diameter: v })} />
          </Field>
        ) : f.type === "curve" ? (
          <>
            <Field label="Shape">
              <Seg<"closed" | "open">
                label="Shape"
                value={f.closed ?? true ? "closed" : "open"}
                onChange={(v) => setF({ closed: v === "closed", ...(v === "open" && f.mode === "cutout" ? { mode: "engrave" } : {}) })}
                options={[
                  ["closed", "Closed shape"],
                  ["open", "Open line"],
                ]}
              />
            </Field>
            {f.closed ?? true ? null : (
              <Field label="Line width">
                <Stepper label="Line width" value={f.thickness ?? 3.2} step={0.5} min={0.5} max={40} unit="mm" onChange={(v) => setF({ thickness: v })} />
              </Field>
            )}
            <div className="tiny muted">Drag the points on the board to reshape it. Double-click a point to make it sharp or smooth; hold Alt to move one handle on its own.</div>
          </>
        ) : f.type === "polygon" || f.type === "star" ? (
          <>
            <div className="create-two">
              <Field label="Size">
                <Stepper label="Size" value={f.diameter} step={2} min={4} max={1000} unit="mm" onChange={(v) => setF({ diameter: v })} />
              </Field>
              {f.type === "polygon" ? (
                <Field label="Sides">
                  <Stepper label="Sides" value={f.sides ?? 6} step={1} min={3} max={24} onChange={(v) => setF({ sides: v })} />
                </Field>
              ) : (
                <Field label="Points">
                  <Stepper label="Points" value={f.points ?? 5} step={1} min={3} max={24} onChange={(v) => setF({ points: v })} />
                </Field>
              )}
            </div>
            {f.type === "star" ? <Slider label="Inner size" unit="%" value={Math.round((f.inner ?? 0.45) * 100)} min={15} max={95} step={5} onChange={(v) => setF({ inner: v / 100 })} /> : null}
            <Slider label="Rotation" unit="°" value={f.rotation ?? 0} min={-180} max={180} step={5} onChange={(v) => setF({ rotation: v })} />
          </>
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
        <ModeSeg value={f.mode ?? "engrave"} sign={sign} onChange={(m) => setF({ mode: m })} allowThrough={f.type !== "line" && !(f.type === "curve" && f.closed === false)} />
        {sign && (f.mode ?? "engrave") !== "cutout" ? <DepthSlider mode={f.mode ?? "engrave"} value={f.depth ?? 2} min={0.5} max={8} onChange={(v) => setF({ depth: v })} /> : null}
      </div>
    );
  }
  if (kind === "i") {
    const c = spec.icons?.[index];
    if (!c) return null;
    const setI = (p: Partial<typeof c>) => patchSpec((s) => ({ ...s, icons: s.icons?.map((x, i) => (i === index ? { ...x, ...p } : x)) }));
    return (
      <div className="create-fields create-inspector">
        <Field label="Icon">
          <Seg label="Icon" value={c.id} onChange={(v) => setI({ id: v })} options={ICONS.map((x) => [x.id, x.name] as [typeof c.id, string])} />
        </Field>
        <Slider label="Size" value={c.size} min={10} max={40} step={1} onChange={(v) => setI({ size: v })} />
        <ModeSeg value={c.mode ?? "relief"} sign={sign} onChange={(m) => setI({ mode: m })} allowThrough={false} />
      </div>
    );
  }
  if (kind === "s") {
    const v = spec.svgs?.[index];
    if (!v) return null;
    const setV = (p: Partial<SvgEl>) => patchSpec((s) => ({ ...s, svgs: s.svgs?.map((x, i) => (i === index ? { ...x, ...p } : x)) }));
    const h = Math.round(v.width * svgAspect(v.content) * 10) / 10;
    return (
      <div className="create-fields create-inspector">
        <Field label="Width" aside={<span className="tiny muted">Height follows: {h} mm</span>}>
          <Stepper label="Width" value={v.width} step={2} min={5} max={1000} unit="mm" onChange={(w) => setV({ width: w })} />
        </Field>
        <ModeSeg value={v.mode ?? "engrave"} sign={sign} onChange={(m) => setV({ mode: m })} />
        {sign && (v.mode ?? "engrave") !== "cutout" ? <DepthSlider mode={v.mode ?? "engrave"} value={v.depth ?? 2} min={0.5} max={8} onChange={(d) => setV({ depth: d })} /> : null}
        <div className="tiny muted">Filled areas are carved; lines without fill are carved as wide as their stroke. Text must be converted to outlines before export.</div>
      </div>
    );
  }
  return <HolesInspector spec={spec} patchSpec={patchSpec} />;
}

function HolesInspector({ spec, patchSpec }: { spec: PlateSpecInput; patchSpec(fn: (s: PlateSpecInput) => PlateSpecInput): void }) {
  const kind = spec.slots?.length ? "slot" : spec.holes?.length ? "holes" : "none";
  const d = spec.holes?.[0]?.diameter ?? 5;
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
          <Stepper label="Hole diameter" value={d} step={0.5} min={2} max={12} unit="mm" onChange={(v) => patchSpec((s) => ({ ...s, holes: s.holes?.map((f) => ({ ...f, diameter: v })) }))} />
        </Field>
      ) : null}
    </div>
  );
}

function withHoles(s: PlateSpecInput, v: "none" | "holes" | "slot", d = 5): PlateSpecInput {
  if (v === "none") return { ...s, holes: [], slots: [] };
  if (v === "holes")
    return {
      ...s,
      slots: [],
      holes: [
        { x: 14, y: s.height - 14, diameter: d },
        { x: s.width - 14, y: s.height - 14, diameter: d },
      ],
    };
  return { ...s, holes: [], slots: [{ x: s.width / 2, y: s.height - 14, length: 14, width: 6, angle: 0 }] };
}

function RowIcon({ row, spec }: { row: ElementRow; spec: PlateSpecInput }) {
  if (row.kind === "text") return <Type size={16} strokeWidth={1.5} />;
  if (row.kind === "icon") return <Heart size={16} strokeWidth={1.5} />;
  if (row.kind === "holes") return <Circle size={10} strokeWidth={2} />;
  if (row.kind === "svg") return <Shapes size={16} strokeWidth={1.5} />;
  const f = spec.shapes?.[parseId(row.id).index];
  if (f?.type === "circle") return <Circle size={16} strokeWidth={1.5} />;
  if (f?.type === "polygon") return <Hexagon size={16} strokeWidth={1.5} />;
  if (f?.type === "star") return <Star size={16} strokeWidth={1.5} />;
  if (f?.type === "curve") return <PenTool size={16} strokeWidth={1.5} />;
  if (f?.type === "line") return <Minus size={16} strokeWidth={1.5} />;
  return <Square size={16} strokeWidth={1.5} />;
}

function AddChips({ spec, onAdd }: { spec: PlateSpecInput; onAdd(s: PlateSpecInput, id: ElementId | null): void }) {
  const [lib, setLib] = useState(false);
  const cx = spec.width / 2;
  const cy = spec.height / 2;
  const add = (t: "text" | "rect" | "circle" | "polygon" | "star" | "line") => {
    // New text without a position: the engine stacks and centers it.
    if (t === "text") {
      const [s, id] = addElement(spec, "text", cx, cy);
      const last = s.texts!.length - 1;
      s.texts![last] = { ...s.texts![last], x: undefined, y: undefined };
      return onAdd(s, id);
    }
    const [s, id] = addElement(spec, t, cx, cy);
    onAdd(s, id);
  };
  const hasHoles = !!(spec.holes?.length || spec.slots?.length);
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
      <button className="create-add__chip" onClick={() => add("polygon")}>
        + Polygon
      </button>
      <button className="create-add__chip" onClick={() => add("star")}>
        + Star
      </button>
      <button className="create-add__chip" onClick={() => add("line")}>
        + Line
      </button>
      {spec.type !== "lettering" ? (
        <button
          className="create-add__chip"
          onClick={() => {
            const icons = spec.icons ?? [];
            onAdd({ ...spec, icons: [...icons, { id: "heart", x: spec.width - 22, y: 22, size: 18, mode: "engrave", depth: 2 }] }, `i:${icons.length}`);
          }}
        >
          + Icon
        </button>
      ) : null}
      <button className="create-add__chip" onClick={() => setLib(true)}>
        <Shapes size={13} strokeWidth={1.75} /> Library
      </button>
      {lib ? (
        <LibraryDialog
          onClose={() => setLib(false)}
          onPick={(el) => {
            const out = addLibraryElement(spec, el);
            if (out) onAdd(out[0], out[1]);
          }}
        />
      ) : null}
      {spec.type !== "lettering" && !hasHoles ? (
        <button className="create-add__chip" onClick={() => onAdd(withHoles(spec, "holes"), "holes")}>
          + Mounting holes
        </button>
      ) : null}
    </div>
  );
}
