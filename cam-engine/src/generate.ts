import { fmt, hasErrors, type Warning } from "./warnings.js";
import { PathBuilder } from "./cam/builder.js";
import { hatch, peck, pocket, profile, vcarve, type Direction } from "./cam/operations.js";
import { area, bounds, intersection, offset, unreachable, type Region } from "./geometry/clip.js";
import { buildLayout, type CutElement, type FontMap, type Layout } from "./layout.js";
import { resolveSienci, type ManualAdjustment, type SienciConfig } from "./catalog/sienci/config.js";
import { cutParams, type CutParams } from "./materials.js";
import { postGrbl, type PostOperation } from "./post/grbl.js";
import {
  MachineSchema,
  PlateSpecSchema,
  ToolSchema,
  type Machine,
  type MachineInput,
  type PlateSpecInput,
  type Tool,
  type ToolInput,
} from "./schema.js";
import { verifyGcode, type VerifyResult } from "./verify.js";

export interface GenerateOptions {
  fonts: FontMap;
  /** Fresa principal (gravação e relevo). Padrão: reta de 1/8". */
  tool?: ToolInput;
  /** Fresa para furos e recortes. Padrão: a mesma da principal. */
  cutoutTool?: ToolInput;
  machine?: MachineInput;
  cut?: Partial<CutParams>;
  /** Parâmetros da fresa de recorte. Padrão: os mesmos de `cut`. */
  cutoutCut?: Partial<CutParams>;
  /**
   * Máquina, cabeçote e fresas do catálogo Sienci Labs. Quando presente, substitui
   * `machine`, `tool`, `cutoutTool`, `cut` e `cutoutCut` pelos dados do catálogo
   * e pela tabela oficial de avanço e rotação.
   */
  sienci?: SienciConfig;
  direction?: Direction;
  tabs?: { count?: number; width?: number; height?: number };
  title?: string;
}

export interface OperationInfo {
  name: string;
  type: "engrave" | "relief" | "cutout" | "hole" | "profile";
  tool: number;
  depth: number;
}

export interface GenerateResult {
  /** Verdadeiro quando não há erros e o G-code passou no verificador. */
  ok: boolean;
  gcode: string;
  warnings: Warning[];
  operations: OperationInfo[];
  verification: VerifyResult | null;
  params: { main: CutParams; cutout: CutParams };
  tools: Tool[];
  /** Ajustes que o usuário faz à mão antes de cortar (ex.: dial do Makita). */
  manualAdjustments: ManualAdjustment[];
  /** De onde vieram os parâmetros de corte. */
  paramsSource: string;
  /** Geometria em coordenadas do bloco, para a prévia 2D/3D da UI. */
  layout: Layout;
}

export function generatePlate(input: PlateSpecInput, options: GenerateOptions): GenerateResult {
  const spec = PlateSpecSchema.parse(input);
  const sienci = options.sienci ? resolveSienci(options.sienci, spec.material) : null;
  const opts: GenerateOptions = sienci
    ? { ...options, machine: sienci.machine, tool: sienci.tool, cutoutTool: sienci.cutoutTool, cut: sienci.cut, cutoutCut: sienci.cutoutCut }
    : options;
  const tool = ToolSchema.parse(opts.tool ?? {});
  let cutTool = opts.cutoutTool ? ToolSchema.parse(opts.cutoutTool) : tool;
  // Duas fresas precisam de números (T) diferentes para a troca de ferramenta funcionar.
  if (cutTool !== tool && cutTool.id === tool.id) cutTool = { ...cutTool, id: tool.id + 1 };
  const machine: Machine = MachineSchema.parse(opts.machine ?? {});
  const direction = opts.direction ?? "conventional";
  const layout = buildLayout(spec, opts.fonts, tool, cutTool, machine);
  const warnings = [...(sienci?.warnings ?? []), ...layout.warnings];

  const pMain = cutParams(spec.material, tool, machine, opts.cut);
  const pCut = cutTool === tool ? pMain : cutParams(spec.material, cutTool, machine, opts.cutoutCut ?? opts.cut);
  const tools = cutTool.id === tool.id ? [tool] : [tool, cutTool];
  const manualAdjustments = sienci?.manualAdjustments ?? [];
  const paramsSource = sienci?.source ?? "Cálculo genérico por avanço por dente";
  const base = {
    ok: false,
    warnings,
    operations: [],
    verification: null,
    params: { main: pMain, cutout: pCut },
    tools,
    manualAdjustments,
    paramsSource,
    layout,
  };

  if (hasErrors(warnings)) return { ...base, gcode: "" };

  const feedsFor = (p: CutParams) => ({ feed: p.feed, plunge: p.plunge, retractHeight: machine.retractHeight, safeHeight: machine.safeHeight });
  const ops: PostOperation[] = [];
  const operations: OperationInfo[] = [];

  // A posição da fresa continua de uma operação para a outra, para ordenar pelo mais próximo.
  let pos = { x: 0, y: 0 };
  const run = (name: string, type: OperationInfo["type"], t: Tool, p: CutParams, depth: number, body: (b: PathBuilder) => void) => {
    const b = new PathBuilder(feedsFor(p));
    b.x = pos.x;
    b.y = pos.y;
    body(b);
    b.safe();
    if (b.moves.length === 0) return;
    pos = { x: b.x, y: b.y };
    ops.push({ name, tool: t, rpm: p.rpm, moves: b.moves });
    operations.push({ name, type, tool: t.id, depth });
  };

  const rMain = tool.diameter / 2;
  const rCut = cutTool.diameter / 2;

  // 1. Gravações (rasas, com a fresa principal).
  for (const g of layout.engraved) {
    if (g.hatch) {
      const h = g.hatch;
      const width = tool.type === "vbit" ? 2 * g.depth * Math.tan(((tool.angle ?? 60) * Math.PI) / 360) : tool.diameter;
      if (h.spacing <= width) {
        const suggested = Math.ceil(width * 1.8 * 2) / 2;
        warnings.push({
          code: "HATCH_TOO_DENSE",
          severity: "warning",
          message: `As linhas da hachura de ${g.label} ficam a ${fmt(h.spacing)} mm, menos que a largura do corte (${fmt(width)} mm); a área vai sair toda rebaixada.`,
          suggestion: `Use pelo menos ${fmt(suggested)} mm entre as linhas.`,
          element: g.ref,
          fix: g.ref ? { element: g.ref, field: "hatch.spacing", value: suggested } : undefined,
        });
      }
      run(`Hachura: ${g.label}`, "engrave", tool, pMain, g.depth, (b) => {
        hatch(b, g.region, { radius: tool.type === "vbit" ? 0 : rMain, depth: g.depth, stepdown: pMain.stepdown, spacing: h.spacing, angle: h.angle, direction });
      });
      continue;
    }
    if (tool.type === "vbit") {
      const half = ((tool.angle ?? 60) * Math.PI) / 360;
      // Limite: o pedido, o comprimento de corte, a parte cônica da fresa e o material.
      const max = Math.min(g.depth, tool.cutLength, rMain / Math.tan(half), spec.thickness - 0.5);
      run(`V-carve: ${g.label}`, "engrave", tool, pMain, max, (b) => {
        const res = vcarve(b, g.region, { halfAngle: half, maxDepth: max, stepdown: pMain.stepdown, direction });
        if (res.flatArea > 1) {
          warnings.push({
            code: "VCARVE_FLAT_BOTTOM",
            severity: "warning",
            message: `Partes largas de ${g.label} passariam de ${fmt(max)} mm de profundidade; ali o fundo fica plano e é limpo com a fresa em V (mais demorado).`,
            suggestion: max < g.depth ? "A fresa não desce mais que isso. Use uma fresa em V maior ou afine o desenho." : `Aumente a profundidade máxima para cerca de ${fmt(Math.min(tool.cutLength, spec.thickness * 0.6))} mm, ou afine o desenho.`,
            data: { flatArea: Math.round(res.flatArea) },
            element: g.ref,
          });
        }
      });
      continue;
    }
    checkDetail(g, rMain, tool, warnings, "engrave");
    run(`Gravação: ${g.label}`, "engrave", tool, pMain, g.depth, (b) => {
      pocket(b, g.region, { radius: rMain, stepover: pMain.stepover, depth: g.depth, stepdown: pMain.stepdown, direction });
    });
  }

  // 2. Fundo do relevo.
  if (layout.relief) {
    const rel = layout.relief;
    checkDetail(rel, rMain, tool, warnings, "relief");
    run("Rebaixo do fundo (relevo)", "relief", tool, pMain, rel.depth, (b) => {
      pocket(b, rel.region, { radius: rMain, stepover: pMain.stepover, depth: rel.depth, stepdown: pMain.stepdown, direction });
    });
  }

  // 3. Vazados (estêncil), 4. furos e rasgos, 5. contorno externo: fresa de recorte.
  for (const v of layout.cutouts) {
    checkDetail(v, rCut, cutTool, warnings, "cutout");
    run(`Vazado: ${v.label}`, "cutout", cutTool, pCut, v.depth, (b) => {
      profile(b, v.region, { radius: rCut, depth: v.depth, stepdown: pCut.stepdown, direction, side: "inside" });
    });
  }

  for (const f of layout.holes) {
    const bb = bounds(f.region);
    const d = Math.min(bb.maxX - bb.minX, bb.maxY - bb.minY);
    run(`Furo: ${f.label}`, "hole", cutTool, pCut, f.depth, (b) => {
      if (d <= cutTool.diameter + 0.1) peck(b, { x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 }, f.depth, pCut.stepdown);
      else pocket(b, f.region, { radius: rCut, stepover: pCut.stepover, depth: f.depth, stepdown: pCut.stepdown, direction });
    });
  }

  if (layout.profile) {
    const per = layout.profile;
    const tabs = {
      count: opts.tabs?.count ?? 4,
      width: opts.tabs?.width ?? 6,
      height: opts.tabs?.height ?? round1(Math.min(3, spec.thickness * 0.35)),
      thickness: spec.thickness,
    };
    run(`Recorte: ${per.label}`, "profile", cutTool, pCut, per.depth, (b) => {
      const res = profile(b, per.region, { radius: rCut, depth: per.depth, stepdown: pCut.stepdown, direction, side: "outside", tabs });
      if (res.outlinesWithoutTabs > 0) {
        warnings.push({
          code: "SMALL_PART_WITHOUT_TABS",
          severity: "warning",
          message: `${res.outlinesWithoutTabs} peça(s) são pequenas demais para abas de fixação e vão se soltar no fim do corte.`,
          suggestion: "Prenda essas partes com fita dupla-face antes de cortar, ou aumente o tamanho.",
        });
      }
    });
  }

  const gcode = postGrbl(
    {
      title: opts.title ?? defaultTitle(spec.texts.map((t) => t.content)),
      stock: layout.stock,
      safeHeight: machine.safeHeight,
      notes: [`Maquina: ${machine.name}`, `Parametros: ${paramsSource}`, ...manualAdjustments.map((a) => a.message)],
    },
    ops,
  );

  const rMax = Math.max(rMain, rCut);
  const verification = verifyGcode(gcode, {
    xMin: -rMax - 1,
    xMax: layout.stock.width + rMax + 1,
    yMin: -rMax - 1,
    yMax: layout.stock.height + rMax + 1,
    zMin: -(spec.thickness + 1),
    zMax: machine.safeHeight + 0.001,
    maxFeed: machine.maxFeedXY,
    rpmMin: machine.rpmMin,
    rpmMax: machine.rpmMax,
  });

  return { ...base, ok: verification.ok && !hasErrors(warnings), gcode, operations, verification };
}

/**
 * Avisa quando a fresa não alcança parte do desenho: traços mais finos que a fresa
 * (somem na gravação) ou vãos entre letras mais estreitos que ela (sobra material no relevo).
 */
function checkDetail(el: CutElement, r: number, tool: Tool, warnings: Warning[], mode: "engrave" | "relief" | "cutout") {
  const total = area(el.region);
  if (total <= 0) return;
  if (area(offset(el.region, -r)) <= 0) {
    warnings.push({
      code: "ELEMENT_NOT_MACHINABLE",
      severity: "error",
      message: `Os traços de ${el.label} são mais finos que a fresa de ${fmt(tool.diameter, 2)} mm; nada seria cortado.`,
      suggestion: "Aumente o tamanho, use uma fonte mais grossa ou uma fresa mais fina.",
      element: el.ref,
    });
    return;
  }
  const missed: Region = offset(unreachable(el.region, r), -0.1 * tool.diameter);
  const missedArea = area(missed);
  if (missedArea > 0.5) {
    const pct = (missedArea / total) * 100;
    const where = mode === "relief" ? "vãos entre elementos" : "traços";
    warnings.push({
      code: "DETAIL_SMALLER_THAN_BIT",
      severity: "warning",
      message: `Alguns ${where} de ${el.label} são mais estreitos que a fresa de ${fmt(tool.diameter, 2)} mm; cerca de ${fmt(pct)}% dessa área não será cortada.`,
      suggestion: mode === "relief" ? "Aumente o espaçamento ou o tamanho do texto, ou use uma fresa mais fina." : "Aumente o tamanho, use uma fonte mais grossa ou uma fresa mais fina.",
      data: { areaMm2: Math.round(missedArea), percent: Math.round(pct * 10) / 10 },
      element: el.ref ?? nearestItem(el, missed, r),
    });
  }
}

/** No fundo do relevo, o elemento em pé que encosta na maior parte da área não cortada. */
function nearestItem(el: CutElement, missed: Region, r: number) {
  let best: { ref: CutElement["ref"]; a: number } = { ref: undefined, a: 0 };
  const near = offset(missed, r);
  for (const it of el.items ?? []) {
    const a = area(intersection(near, it.region));
    if (a > best.a) best = { ref: it.ref, a };
  }
  return best.ref;
}

function defaultTitle(texts: string[]) {
  return texts.length ? `Placa: ${texts.join(" / ")}` : "Placa";
}

const round1 = (v: number) => Math.round(v * 10) / 10;
