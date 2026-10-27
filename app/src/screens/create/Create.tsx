import type { GenerateResult, PlateSpecInput } from "@carvcam/cam-engine";
import archivoUrl from "@carvcam/cam-engine/fonts/archivoblack/ArchivoBlack-Regular.ttf?url";
import bebasUrl from "@carvcam/cam-engine/fonts/bebasneue/BebasNeue-Regular.ttf?url";
import pacificoUrl from "@carvcam/cam-engine/fonts/pacifico/Pacifico-Regular.ttf?url";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Circle,
  Copy,
  FileUp,
  Hexagon,
  Minus,
  MousePointer2,
  PenTool,
  Square,
  Star,
  Trash2,
  Type,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { TopBar } from "../../components/TopBar";
import { useEngine } from "../../engine/useEngine";
import { bitById, materialById, THROUGH_COLOR, type Material } from "../../lib/catalog";
import { profileOutlines, TAB_COLOR, TAB_EDGE, tabMarks } from "../../stage/tabs";
import { TabsLayer } from "../../stage/TabsLayer";
import { cornerNote, issuesNote, legendRows, stepoverNote, type LegendKey, type LegendRow } from "./legend";
import { useDesign } from "../../state/design";
import { useActiveMachine, useWorkshop } from "../../state/workshop";
import { Board } from "../../stage/Board";
import { SimCanvas } from "../../stage/SimCanvas";
import { fitScale, Stage } from "../../stage/Stage";
import { SnapGuides, StageRulers, useRulersOn, useSnapGrid } from "../../stage/Rulers";
import { rectTargets, snapRect, SNAP_PX, type Guide, type Rect } from "../../stage/snap";
import { ThreeView } from "../../stage/ThreeView";
import { machineName } from "../../lib/catalog";
import { AssistantBar } from "./AssistantBar";
import { CurveEditor, PenLayer, type Geom } from "./pen";
import { isImageFile, tracingFromFile, TracingLayer } from "./tracing";
import { toast } from "../../state/ui";
import { addCurve, addElement, alignElements, deleteElement, patchElement, type CurveNode, duplicateElement, elementBoxes, elementOf, fontOf, margin, moveElement, parseId, type Align, type Box, type ElementId, type Tool } from "./elements";
import { buildIssues, type UiIssue } from "./issues";
import { useIssueCtx } from "./IssueCard";
import { useCanvasPrefs, useUi } from "../../state/ui";
import { CreatePanel } from "./Panel";
import { importSvgFile, isSvgFile, pickSvgFile } from "./svgImport";
import "./create.css";

// The engine's own fonts, for the font picker and on-board editing.
let fontsLoaded = false;
function loadUiFonts() {
  if (fontsLoaded || typeof FontFace === "undefined") return;
  fontsLoaded = true;
  for (const [family, url] of [
    ["Archivo Black", archivoUrl],
    ["Bebas Neue", bebasUrl],
    ["Pacifico", pacificoUrl],
  ])
    new FontFace(family, `url(${url})`).load().then((f) => document.fonts.add(f), () => undefined);
}

const TOOLS: [Tool, string, typeof Type, string][] = [
  ["select", "Select and move", MousePointer2, "V"],
  ["text", "Text", Type, "T"],
  ["rect", "Rectangle", Square, "R"],
  ["circle", "Circle", Circle, "C"],
  ["polygon", "Polygon", Hexagon, "P"],
  ["star", "Star", Star, "S"],
  ["line", "Line", Minus, "L"],
  ["pen", "Curve (pen)", PenTool, "B"],
];
const TOOL_NAME: Record<Tool, string> = { select: "", text: "text", rect: "rectangle", circle: "circle", polygon: "polygon", star: "star", line: "line", pen: "curve" };

const ALIGNS: [Align, string, typeof Type][] = [
  ["left", "Align left", AlignStartVertical],
  ["hcenter", "Center horizontally", AlignCenterVertical],
  ["right", "Align right", AlignEndVertical],
  ["top", "Align top", AlignStartHorizontal],
  ["vcenter", "Center vertically", AlignCenterHorizontal],
  ["bottom", "Align bottom", AlignEndHorizontal],
  ["hdist", "Distribute horizontally", AlignHorizontalDistributeCenter],
  ["vdist", "Distribute vertically", AlignVerticalDistributeCenter],
];

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export default function Create() {
  loadUiFonts();
  const design = useDesign((s) => s.design);
  const patchSpec = useDesign((s) => s.patchSpec);
  const spec = design.spec;
  const eng = useEngine(design);
  const { bits: ownedBits, mode } = useWorkshop();
  const { machine } = useActiveMachine();
  const bit = bitById(design.bit);
  const material = materialById(design.material);

  const [tool, setTool] = useState<Tool>("select");
  const [sel, setSel] = useState<ElementId | null>(null);
  const [editing, setEditing] = useState<ElementId | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const assistantInput = useRef<HTMLInputElement>(null);

  // The result shown is the current spec's, or the last one that arrived (while regenerating).
  // When the engine throws, the preview keeps the last result (the cards come only from a real one).
  const result = eng.result ?? (eng.error ? eng.prev : null);
  const issueCtx = useIssueCtx();
  const issues = useMemo(
    () => buildIssues(eng.result, issueCtx),
    // Warnings refer to the spec that produced the result; recompute only when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eng.result, bit, ownedBits, machine, issueCtx.useBit2, issueCtx.bit2, issueCtx.keepOut, issueCtx.canUndo, issueCtx.hasLastGood, issueCtx.tabs],
  );
  const errors = issues.filter((i) => i.level === "error").length;
  const warnings = issues.filter((i) => i.level === "warning").length;
  const boxes = useMemo(() => elementBoxes(spec, result), [spec, result]);
  const patchDesign = useDesign((s) => s.patch);
  const legendOpen = useCanvasPrefs((s) => s.legendOpen);
  // Holding tabs: the engine's (for the simulation) and the ones to draw (Manual follows the design at once).
  const simTabs = useMemo(() => tabMarks({ ...design.tabs, mode: "auto" }, result), [design.tabs, result]);
  const tabMarksNow = useMemo(() => tabMarks(design.tabs, result), [design.tabs, result]);
  const tabOutlines = useMemo(() => profileOutlines(result), [result]);
  /** Legend link: scroll the first card into view and focus it. */
  const showIssue = (i: UiIssue | undefined) => {
    if (!i) return;
    if (i.target && i.level !== "error") setFocusKey(i.key);
    const el = document.querySelector<HTMLElement>(`[data-issue-key="${CSS.escape(i.key)}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus({ preventScroll: true });
    el.classList.remove("is-flash");
    void el.offsetWidth;
    el.classList.add("is-flash");
  };

  // Multi-select (Shift+click): `sel` is the primary element (the one in the panel); `extra`, the rest.
  const [extra, setExtra] = useState<ElementId[]>([]);
  const selected = sel ? [sel, ...extra.filter((x) => x !== sel && boxes.has(x))] : [];
  const choose = (id: ElementId | null) => {
    setSel(id);
    setExtra([]);
  };
  const pick = (id: ElementId, additive: boolean) => {
    if (!additive || !sel) return choose(id);
    if (id === sel) {
      setSel(extra[0] ?? null);
      setExtra(extra.slice(1));
    } else setExtra(extra.includes(id) ? extra.filter((x) => x !== id) : [...extra, id]);
  };
  const align = (how: Align) => patchSpec((s) => alignElements(s, selected, boxes, how));
  const moveMany = (ids: ElementId[], dx: number, dy: number) =>
    patchSpec((sp) =>
      ids.reduce((acc, id) => {
        const b = boxes.get(id);
        return b ? moveElement(acc, id, b.cx + dx, b.cy + dy, b) : acc;
      }, sp),
    );

  // Selection clears when the element no longer exists (deleted by the assistant, for example).
  useEffect(() => {
    if (sel && !boxes.has(sel)) setSel(null);
    if (extra.some((x) => !boxes.has(x))) setExtra(extra.filter((x) => boxes.has(x)));
  }, [boxes, sel, extra]);

  const [dropping, setDropping] = useState(false);
  const importSvg = async (file: File | null) => {
    if (!file) return;
    const out = await importSvgFile(file, useDesign.getState().design.spec);
    if (!out) return;
    patchSpec(() => out[0]);
    setSel(out[1]);
    setTool("select");
  };

  const remove = (id: ElementId) => {
    // With several selected, delete them all (highest index first, so the others don't shift).
    const ids = selected.includes(id) ? selected : [id];
    const order = [...ids].sort((a, b) => parseId(b).index - parseId(a).index);
    patchSpec((s) => order.reduce((acc, x) => deleteElement(acc, x), s));
    choose(null);
  };
  const duplicate = (id: ElementId) => {
    const [next, nid] = duplicateElement(spec, id, boxes.get(id));
    if (!nid) return;
    patchSpec(() => next);
    setSel(nid);
  };

  // An issue card on another screen asked to select an element here.
  useEffect(() => {
    const p = useUi.getState().pendingSel;
    if (p) {
      setSel(p as ElementId);
      useUi.getState().request({ pendingSel: null });
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.shiftKey && !isTyping(e.target)) {
        e.preventDefault();
        toast(useDesign.getState().undo() ? "Undone." : "Nothing to undo.");
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        assistantInput.current?.focus();
        return;
      }
      if (isTyping(e.target)) return;
      if (e.key === "Escape") {
        choose(null);
        setEditing(null);
        setTool("select");
      } else if ((e.key === "Delete" || e.key === "Backspace") && sel) {
        e.preventDefault();
        remove(sel);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d" && sel) {
        e.preventDefault();
        duplicate(sel);
      } else if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        const t = TOOLS.find((x) => x[3] === e.key.toUpperCase());
        if (t) setTool(t[0]);
        else if (e.key.toLowerCase() === "i") void pickSvgFile().then(importSvg);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const m = margin(spec);
  const block = result?.layout.stock ?? { width: spec.width + 2 * m, height: spec.height + 2 * m, thickness: spec.thickness };
  const sameBlock = result && Math.abs(result.layout.stock.width - (spec.width + 2 * m)) < 0.01 && Math.abs(result.layout.stock.height - (spec.height + 2 * m)) < 0.01;
  const caption =
    tool === "pen"
      ? "Click to add points, drag to curve · click the first point to close · Enter for an open line"
      : tool !== "select" ? `Click on the ${spec.type === "lettering" ? "board" : "sign"} to add a ${TOOL_NAME[tool]}` : eng.busy ? "Re-checking…" : `Simulated cut · ${bit?.name ?? "bit"}`;

  return (
    <div
      className={`app create ${dropping ? "is-dropping" : ""}`}
      onDragOver={(e) => {
        if (![...e.dataTransfer.items].some((i) => i.kind === "file")) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) setDropping(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDropping(false);
        const files = [...e.dataTransfer.files];
        const img = files.find(isImageFile);
        if (img && !files.some(isSvgFile)) {
          // Photo or logo: becomes a tracing image (not cut).
          tracingFromFile(img, useDesign.getState().design.spec).then(
            (t) => {
              useDesign.getState().patch({ tracing: t });
              toast("Added as a tracing image. Draw over it, or use Convert to vector in the panel.");
            },
            () => toast("This image could not be opened."),
          );
          return;
        }
        void importSvg(files.find(isSvgFile) ?? files[0] ?? null);
      }}
    >
      <div className="dotgrid" />
      <TopBar variant="job" step="create" reachable={errors ? ["create"] : ["create", "prepare"]} />
      <Stage
        caption={caption}
        canvasTools
        overlay={
          <>
            <ToolRail tool={tool} setTool={setTool} onImport={() => void pickSvgFile().then(importSvg)} />
            {dropping ? <div className="create-drop">Drop an SVG or DXF to carve it, or a picture to trace over, on the {spec.type === "lettering" ? "board" : "sign"}</div> : null}
            <Legend
              rows={legendRows({ result, thickness: spec.thickness, tabs: result?.tabs?.length ?? 0, leftover: issues.some((i) => i.pct !== undefined && !!i.target && boxes.has(i.target)) })}
              material={material}
              corner={cornerNote(bit)}
              stepover={mode === "pro" ? stepoverNote(result, bit?.d) : null}
              issues={issuesNote(errors, issues.length)}
              issueLevel={errors ? "error" : "warning"}
              onIssues={() => showIssue(issues[0])}
            />
          </>
        }
        bottomLeft={<AssistantBar inputRef={assistantInput} issues={issues} bitName={bit?.name ?? "bit"} materialName={`${spec.thickness} mm ${material.id}`} machineName={machineName(machine)} />}
        render={(api) => {
          if (api.view === "3d") {
            return eng.sim ? (
              <ThreeView sim={eng.sim} thickness={block.thickness} material={material} board={{ width: block.width, height: block.height }} zoom={api.zoom} spin={api.spin} size={api.size} tabs={simTabs} />
            ) : (
              <div className="muted">Simulating the cut…</div>
            );
          }
          // The open legend takes the top-right corner: the board centers in the space left of it.
          const side = legendOpen && result ? LEGEND_SPACE : 0;
          const s = fitScale({ w: api.size.w - side, h: api.size.h }, block.width, block.height, { x: side ? 220 : 260, y: 280 });
          return (
            <div style={{ marginRight: side, transition: "margin 180ms var(--ease)" }}>
            <Board width={block.width} height={block.height} scale={s} zoom={api.zoom} showOrigin={false}>
              <StageRulers width={block.width} height={block.height} scale={s} zoom={api.zoom} />
              <div className="create-piece" style={pieceMask(result, bit?.d ?? 3.175)}>
                {eng.sim ? (
                  <SimCanvas sim={eng.sim} thickness={block.thickness} material={material} scale={s} board={{ width: block.width, height: block.height }} tabs={simTabs} />
                ) : null}
                {(!eng.sim || eng.busy || !sameBlock) && result ? <VectorPreview result={result} material={material} faded={!!eng.sim} lineWidth={bit?.profile === "v" ? 0.6 : (bit?.d ?? 3.175)} /> : null}
                {!result ? <div style={{ position: "absolute", inset: m * s, background: material.face, borderRadius: 4 }} /> : null}
              </div>
              <TracingLayer margin={m} scale={s} boardH={block.height} />
              <Overlay
                spec={spec}
                block={block}
                scale={s}
                zoom={api.zoom}
                boxes={boxes}
                issues={issues}
                tool={tool}
                sel={sel}
                selected={selected}
                setSel={choose}
                onPick={pick}
                onAlign={align}
                onMoveMany={moveMany}
                editing={editing}
                setEditing={setEditing}
                focusKey={focusKey}
                onCurve={(nodes, closed) => {
                  const [next, id] = addCurve(spec, nodes, closed);
                  patchSpec(() => next);
                  choose(id);
                  setTool("select");
                }}
                onCurveNodes={(id, nodes) => patchSpec((sp) => patchElement(sp, id, { nodes: nodes }))}
                onAdd={(x, y) => {
                  if (tool === "select" || tool === "pen") return;
                  const [next, id] = addElement(spec, tool, x, y);
                  patchSpec(() => next);
                  setSel(id);
                  setTool("select");
                  if (tool === "text") setEditing(id);
                }}
                onMove={(id, cx, cy) => patchSpec((sp) => moveElement(sp, id, cx, cy, boxes.get(id)))}
                onText={(id, text) => {
                  const { index } = parseId(id);
                  patchSpec((sp) => ({ ...sp, texts: sp.texts?.map((t, i) => (i === index ? { ...t, content: text || t.content } : t)) }));
                }}
                onDuplicate={duplicate}
                onDelete={remove}
              />
              {result && sameBlock && tabMarksNow.length ? (
                <TabsLayer
                  marks={tabMarksNow}
                  width={block.width}
                  height={block.height}
                  scale={s}
                  tabHeight={design.tabs.height}
                  outlines={tabOutlines}
                  positions={design.tabs.mode === "manual" ? design.tabs.positions : undefined}
                  onChange={design.tabs.mode === "manual" ? (positions) => patchDesign({ tabs: { ...design.tabs, positions } }) : undefined}
                />
              ) : null}
            </Board>
            </div>
          );
        }}
      />
      <CreatePanel
        issues={issues}
        errors={errors}
        warnings={warnings}
        busy={eng.busy}
        engineError={eng.error}
        sel={sel}
        setSel={choose}
        boxes={boxes}
        focusKey={focusKey}
        setFocusKey={setFocusKey}
        onDuplicate={duplicate}
        onDelete={remove}
      />
    </div>
  );
}

// ------------------------------------------------------------------ tool rail and legend

function ToolRail({ tool, setTool, onImport }: { tool: Tool; setTool(t: Tool): void; onImport(): void }) {
  return (
    <div className="create-rail" role="toolbar" aria-label="Drawing tools" aria-orientation="vertical">
      {TOOLS.map(([id, label, Icon, key]) => (
        <button key={id} className="create-rail__btn" aria-pressed={tool === id} aria-label={label} title={`${label} (${key})`} onClick={() => setTool(id)}>
          <Icon size={17} strokeWidth={1.6} />
        </button>
      ))}
      <span className="create-rail__sep" aria-hidden />
      <button className="create-rail__btn" aria-label="Import SVG file" title="Import SVG file (I)" onClick={onImport}>
        <FileUp size={17} strokeWidth={1.6} />
      </button>
    </div>
  );
}

/** Room the open legend needs on the right of the stage (its width plus margins), px. */
const LEGEND_SPACE = 272;

/** What each colour on the canvas means, in plain words; only what this design actually has. Collapsible. */
function Legend(p: { rows: LegendRow[]; material: Material; corner: string | null; stepover: string | null; issues: string | null; issueLevel: "error" | "warning"; onIssues(): void }) {
  const open = useCanvasPrefs((s) => s.legendOpen);
  const setOpen = useCanvasPrefs((s) => s.setLegendOpen);
  const sw: Record<LegendKey, React.CSSProperties> = {
    face: { background: p.material.face },
    lowered: { background: p.material.recess },
    through: { background: THROUGH_COLOR, borderColor: "rgba(255,255,255,.4)" },
    tabs: { background: TAB_COLOR, borderColor: TAB_EDGE, borderWidth: 2 },
    leftover: { background: "repeating-linear-gradient(135deg,#F2C14E 0 2px,transparent 2px 5px)", borderColor: "#F2C14E" },
  };
  if (!p.rows.length) return null;
  if (!open)
    return (
      <button className="create-legend create-legend--closed" aria-expanded={false} onClick={() => setOpen(true)} title="Show what the colours mean">
        <span className="create-legend__minisw" aria-hidden>
          {p.rows.map((r) => (
            <span key={r.key} style={sw[r.key]} />
          ))}
        </span>
        Legend
        <ChevronDown size={14} strokeWidth={2} />
      </button>
    );
  return (
    <div className="create-legend" role="region" aria-label="What the colours mean">
      <button className="create-legend__head" aria-expanded onClick={() => setOpen(false)} title="Hide the legend">
        What the colours mean
        <ChevronUp size={14} strokeWidth={2} />
      </button>
      {p.rows.map((r) => (
        <div key={r.key} className={`create-legend__row create-legend__row--${r.key}`}>
          <span className="create-legend__sw" style={sw[r.key]} />
          {r.label}
        </div>
      ))}
      {p.corner || p.stepover || p.issues ? (
        <div className="create-legend__notes">
          {p.corner ? <div>{p.corner}</div> : null}
          {p.stepover ? <div>{p.stepover}</div> : null}
          {p.issues ? (
            <button className={`create-legend__issues create-legend__issues--${p.issueLevel}`} onClick={p.onIssues}>
              <AlertTriangle size={13} strokeWidth={2} />
              {p.issues}: show me
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toString();

// ------------------------------------------------------------------ fast vector preview

type Region = { x: number; y: number }[][];
const pathOf = (reg: Region) => reg.map((p) => `M${p.map((q) => `${q.x.toFixed(2)},${q.y.toFixed(2)}`).join("L")}Z`).join("");

/**
 * Quick drawing from the engine's regions: shows up instantly, while the cut simulation
 * (slower) is still being computed.
 */
function VectorPreview({ result, material, faded, lineWidth }: { result: GenerateResult; material: Material; faded: boolean; lineWidth: number }) {
  const L = result.layout;
  const { width: W, height: H } = L.stock;
  return (
    <svg className="create-vector" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ opacity: faded ? 0.9 : 1 }} aria-hidden>
      <g transform={`translate(0 ${H}) scale(1 -1)`} fillRule="evenodd">
        <path d={pathOf(L.part as Region)} fill={material.face} />
        {L.relief ? <path d={pathOf(L.relief.region as Region)} fill={material.recess} /> : null}
        {L.engraved.map((g, i) => {
          const color = g.depth >= L.stock.thickness ? THROUGH_COLOR : material.recess;
          if (!g.hatch) return <path key={`g${i}`} d={pathOf(g.region as Region)} fill={color} />;
          // Hatch: outline plus parallel lines, at the bit's cut width. The pattern lives in the
          // same coordinate system (Y up) the engine uses for the angle.
          const { spacing: e, angle } = g.hatch;
          const pid = `hatch-${i}`;
          return (
            <g key={`g${i}`}>
              <defs>
                <pattern id={pid} patternUnits="userSpaceOnUse" width={e} height={e} patternTransform={`rotate(${angle})`}>
                  <rect x={0} y={e / 2 - lineWidth / 2} width={e} height={lineWidth} fill={color} />
                </pattern>
              </defs>
              <path d={pathOf(g.region as Region)} fill={`url(#${pid})`} stroke={color} strokeWidth={lineWidth} />
            </g>
          );
        })}
        {[...L.cutouts, ...L.holes].map((v, i) => (
          <path key={`v${i}`} d={pathOf(v.region as Region)} fill={THROUGH_COLOR} />
        ))}
      </g>
    </svg>
  );
}

/**
 * Hides the leftover stock outside the outline: shows the part and the outer cut's band
 * (with the tabs), as it will come off the machine.
 */
function pieceMask(result: GenerateResult | null, d: number): React.CSSProperties | undefined {
  const L = result?.layout;
  if (!L?.profile) return undefined;
  const { width: W, height: H } = L.stock;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><g transform="translate(0 ${H}) scale(1 -1)"><path d="${pathOf(L.part as Region)}" fill="#fff" stroke="#fff" stroke-width="${2 * d + 0.6}" stroke-linejoin="round"/></g></svg>`;
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  return { maskImage: url, WebkitMaskImage: url, maskSize: "100% 100%", WebkitMaskSize: "100% 100%", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat" };
}

// ------------------------------------------------------------------ interactive overlay

interface OverlayProps {
  spec: PlateSpecInput;
  block: { width: number; height: number };
  scale: number;
  zoom: number;
  boxes: Map<ElementId, Box>;
  issues: UiIssue[];
  tool: Tool;
  sel: ElementId | null;
  /** All selected elements (primary first). */
  selected: ElementId[];
  setSel(id: ElementId | null): void;
  onPick(id: ElementId, additive: boolean): void;
  onAlign(how: Align): void;
  onMoveMany(ids: ElementId[], dx: number, dy: number): void;
  editing: ElementId | null;
  setEditing(id: ElementId | null): void;
  focusKey: string | null;
  onAdd(x: number, y: number): void;
  onCurve(nodes: CurveNode[], closed: boolean): void;
  onCurveNodes(id: ElementId, nodes: CurveNode[]): void;
  onMove(id: ElementId, cx: number, cy: number): void;
  onText(id: ElementId, text: string): void;
  onDuplicate(id: ElementId): void;
  onDelete(id: ElementId): void;
}

function Overlay(p: OverlayProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: ElementId; x0: number; y0: number; dx: number; dy: number; guides: Guide[] } | null>(null);
  const grid = useSnapGrid();
  const rulersOn = useRulersOn();
  /** With the rulers on, the size labels sit outside them (rulers hug the board edges). */
  const dimAt = (inset: number) => (rulersOn ? -54 : inset - 30);
  const m = margin(p.spec);
  const s = p.scale;
  const H = p.block.height;
  // part mm → px inside the board
  const px = (b: Box) => ({ left: (b.cx - b.w / 2 + m) * s, top: (H - (b.cy + b.h / 2 + m)) * s, width: b.w * s, height: b.h * s });
  /** Converts screen pixels to mm (the board may be zoomed). */
  const mmPerPx = () => {
    const r = ref.current!.getBoundingClientRect();
    return p.block.width / r.width;
  };
  const toMm = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * p.block.width - m, y: (1 - (e.clientY - r.top) / r.height) * p.block.height - m };
  };

  const geom: Geom = { toPx: (x, y) => ({ x: (x + m) * s, y: (H - (y + m)) * s }), toMm, mmPerPx };
  const selCurve = p.sel && p.tool === "select" && !drag ? elementOf(p.spec, p.sel) : null;
  const curveEl = selCurve && "type" in selCurve && selCurve.type === "curve" ? selCurve : null;

  const errorTargets = new Set(p.issues.filter((i) => i.level === "error" && i.target).map((i) => i.target!));
  const focused = p.issues.find((i) => i.key === p.focusKey)?.target ?? null;
  const markers = p.issues.filter((i) => i.pct !== undefined && i.target && p.boxes.has(i.target));
  // Dragging a selected element brings the other selected ones along.
  const group = drag && p.selected.includes(drag.id) ? p.selected : drag ? [drag.id] : [];

  const down = (id: ElementId) => (e: RPointerEvent) => {
    if (p.tool !== "select" || e.button !== 0) return;
    e.stopPropagation();
    if (e.shiftKey) {
      p.onPick(id, true);
      return;
    }
    if (!p.selected.includes(id)) p.onPick(id, false);
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointer: the drag continues through the board's events */
    }
    setDrag({ id, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, guides: [] });
  };
  /** Boxes in stock mm (X0 Y0 = bottom-left of the board, like the rulers). */
  const stockRect = (b: Box): Rect => ({ x: b.cx - b.w / 2 + m, y: b.cy - b.h / 2 + m, width: b.w, height: b.h });
  const move = (e: RPointerEvent) => {
    if (!drag) return;
    const k = mmPerPx();
    let dx = (e.clientX - drag.x0) * k;
    let dy = -(e.clientY - drag.y0) * k;
    let guides: Guide[] = [];
    // Snap the moving selection to the grid, the board/sign edges and centers and the other elements (Alt = free).
    const moving = group.map((id) => p.boxes.get(id)).filter((b): b is Box => !!b);
    if (!e.altKey && moving.length) {
      const rs = moving.map(stockRect);
      const x = Math.min(...rs.map((r) => r.x));
      const y = Math.min(...rs.map((r) => r.y));
      const u = { x, y, width: Math.max(...rs.map((r) => r.x + r.width)) - x, height: Math.max(...rs.map((r) => r.y + r.height)) - y };
      const others = [...p.boxes].filter(([id]) => !group.includes(id)).map(([, b]) => stockRect(b));
      const targets = rectTargets([{ x: 0, y: 0, width: p.block.width, height: p.block.height }, { x: m, y: m, width: p.spec.width, height: p.spec.height }, ...others]);
      const snapped = snapRect({ ...u, x: x + dx, y: y + dy }, { grid, targets, tol: SNAP_PX * k });
      dx = snapped.rect.x - x;
      dy = snapped.rect.y - y;
      guides = snapped.guides;
    }
    setDrag({ ...drag, dx, dy, guides });
  };
  const up = () => {
    if (!drag) return;
    const b = p.boxes.get(drag.id);
    if (b && Math.hypot(drag.dx, drag.dy) > 0.5) {
      if (group.length > 1) p.onMoveMany(group, drag.dx, drag.dy);
      else p.onMove(drag.id, b.cx + drag.dx, b.cy + drag.dy);
    }
    setDrag(null);
  };

  const piece = { left: m * s, top: m * s, width: p.spec.width * s, height: p.spec.height * s };

  return (
    <div
      ref={ref}
      className={`create-overlay ${p.tool !== "select" ? "create-overlay--add" : ""}`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        if (p.tool !== "select") {
          const { x, y } = toMm(e);
          p.onAdd(Math.max(0, Math.min(p.spec.width, x)), Math.max(0, Math.min(p.spec.height, y)));
        } else {
          p.setSel(null);
          p.setEditing(null);
        }
      }}
      onPointerMove={move}
      onPointerUp={up}
    >
      {/* Part dimensions */}
      <div className="create-dim create-dim--w mono" style={{ left: piece.left, width: piece.width, top: dimAt(piece.top) }}>
        {fmt(p.spec.width)} mm
      </div>
      <div className="create-dim create-dim--h mono" style={{ top: piece.top, height: piece.height, left: dimAt(piece.left) }}>
        <span>{fmt(p.spec.height)} mm</span>
      </div>

      {[...p.boxes].map(([id, b]) => {
        const d = drag && group.includes(id) ? drag : null;
        const r = px({ ...b, cx: b.cx + (d?.dx ?? 0), cy: b.cy + (d?.dy ?? 0) });
        const isSel = p.selected.includes(id);
        const err = errorTargets.has(id);
        const op = elementOf(p.spec, id)?.operation ?? "normal";
        const cls = ["create-el", isSel ? "is-sel" : "", err ? "is-error" : "", focused === id ? "is-focus" : "", d ? "is-drag" : "", op !== "normal" ? "is-ghost" : ""].join(" ");
        const text = id.startsWith("t:") ? p.spec.texts?.[parseId(id).index] : undefined;
        return (
          <div
            key={id}
            data-id={id}
            className={cls}
            style={r}
            onPointerDown={down(id)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (text) p.setEditing(id);
            }}
          >
            {p.editing === id && text ? (
              <InlineText
                value={text.content}
                font={fontOf(text.font).css}
                size={Math.max(12, Math.min(r.height * 0.8, 120))}
                onDone={(v) => {
                  p.onText(id, v);
                  p.setEditing(null);
                }}
              />
            ) : null}
          </div>
        );
      })}

      {drag ? <SnapGuides guides={drag.guides} width={p.block.width} height={p.block.height} scale={s} zoom={p.zoom} /> : null}

      {p.sel && p.boxes.has(p.sel) && !drag && p.editing !== p.sel ? (
        <div className="create-seltools" style={selToolsPos(px(p.boxes.get(p.sel)!), !!curveEl, p.block.height * s)} onPointerDown={(e) => e.stopPropagation()}>
          {ALIGNS.filter(([how]) => (how === "hdist" || how === "vdist" ? p.selected.length >= 3 : true)).map(([how, label, Icon]) => {
            const t = p.selected.length > 1 ? `${label} (selection)` : `${label} on the ${p.spec.type === "lettering" ? "board" : "sign"}`;
            return (
              <button key={how} aria-label={t} title={t} onClick={() => p.onAlign(how)}>
                <Icon size={14} strokeWidth={1.75} />
              </button>
            );
          })}
          <span className="create-seltools__sep" aria-hidden />
          {p.selected.length === 1 ? (
            <button aria-label="Duplicate (Ctrl+D)" title="Duplicate (Ctrl+D)" onClick={() => p.onDuplicate(p.sel!)}>
              <Copy size={14} strokeWidth={1.75} />
            </button>
          ) : null}
          <button aria-label="Delete (Del)" title="Delete (Del)" onClick={() => p.onDelete(p.sel!)}>
            <Trash2 size={14} strokeWidth={1.75} />
          </button>
        </div>
      ) : null}

      {curveEl && p.sel ? (
        <CurveEditor geom={geom} ox={curveEl.x} oy={curveEl.y} nodes={curveEl.nodes} closed={curveEl.closed ?? true} onChange={(n) => p.onCurveNodes(p.sel!, n)} />
      ) : null}
      {p.tool === "pen" ? <PenLayer geom={geom} onCommit={p.onCurve} /> : null}

      {markers.map((i) => {
        const r = px(p.boxes.get(i.target!)!);
        return (
          <div key={i.key} className="create-marker" style={{ left: r.left + r.width - 6, top: r.top + r.height - 6 }} title={i.title}>
            <span className="create-marker__tag mono">≈{Math.max(1, Math.round(i.pct!))}% stays</span>
            <span className="create-marker__dot" />
          </div>
        );
      })}
    </div>
  );
}

/**
 * Action bar above the selection; moves below when it would fall outside the board or, on a
 * curve, on top of the nodes and handles at the top.
 */
function selToolsPos(r: { left: number; top: number; width: number; height: number }, curve: boolean, boardH: number): React.CSSProperties {
  const above = r.top - 46;
  const below = r.top + r.height + 12;
  const useBelow = (above < -20 || curve) && below + 40 < boardH + 60;
  return { left: r.left, top: useBelow ? below : above };
}

function InlineText({ value, font, size, onDone }: { value: string; font: string; size: number; onDone(v: string): void }) {
  const [v, setV] = useState(value);
  const done = useRef(false);
  const finish = (val: string) => {
    if (done.current) return;
    done.current = true;
    onDone(val.trim());
  };
  return (
    <input
      className="create-inline"
      autoFocus
      value={v}
      maxLength={60}
      aria-label="Edit text"
      style={{ fontFamily: font, fontSize: size }}
      onPointerDown={(e) => e.stopPropagation()}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => finish(v)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") finish(v);
        if (e.key === "Escape") finish(value);
      }}
    />
  );
}

