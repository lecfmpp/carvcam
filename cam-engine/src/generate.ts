import { fmt, hasErrors, type Warning } from "./warnings.js";
import { PathBuilder } from "./cam/builder.js";
import { hatch, peck, pocket, profile, vcarve, type Direction } from "./cam/operations.js";
import { area, bounds, difference, intersection, offset, unreachable, type Region } from "./geometry/clip.js";
import { buildLayout, type CutElement, type FontMap, type Layout } from "./layout.js";
import { resolveSienci, type ManualAdjustment, type SienciConfig } from "./catalog/sienci/config.js";
import { cutParams, type CutParams } from "./materials.js";
import { postGrbl, type PostOperation } from "./post/grbl.js";
import {
  MATERIAL_IDS,
  MachineSchema,
  PlateSpecSchema,
  ToolSchema,
  type Machine,
  type MachineInput,
  type MaterialId,
  type PlateSpecInput,
  type Tool,
  type ToolInput,
} from "./schema.js";
import { verifyGcode, type VerifyResult } from "./verify.js";
import { KEEP_OUT_MARGIN, zoneClearance, zoneName, zoneOverlap, type KeepOutZone } from "./keepout.js";

export interface GenerateOptions {
  fonts: FontMap;
  /** Main bit (engraving and relief). Default: 1/8" straight bit. */
  tool?: ToolInput;
  /** Bit for holes and cutouts. Default: the same as the main bit. */
  cutoutTool?: ToolInput;
  machine?: MachineInput;
  cut?: Partial<CutParams>;
  /** Cutting parameters for the cutout bit. Default: the same as `cut`. */
  cutoutCut?: Partial<CutParams>;
  /**
   * Machine, head and bits from the Sienci Labs catalog. When present, it replaces
   * `machine`, `tool`, `cutoutTool`, `cut` and `cutoutCut` with the catalog data
   * and the official feeds and speeds table.
   */
  sienci?: SienciConfig;
  direction?: Direction;
  tabs?: { count?: number; width?: number; height?: number };
  title?: string;
  /**
   * Keep-out zones (clamps, screws, hold-downs) in stock coordinates. With at least one zone:
   * - any cut (incl. the bit radius) overlapping a zone is a `KEEP_OUT_OVERLAP` error;
   * - the safe height AND the retract height of the whole job are raised to at least
   *   (tallest clearance + 2 mm), so every travel move clears every obstacle. If that height plus
   *   the stock thickness exceeds the machine's Z travel, it is a `KEEP_OUT_TOO_TALL` error;
   * - the verifier rejects any move that enters a zone (grown by the largest bit radius) below its clearance.
   * Without zones (omitted or empty) the output is exactly what it was before this option existed.
   */
  keepOut?: KeepOutZone[];
}

export interface OperationInfo {
  name: string;
  type: "engrave" | "relief" | "cutout" | "hole" | "profile";
  tool: number;
  depth: number;
}

export interface GenerateResult {
  /** True when there are no errors and the G-code passed the verifier. */
  ok: boolean;
  gcode: string;
  warnings: Warning[];
  operations: OperationInfo[];
  verification: VerifyResult | null;
  params: { main: CutParams; cutout: CutParams };
  tools: Tool[];
  /** Adjustments the user makes by hand before cutting (e.g. the Makita speed dial). */
  manualAdjustments: ManualAdjustment[];
  /** Where the cutting parameters came from. */
  paramsSource: string;
  /** Geometry in stock coordinates, for the UI's 2D/3D preview. */
  layout: Layout;
}

/** Resolves the catalog (if any), the bits and the machine. Shared by generatePlate and invalidSpecResult. */
function resolveSetup(options: GenerateOptions, material: MaterialId) {
  const sienci = options.sienci ? resolveSienci(options.sienci, material) : null;
  const opts: GenerateOptions = sienci
    ? { ...options, machine: sienci.machine, tool: sienci.tool, cutoutTool: sienci.cutoutTool, cut: sienci.cut, cutoutCut: sienci.cutoutCut }
    : options;
  const tool = ToolSchema.parse(opts.tool ?? {});
  let cutTool = opts.cutoutTool ? ToolSchema.parse(opts.cutoutTool) : tool;
  // Two bits need different tool numbers (T) for the tool change to work.
  if (cutTool !== tool && cutTool.id === tool.id) cutTool = { ...cutTool, id: tool.id + 1 };
  const machine: Machine = MachineSchema.parse(opts.machine ?? {});
  return { sienci, opts, tool, cutTool, machine };
}

/**
 * A failed result (no G-code, empty layout) for a spec that does not even pass the schema,
 * e.g. a batch row whose text is too long. Used by generateBatch so one bad row does not throw.
 */
export function invalidSpecResult(input: PlateSpecInput, options: GenerateOptions, warnings: Warning[]): GenerateResult {
  const material = (MATERIAL_IDS as readonly string[]).includes(input.material as string) ? (input.material as MaterialId) : "mdf";
  const { sienci, opts, tool, cutTool, machine } = resolveSetup(options, material);
  const pMain = cutParams(material, tool, machine, opts.cut);
  const pCut = cutTool === tool ? pMain : cutParams(material, cutTool, machine, opts.cutoutCut ?? opts.cut);
  const w = Number(input.width) || 0;
  const h = Number(input.height) || 0;
  return {
    ok: false,
    gcode: "",
    warnings: [...(sienci?.warnings ?? []), ...warnings],
    operations: [],
    verification: null,
    params: { main: pMain, cutout: pCut },
    tools: cutTool.id === tool.id ? [tool] : [tool, cutTool],
    manualAdjustments: sienci?.manualAdjustments ?? [],
    paramsSource: sienci?.source ?? "Generic chip-load calculation",
    layout: { stock: { width: w, height: h, thickness: Number(input.thickness) || 0 }, part: [], engraved: [], relief: null, cutouts: [], holes: [], profile: null, warnings },
  };
}

export function generatePlate(input: PlateSpecInput, options: GenerateOptions): GenerateResult {
  const spec = PlateSpecSchema.parse(input);
  const { sienci, opts, tool, cutTool, machine: baseMachine } = resolveSetup(options, spec.material);
  let machine: Machine = baseMachine;
  const direction = opts.direction ?? "conventional";
  const layout = buildLayout(spec, opts.fonts, tool, cutTool, machine);
  const warnings = [...(sienci?.warnings ?? []), ...layout.warnings];
  const keepOut = opts.keepOut ?? [];
  const keepOutNotes: string[] = [];
  if (keepOut.length) {
    warnings.push(...keepOutOverlaps(layout, keepOut, cutTool.diameter / 2));
    // Simple and safe: every travel (between and within operations) goes above the tallest obstacle.
    const travel = Math.max(...keepOut.map(zoneClearance)) + KEEP_OUT_MARGIN;
    if (travel + spec.thickness > machine.travelZ) {
      warnings.push({
        code: "KEEP_OUT_TOO_TALL",
        severity: "error",
        message: `Clearing the tallest clamp needs a travel height of ${fmt(travel)} mm above the stock, more than the machine's Z travel allows (${fmt(machine.travelZ)} mm with ${fmt(spec.thickness)} mm stock).`,
        suggestion: "Use lower clamps (or screws) or lower the clearance of the keep-out zones.",
        data: { travelHeight: travel, travelZ: machine.travelZ },
      });
    }
    machine = { ...machine, safeHeight: Math.max(machine.safeHeight, travel), retractHeight: Math.max(machine.retractHeight, travel) };
    keepOutNotes.push(`Keep-out zones: ${keepOut.length}; travel height raised to ${fmt(machine.safeHeight, 2)} mm to clear them`);
  }

  const pMain = cutParams(spec.material, tool, machine, opts.cut);
  const pCut = cutTool === tool ? pMain : cutParams(spec.material, cutTool, machine, opts.cutoutCut ?? opts.cut);
  const tools = cutTool.id === tool.id ? [tool] : [tool, cutTool];
  const manualAdjustments = sienci?.manualAdjustments ?? [];
  const paramsSource = sienci?.source ?? "Generic chip-load calculation";
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

  // The bit position carries over from one operation to the next, so cuts can be ordered nearest-first.
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

  // 1. Engravings (shallow, with the main bit).
  for (const g of layout.engraved) {
    if (g.hatch) {
      const h = g.hatch;
      const width = tool.type === "vbit" ? 2 * g.depth * Math.tan(((tool.angle ?? 60) * Math.PI) / 360) : tool.diameter;
      if (h.spacing <= width) {
        const suggested = Math.ceil(width * 1.8 * 2) / 2;
        warnings.push({
          code: "HATCH_TOO_DENSE",
          severity: "warning",
          message: `The hatch lines on ${g.label} are ${fmt(h.spacing)} mm apart, less than the cut width (${fmt(width)} mm); the whole area will come out cleared.`,
          suggestion: `Use at least ${fmt(suggested)} mm between lines.`,
          element: g.ref,
          fix: g.ref ? { element: g.ref, field: "hatch.spacing", value: suggested } : undefined,
        });
      }
      run(`Hatch: ${g.label}`, "engrave", tool, pMain, g.depth, (b) => {
        hatch(b, g.region, { radius: tool.type === "vbit" ? 0 : rMain, depth: g.depth, stepdown: pMain.stepdown, spacing: h.spacing, angle: h.angle, direction });
      });
      continue;
    }
    if (tool.type === "vbit") {
      const half = ((tool.angle ?? 60) * Math.PI) / 360;
      // Limit: the requested depth, the cutting length, the tapered part of the bit and the material.
      const max = Math.min(g.depth, tool.cutLength, rMain / Math.tan(half), spec.thickness - 0.5);
      run(`V-carve: ${g.label}`, "engrave", tool, pMain, max, (b) => {
        const res = vcarve(b, g.region, { halfAngle: half, maxDepth: max, stepdown: pMain.stepdown, direction });
        if (res.flatArea > 1) {
          warnings.push({
            code: "VCARVE_FLAT_BOTTOM",
            severity: "warning",
            message: `Wide parts of ${g.label} would go deeper than ${fmt(max)} mm; there the bottom is left flat and cleared with the V-bit (slower).`,
            suggestion: max < g.depth ? "The bit cannot go any deeper. Use a larger V-bit or make the design thinner." : `Increase the max depth to about ${fmt(Math.min(tool.cutLength, spec.thickness * 0.6))} mm, or make the design thinner.`,
            data: { flatArea: Math.round(res.flatArea) },
            element: g.ref,
          });
        }
      });
      continue;
    }
    checkDetail(g, rMain, tool, warnings, "engrave");
    run(`Engrave: ${g.label}`, "engrave", tool, pMain, g.depth, (b) => {
      pocket(b, g.region, { radius: rMain, stepover: pMain.stepover, depth: g.depth, stepdown: pMain.stepdown, direction });
    });
  }

  // 2. Relief background.
  if (layout.relief) {
    const rel = layout.relief;
    checkDetail(rel, rMain, tool, warnings, "relief");
    run("Clear relief background", "relief", tool, pMain, rel.depth, (b) => {
      pocket(b, rel.region, { radius: rMain, stepover: pMain.stepover, depth: rel.depth, stepdown: pMain.stepdown, direction });
    });
  }

  // 3. Through cutouts (stencil), 4. holes and slots, 5. outer profile: cutout bit.
  for (const v of layout.cutouts) {
    checkDetail(v, rCut, cutTool, warnings, "cutout");
    run(`Cutout: ${v.label}`, "cutout", cutTool, pCut, v.depth, (b) => {
      profile(b, v.region, { radius: rCut, depth: v.depth, stepdown: pCut.stepdown, direction, side: "inside" });
    });
  }

  for (const f of layout.holes) {
    const bb = bounds(f.region);
    const d = Math.min(bb.maxX - bb.minX, bb.maxY - bb.minY);
    run(`Hole: ${f.label}`, "hole", cutTool, pCut, f.depth, (b) => {
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
    run(`Profile: ${per.label}`, "profile", cutTool, pCut, per.depth, (b) => {
      const res = profile(b, per.region, { radius: rCut, depth: per.depth, stepdown: pCut.stepdown, direction, side: "outside", tabs });
      if (res.outlinesWithoutTabs > 0) {
        warnings.push({
          code: "SMALL_PART_WITHOUT_TABS",
          severity: "warning",
          message: `${res.outlinesWithoutTabs} part(s) are too small for tabs and will come loose at the end of the cut.`,
          suggestion: "Hold those parts down with double-sided tape before cutting, or make them bigger.",
        });
      }
    });
  }

  const gcode = postGrbl(
    {
      title: opts.title ?? defaultTitle(spec.texts.map((t) => t.content)),
      stock: layout.stock,
      safeHeight: machine.safeHeight,
      notes: [`Machine: ${machine.name}`, `Feeds and speeds: ${paramsSource}`, ...manualAdjustments.map((a) => a.message), ...keepOutNotes],
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
    ...(keepOut.length ? { keepOut, toolRadius: rMax } : {}),
  });

  return { ...base, ok: verification.ok && !hasErrors(warnings), gcode, operations, verification };
}

/**
 * KEEP_OUT_OVERLAP: the area each operation actually cuts, against each zone. Pockets, engravings,
 * cutouts and holes keep the bit inside their region; the outer profile cuts a ring one bit
 * diameter wide outside the outline.
 */
function keepOutOverlaps(layout: Layout, zones: KeepOutZone[], rCut: number): Warning[] {
  const cuts: { label: string; ref?: CutElement["ref"]; region: Region }[] = [
    ...layout.engraved,
    ...(layout.relief ? [{ ...layout.relief, label: "the relief background" }] : []),
    ...layout.cutouts,
    ...layout.holes,
    ...(layout.profile ? [{ ...layout.profile, label: `the outline cut (${layout.profile.label})`, region: difference(offset(layout.profile.region, 2 * rCut), layout.profile.region) }] : []),
  ];
  const out: Warning[] = [];
  zones.forEach((z, i) => {
    for (const c of cuts) {
      if (zoneOverlap(c.region, z) <= 0.01) continue;
      const name = zoneName(z, i);
      out.push({
        code: "KEEP_OUT_OVERLAP",
        severity: "error",
        message: `Keep-out zone "${name}" overlaps ${c.label}; the bit would hit it.`,
        suggestion: "Move the clamp or the design so they don't overlap.",
        element: c.ref,
        data: { zone: z.id ?? name, zoneIndex: i },
      });
    }
  });
  return out;
}

/**
 * Warns when the bit cannot reach part of the design: strokes thinner than the bit
 * (they vanish when engraved) or gaps between letters narrower than it (material left in the relief).
 */
function checkDetail(el: CutElement, r: number, tool: Tool, warnings: Warning[], mode: "engrave" | "relief" | "cutout") {
  const total = area(el.region);
  if (total <= 0) return;
  if (area(offset(el.region, -r)) <= 0) {
    warnings.push({
      code: "ELEMENT_NOT_MACHINABLE",
      severity: "error",
      message: `The strokes of ${el.label} are thinner than the ${fmt(tool.diameter, 2)} mm bit; nothing would be cut.`,
      suggestion: "Make it bigger, use a bolder font or a smaller bit.",
      element: el.ref,
    });
    return;
  }
  const missed: Region = offset(unreachable(el.region, r), -0.1 * tool.diameter);
  const missedArea = area(missed);
  if (missedArea > 0.5) {
    const pct = (missedArea / total) * 100;
    const where = mode === "relief" ? "gaps between elements" : "strokes";
    warnings.push({
      code: "DETAIL_SMALLER_THAN_BIT",
      severity: "warning",
      message: `Some ${where} in ${el.label} are narrower than the ${fmt(tool.diameter, 2)} mm bit; about ${fmt(pct)}% of that area will not be cut.`,
      suggestion: mode === "relief" ? "Increase the spacing or the text size, or use a smaller bit." : "Make it bigger, use a bolder font or a smaller bit.",
      data: { areaMm2: Math.round(missedArea), percent: Math.round(pct * 10) / 10 },
      element: el.ref ?? nearestItem(el, missed, r),
    });
  }
}

/** On the relief background, the raised element touching most of the uncut area. */
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
  return texts.length ? `Sign: ${texts.join(" / ")}` : "Sign";
}

const round1 = (v: number) => Math.round(v * 10) / 10;
