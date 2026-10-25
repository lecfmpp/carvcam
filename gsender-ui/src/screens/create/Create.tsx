import type { GenerateResult, PlateSpecInput } from "@gsender-next/cam-engine";
import archivoUrl from "@gsender-next/cam-engine/fonts/archivoblack/ArchivoBlack-Regular.ttf?url";
import bebasUrl from "@gsender-next/cam-engine/fonts/bebasneue/BebasNeue-Regular.ttf?url";
import pacificoUrl from "@gsender-next/cam-engine/fonts/pacifico/Pacifico-Regular.ttf?url";
import { Circle, Copy, FileUp, Minus, MousePointer2, Square, Trash2, Type } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { TopBar } from "../../components/TopBar";
import { useEngine } from "../../engine/useEngine";
import { bitById, materialById, THROUGH_COLOR, type Material } from "../../lib/catalog";
import { useDesign } from "../../state/design";
import { useActiveMachine, useWorkshop } from "../../state/workshop";
import { Board } from "../../stage/Board";
import { SimCanvas } from "../../stage/SimCanvas";
import { fitScale, Stage } from "../../stage/Stage";
import { ThreeView } from "../../stage/ThreeView";
import { machineName } from "../../lib/catalog";
import { AssistantBar } from "./AssistantBar";
import { addElement, deleteElement, duplicateElement, elementBoxes, fontOf, margin, moveElement, parseId, type Box, type ElementId, type Tool } from "./elements";
import { buildIssues, type UiIssue } from "./issues";
import { CreatePanel } from "./Panel";
import { importSvgFile, isSvgFile, pickSvgFile } from "./svgImport";
import "./create.css";

// As mesmas fontes do motor, para o seletor de fontes e a edição no quadro.
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
  ["line", "Line", Minus, "L"],
];
const TOOL_NAME: Record<Tool, string> = { select: "", text: "text", rect: "rectangle", circle: "circle", line: "line" };

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

  // O resultado mostrado é o da especificação atual ou o último que chegou (enquanto regenera).
  const result = eng.result;
  const issues = useMemo(
    () => buildIssues(result, { spec, bit, ownedBits, machineName: machineName(machine) }),
    // Os avisos referem-se à especificação que gerou o resultado; recalcular só quando ele muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result, bit, ownedBits, machine],
  );
  const errors = issues.filter((i) => i.level === "error").length;
  const warnings = issues.filter((i) => i.level === "warning").length;
  const boxes = useMemo(() => elementBoxes(spec, result), [spec, result]);

  // Seleção some quando o elemento deixa de existir (apagado pelo assistente, por exemplo).
  useEffect(() => {
    if (sel && !boxes.has(sel)) setSel(null);
  }, [boxes, sel]);

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
    patchSpec((s) => deleteElement(s, id));
    setSel(null);
  };
  const duplicate = (id: ElementId) => {
    const [next, nid] = duplicateElement(spec, id, boxes.get(id));
    if (!nid) return;
    patchSpec(() => next);
    setSel(nid);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        assistantInput.current?.focus();
        return;
      }
      if (isTyping(e.target)) return;
      if (e.key === "Escape") {
        setSel(null);
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
  const block = result?.layout.bloco ?? { largura: spec.largura + 2 * m, altura: spec.altura + 2 * m, espessura: spec.espessura };
  const sameBlock = result && Math.abs(result.layout.bloco.largura - (spec.largura + 2 * m)) < 0.01 && Math.abs(result.layout.bloco.altura - (spec.altura + 2 * m)) < 0.01;
  const caption =
    tool !== "select" ? `Click on the ${spec.tipo === "letreiro" ? "board" : "sign"} to add a ${TOOL_NAME[tool]}` : eng.busy ? "Re-checking…" : `Simulated cut · ${bit?.name ?? "bit"}`;

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
        const f = [...e.dataTransfer.files].find(isSvgFile) ?? e.dataTransfer.files[0] ?? null;
        void importSvg(f);
      }}
    >
      <div className="dotgrid" />
      <TopBar variant="job" step="create" reachable={errors ? ["create"] : ["create", "prepare"]} />
      <Stage
        caption={caption}
        overlay={
          <>
            <ToolRail tool={tool} setTool={setTool} onImport={() => void pickSvgFile().then(importSvg)} />
            {dropping ? <div className="create-drop">Drop the SVG to add it to the {spec.tipo === "letreiro" ? "board" : "sign"}</div> : null}
            <Legend spec={spec} result={result} material={material} pro={mode === "pro"} bitD={bit?.d} flagged={issues.length} />
          </>
        }
        bottomLeft={<AssistantBar inputRef={assistantInput} issues={issues} bitName={bit?.name ?? "bit"} materialName={`${spec.espessura} mm ${material.id}`} machineName={machineName(machine)} />}
        render={(api) => {
          if (api.view === "3d") {
            return eng.sim ? (
              <ThreeView sim={eng.sim} thickness={block.espessura} material={material} board={{ width: block.largura, height: block.altura }} zoom={api.zoom} spin={api.spin} size={api.size} />
            ) : (
              <div className="muted">Simulating the cut…</div>
            );
          }
          const s = fitScale(api.size, block.largura, block.altura, { x: 260, y: 280 });
          return (
            <Board width={block.largura} height={block.altura} scale={s} zoom={api.zoom} showOrigin={false}>
              <div className="create-piece" style={pieceMask(result, bit?.d ?? 3.175)}>
                {eng.sim ? (
                  <SimCanvas sim={eng.sim} thickness={block.espessura} material={material} scale={s} board={{ width: block.largura, height: block.altura }} />
                ) : null}
                {(!eng.sim || eng.busy || !sameBlock) && result ? <VectorPreview result={result} material={material} faded={!!eng.sim} /> : null}
                {!result ? <div style={{ position: "absolute", inset: m * s, background: material.face, borderRadius: 4 }} /> : null}
              </div>
              <Overlay
                spec={spec}
                block={block}
                scale={s}
                zoom={api.zoom}
                boxes={boxes}
                issues={issues}
                tool={tool}
                sel={sel}
                setSel={setSel}
                editing={editing}
                setEditing={setEditing}
                focusKey={focusKey}
                onAdd={(x, y) => {
                  if (tool === "select") return;
                  const [next, id] = addElement(spec, tool, x, y);
                  patchSpec(() => next);
                  setSel(id);
                  setTool("select");
                  if (tool === "text") setEditing(id);
                }}
                onMove={(id, cx, cy) => patchSpec((sp) => moveElement(sp, id, cx, cy, boxes.get(id)))}
                onText={(id, text) => {
                  const { index } = parseId(id);
                  patchSpec((sp) => ({ ...sp, texto: sp.texto?.map((t, i) => (i === index ? { ...t, conteudo: text || t.conteudo } : t)) }));
                }}
                onDuplicate={duplicate}
                onDelete={remove}
              />
            </Board>
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
        setSel={setSel}
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

function Legend({ spec, result, material, pro, bitD, flagged }: { spec: PlateSpecInput; result: GenerateResult | null; material: Material; pro: boolean; bitD?: number; flagged: number }) {
  const depths = [result?.layout.relevo?.profundidade ?? 0, ...(result?.layout.gravados.map((g) => g.profundidade) ?? [])].filter((d) => d > 0 && d < spec.espessura);
  const lowered = depths.length ? Math.max(...depths) : 0;
  const sign = spec.tipo !== "letreiro";
  const rows: [string, React.CSSProperties][] = [
    ["Face, not cut", { background: material.face }],
    ...(sign ? ([[lowered ? `Lowered · ${fmt(lowered)} mm` : "Lowered", { background: material.recess }]] as [string, React.CSSProperties][]) : []),
    ["Cut through", { background: THROUGH_COLOR, borderColor: "rgba(255,255,255,.18)" }],
    ...(sign ? ([["Holding tabs", { background: material.side }]] as [string, React.CSSProperties][]) : []),
    ["Material left", { background: "repeating-linear-gradient(135deg,#F2C14E 0 2px,transparent 2px 5px)", borderColor: "#F2C14E" }],
  ];
  return (
    <div className="create-legend" aria-label="Legend">
      {rows.map(([label, style]) => (
        <div key={label} className="create-legend__row">
          <span className="create-legend__sw" style={style} />
          {label}
        </div>
      ))}
      {pro && bitD ? (
        <div className="create-legend__pro mono">
          Bit ⌀ {fmt(bitD)} mm · inside corners r {fmt(bitD / 2)}
          <br />
          Stepover 40% · {flagged} check{flagged === 1 ? "" : "s"} flagged
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
 * Desenho rápido a partir das regiões do motor: aparece na hora, enquanto a simulação do corte
 * (mais lenta) ainda está sendo calculada.
 */
function VectorPreview({ result, material, faded }: { result: GenerateResult; material: Material; faded: boolean }) {
  const L = result.layout;
  const { largura: W, altura: H } = L.bloco;
  return (
    <svg className="create-vector" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ opacity: faded ? 0.9 : 1 }} aria-hidden>
      <g transform={`translate(0 ${H}) scale(1 -1)`} fillRule="evenodd">
        <path d={pathOf(L.peca as Region)} fill={material.face} />
        {L.relevo ? <path d={pathOf(L.relevo.regiao as Region)} fill={material.recess} /> : null}
        {L.gravados.map((g, i) => (
          <path key={`g${i}`} d={pathOf(g.regiao as Region)} fill={g.profundidade >= L.bloco.espessura ? THROUGH_COLOR : material.recess} />
        ))}
        {[...L.vazados, ...L.furos].map((v, i) => (
          <path key={`v${i}`} d={pathOf(v.regiao as Region)} fill={THROUGH_COLOR} />
        ))}
      </g>
    </svg>
  );
}

/**
 * Esconde a sobra de material fora do contorno: mostra a peça e a faixa do corte externo
 * (com as abas), como ela vai sair da máquina.
 */
function pieceMask(result: GenerateResult | null, d: number): React.CSSProperties | undefined {
  const L = result?.layout;
  if (!L?.perfil) return undefined;
  const { largura: W, altura: H } = L.bloco;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><g transform="translate(0 ${H}) scale(1 -1)"><path d="${pathOf(L.peca as Region)}" fill="#fff" stroke="#fff" stroke-width="${2 * d + 0.6}" stroke-linejoin="round"/></g></svg>`;
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  return { maskImage: url, WebkitMaskImage: url, maskSize: "100% 100%", WebkitMaskSize: "100% 100%", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat" };
}

// ------------------------------------------------------------------ interactive overlay

interface OverlayProps {
  spec: PlateSpecInput;
  block: { largura: number; altura: number };
  scale: number;
  zoom: number;
  boxes: Map<ElementId, Box>;
  issues: UiIssue[];
  tool: Tool;
  sel: ElementId | null;
  setSel(id: ElementId | null): void;
  editing: ElementId | null;
  setEditing(id: ElementId | null): void;
  focusKey: string | null;
  onAdd(x: number, y: number): void;
  onMove(id: ElementId, cx: number, cy: number): void;
  onText(id: ElementId, text: string): void;
  onDuplicate(id: ElementId): void;
  onDelete(id: ElementId): void;
}

function Overlay(p: OverlayProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: ElementId; x0: number; y0: number; dx: number; dy: number } | null>(null);
  const m = margin(p.spec);
  const s = p.scale;
  const H = p.block.altura;
  // mm da peça → px dentro do quadro
  const px = (b: Box) => ({ left: (b.cx - b.w / 2 + m) * s, top: (H - (b.cy + b.h / 2 + m)) * s, width: b.w * s, height: b.h * s });
  /** Converte pixels da tela para mm (o quadro pode estar com zoom). */
  const mmPerPx = () => {
    const r = ref.current!.getBoundingClientRect();
    return p.block.largura / r.width;
  };
  const toMm = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * p.block.largura - m, y: (1 - (e.clientY - r.top) / r.height) * p.block.altura - m };
  };

  const errorTargets = new Set(p.issues.filter((i) => i.level === "error" && i.target).map((i) => i.target!));
  const focused = p.issues.find((i) => i.key === p.focusKey)?.target ?? null;
  const markers = p.issues.filter((i) => i.pct !== undefined && i.target && p.boxes.has(i.target));

  const down = (id: ElementId) => (e: RPointerEvent) => {
    if (p.tool !== "select" || e.button !== 0) return;
    e.stopPropagation();
    p.setSel(id);
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ponteiro sintético: o arrasto segue pelos eventos do quadro */
    }
    setDrag({ id, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0 });
  };
  const move = (e: RPointerEvent) => {
    if (!drag) return;
    const k = mmPerPx();
    setDrag({ ...drag, dx: (e.clientX - drag.x0) * k, dy: -(e.clientY - drag.y0) * k });
  };
  const up = () => {
    if (!drag) return;
    const b = p.boxes.get(drag.id);
    if (b && Math.hypot(drag.dx, drag.dy) > 0.5) p.onMove(drag.id, b.cx + drag.dx, b.cy + drag.dy);
    setDrag(null);
  };

  const piece = { left: m * s, top: m * s, width: p.spec.largura * s, height: p.spec.altura * s };

  return (
    <div
      ref={ref}
      className={`create-overlay ${p.tool !== "select" ? "create-overlay--add" : ""}`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        if (p.tool !== "select") {
          const { x, y } = toMm(e);
          p.onAdd(Math.max(0, Math.min(p.spec.largura, x)), Math.max(0, Math.min(p.spec.altura, y)));
        } else {
          p.setSel(null);
          p.setEditing(null);
        }
      }}
      onPointerMove={move}
      onPointerUp={up}
    >
      {/* Medidas da peça */}
      <div className="create-dim create-dim--w mono" style={{ left: piece.left, width: piece.width, top: piece.top - 30 }}>
        {fmt(p.spec.largura)} mm
      </div>
      <div className="create-dim create-dim--h mono" style={{ top: piece.top, height: piece.height, left: piece.left - 30 }}>
        <span>{fmt(p.spec.altura)} mm</span>
      </div>

      {[...p.boxes].map(([id, b]) => {
        const d = drag?.id === id ? drag : null;
        const r = px({ ...b, cx: b.cx + (d?.dx ?? 0), cy: b.cy + (d?.dy ?? 0) });
        const isSel = p.sel === id;
        const err = errorTargets.has(id);
        const cls = ["create-el", isSel ? "is-sel" : "", err ? "is-error" : "", focused === id ? "is-focus" : "", d ? "is-drag" : ""].join(" ");
        const text = id.startsWith("t:") ? p.spec.texto?.[parseId(id).index] : undefined;
        return (
          <div
            key={id}
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
                value={text.conteudo}
                font={fontOf(text.fonte).css}
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

      {p.sel && p.boxes.has(p.sel) && !drag && p.editing !== p.sel ? (
        <div className="create-seltools" style={{ left: px(p.boxes.get(p.sel)!).left, top: px(p.boxes.get(p.sel)!).top - 46 }} onPointerDown={(e) => e.stopPropagation()}>
          <button aria-label="Duplicate (Ctrl+D)" title="Duplicate (Ctrl+D)" onClick={() => p.onDuplicate(p.sel!)}>
            <Copy size={14} strokeWidth={1.75} />
          </button>
          <button aria-label="Delete (Del)" title="Delete (Del)" onClick={() => p.onDelete(p.sel!)}>
            <Trash2 size={14} strokeWidth={1.75} />
          </button>
        </div>
      ) : null}

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

