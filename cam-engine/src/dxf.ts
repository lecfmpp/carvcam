import { EndType, FillRule, inflatePathsD, JoinType, unionD, type PathD } from "clipper2-ts";
import { bounds, simplify, translate, union, type Pt, type Region } from "./geometry/clip.js";
import { InvalidSvg, type SvgDrawing } from "./svg.js";

/**
 * DXF (ASCII) importer: LINE, LWPOLYLINE and POLYLINE (with bulge), CIRCLE, ARC, ELLIPSE and
 * SPLINE (NURBS). Open pieces whose ends touch are joined into closed outlines; closed
 * outlines become areas (even-odd, so outlines inside outlines are holes).
 * Whatever is left open becomes a thin 1 mm stroke, to engrave.
 *
 * Units from the header's $INSUNITS (no unit = mm). DXF already has Y up.
 */

const OPEN_PATH_WIDTH = 1; // mm
const STEP = 0.25; // mm between points on arcs and curves
/** Step in drawing units (STEP converted by the file's unit); set in parseDxf. */
let step = STEP;

const INSUNITS_MM: Record<number, number> = { 0: 1, 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000, 8: 0.0000254, 9: 0.0254, 10: 914.4 };

type Pair = [number, string];

function pairs(text: string): Pair[] {
  const lines = text.split(/\r?\n/);
  const out: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    if (Number.isNaN(code)) throw new InvalidSvg("The DXF file is corrupt or not ASCII (binary DXF is not supported).");
    out.push([code, lines[i + 1].trim()]);
  }
  return out;
}

interface Ent {
  type: string;
  g: Pair[];
}

/** Splits the file into sections and entities. */
function readEntities(ps: Pair[]): { ents: Ent[]; insunits: number } {
  let insunits = 0;
  const ents: Ent[] = [];
  let section = "";
  let cur: Ent | null = null;
  for (let i = 0; i < ps.length; i++) {
    const [c, v] = ps[i];
    if (c === 0 && v === "SECTION") {
      section = ps[i + 1]?.[1] ?? "";
      cur = null;
      continue;
    }
    if (c === 0 && v === "ENDSEC") {
      section = "";
      cur = null;
      continue;
    }
    if (section === "HEADER" && c === 9 && v === "$INSUNITS") {
      insunits = parseInt(ps[i + 1]?.[1] ?? "0", 10) || 0;
      continue;
    }
    if (section !== "ENTITIES") continue;
    if (c === 0) {
      cur = { type: v, g: [] };
      ents.push(cur);
    } else cur?.g.push([c, v]);
  }
  return { ents, insunits };
}

const num = (e: Ent, code: number, def = 0) => {
  const p = e.g.find((x) => x[0] === code);
  return p ? parseFloat(p[1]) : def;
};
const nums = (e: Ent, code: number) => e.g.filter((x) => x[0] === code).map((x) => parseFloat(x[1]));

interface Piece {
  pts: Pt[];
  closed: boolean;
}

function arcPts(cx: number, cy: number, r: number, a0: number, a1: number): Pt[] {
  let da = a1 - a0;
  while (da <= 0) da += 2 * Math.PI;
  const n = Math.max(4, Math.min(720, Math.ceil((da * r) / step)));
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (da * i) / n;
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return out;
}

/** Vertices with bulge (arc between one vertex and the next; bulge = tan(angle/4)). */
function bulgePath(v: { x: number; y: number; b: number }[], closed: boolean): Pt[] {
  const out: Pt[] = [];
  const n = v.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = v[i];
    const b = v[(i + 1) % n];
    out.push({ x: a.x, y: a.y });
    if (Math.abs(a.b) < 1e-9) continue;
    const theta = 4 * Math.atan(a.b);
    const chord = Math.hypot(b.x - a.x, b.y - a.y);
    if (chord < 1e-12) continue;
    const r = chord / (2 * Math.sin(Math.abs(theta) / 2));
    // Center: from the middle of the chord, perpendicular, toward the side of the arc direction.
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const h = r * Math.cos(theta / 2) * Math.sign(theta);
    const ux = -(b.y - a.y) / chord;
    const uy = (b.x - a.x) / chord;
    const cx = mx + ux * h;
    const cy = my + uy * h;
    const a0 = Math.atan2(a.y - cy, a.x - cx);
    const steps = Math.max(2, Math.ceil((Math.abs(theta) * Math.abs(r)) / step));
    for (let k = 1; k < steps; k++) {
      const t = a0 + (theta * k) / steps;
      out.push({ x: cx + Math.abs(r) * Math.cos(t), y: cy + Math.abs(r) * Math.sin(t) });
    }
  }
  if (!closed) out.push({ x: v[n - 1].x, y: v[n - 1].y });
  return out;
}

/** Evaluates a NURBS (de Boor) at evenly spaced points. */
function nurbs(deg: number, knots: number[], ctrl: Pt[], w: number[]): Pt[] {
  const n = ctrl.length;
  if (n < 2 || knots.length !== n + deg + 1) return ctrl;
  const ww = w.length === n ? w : ctrl.map(() => 1);
  const t0 = knots[deg];
  const t1 = knots[n];
  let len = 0;
  for (let i = 1; i < n; i++) len += Math.hypot(ctrl[i].x - ctrl[i - 1].x, ctrl[i].y - ctrl[i - 1].y);
  const steps = Math.max(8, Math.min(2000, Math.ceil(len / step)));
  const out: Pt[] = [];
  for (let s = 0; s <= steps; s++) {
    const t = Math.min(t0 + ((t1 - t0) * s) / steps, t1 - 1e-12 * (t1 - t0 || 1));
    let k = deg;
    while (k < n - 1 && t >= knots[k + 1]) k++;
    const d: { x: number; y: number; w: number }[] = [];
    for (let j = 0; j <= deg; j++) {
      const p = ctrl[k - deg + j];
      const wj = ww[k - deg + j];
      d.push({ x: p.x * wj, y: p.y * wj, w: wj });
    }
    for (let r = 1; r <= deg; r++) {
      for (let j = deg; j >= r; j--) {
        const i = k - deg + j;
        const den = knots[i + deg - r + 1] - knots[i];
        const a = den === 0 ? 0 : (t - knots[i]) / den;
        d[j] = { x: (1 - a) * d[j - 1].x + a * d[j].x, y: (1 - a) * d[j - 1].y + a * d[j].y, w: (1 - a) * d[j - 1].w + a * d[j].w };
      }
    }
    out.push({ x: d[deg].x / d[deg].w, y: d[deg].y / d[deg].w });
  }
  return out;
}

function pieces(ents: Ent[]): { pieces: Piece[]; ignored: Set<string> } {
  const out: Piece[] = [];
  const ignored = new Set<string>();
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i];
    // Extrusion direction (0,0,-1) mirrors X in the object coordinate system (common in AutoCAD arcs).
    const fx = num(e, 230, 1) < 0 ? -1 : 1;
    switch (e.type) {
      case "LINE":
        out.push({ pts: [{ x: num(e, 10), y: num(e, 20) }, { x: num(e, 11), y: num(e, 21) }], closed: false });
        break;
      case "CIRCLE": {
        const p = arcPts(num(e, 10) * fx, num(e, 20), num(e, 40), 0, 2 * Math.PI);
        p.pop();
        out.push({ pts: p, closed: true });
        break;
      }
      case "ARC": {
        const r = num(e, 40);
        let a0 = (num(e, 50) * Math.PI) / 180;
        let a1 = (num(e, 51) * Math.PI) / 180;
        if (fx < 0) [a0, a1] = [Math.PI - a1, Math.PI - a0];
        out.push({ pts: arcPts(num(e, 10) * fx, num(e, 20), r, a0, a1), closed: false });
        break;
      }
      case "ELLIPSE": {
        const cx = num(e, 10), cy = num(e, 20), mx = num(e, 11), my = num(e, 21), ratio = num(e, 40, 1);
        let p0 = num(e, 41, 0), p1 = num(e, 42, 2 * Math.PI);
        while (p1 <= p0) p1 += 2 * Math.PI;
        const a = Math.hypot(mx, my);
        const rot = Math.atan2(my, mx);
        const full = Math.abs(p1 - p0 - 2 * Math.PI) < 1e-6;
        const n = Math.max(16, Math.ceil(((p1 - p0) * a) / step));
        const pts: Pt[] = [];
        for (let k = 0; k <= n; k++) {
          const t = p0 + ((p1 - p0) * k) / n;
          const x = a * Math.cos(t), y = a * ratio * Math.sin(t);
          pts.push({ x: (cx + x * Math.cos(rot) - y * Math.sin(rot)) * fx, y: cy + x * Math.sin(rot) + y * Math.cos(rot) });
        }
        if (full) pts.pop();
        out.push({ pts, closed: full });
        break;
      }
      case "LWPOLYLINE": {
        const closed = (num(e, 70) & 1) === 1;
        const v: { x: number; y: number; b: number }[] = [];
        for (const [c, val] of e.g) {
          if (c === 10) v.push({ x: parseFloat(val) * fx, y: 0, b: 0 });
          else if (c === 20 && v.length) v[v.length - 1].y = parseFloat(val);
          else if (c === 42 && v.length) v[v.length - 1].b = parseFloat(val) * fx;
        }
        if (v.length >= 2) out.push({ pts: bulgePath(v, closed), closed });
        break;
      }
      case "POLYLINE": {
        const closed = (num(e, 70) & 1) === 1;
        const v: { x: number; y: number; b: number }[] = [];
        let j = i + 1;
        for (; j < ents.length && ents[j].type === "VERTEX"; j++) v.push({ x: num(ents[j], 10) * fx, y: num(ents[j], 20), b: num(ents[j], 42) * fx });
        i = ents[j]?.type === "SEQEND" ? j : j - 1;
        if (v.length >= 2) out.push({ pts: bulgePath(v, closed), closed });
        break;
      }
      case "SPLINE": {
        const deg = num(e, 71, 3);
        const closed = (num(e, 70) & 1) === 1;
        const knots = nums(e, 40);
        const cx = nums(e, 10), cy = nums(e, 20);
        const ctrl = cx.map((x, k) => ({ x, y: cy[k] ?? 0 }));
        let pts: Pt[];
        if (ctrl.length >= 2) pts = nurbs(deg, knots, ctrl, nums(e, 41));
        else {
          // Fit points only: connect the points (approximation).
          const fxs = nums(e, 11), fys = nums(e, 21);
          pts = fxs.map((x, k) => ({ x, y: fys[k] ?? 0 }));
        }
        if (pts.length >= 2) out.push({ pts, closed: closed || dist(pts[0], pts[pts.length - 1]) < 1e-6 });
        break;
      }
      case "VERTEX":
      case "SEQEND":
        break;
      default:
        ignored.add(e.type);
    }
  }
  return { pieces: out, ignored };
}

const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

/** Joins open pieces whose ends touch (tolerance in drawing units). */
function chain(open: Pt[][], tol: number): { closed: Pt[][]; open: Pt[][] } {
  const rest = open.map((p) => [...p]);
  const closed: Pt[][] = [];
  const left: Pt[][] = [];
  while (rest.length) {
    let cur = rest.pop()!;
    let grew = true;
    while (grew) {
      grew = false;
      if (dist(cur[0], cur[cur.length - 1]) <= tol && cur.length > 2) break;
      for (let k = 0; k < rest.length; k++) {
        const p = rest[k];
        const end = cur[cur.length - 1];
        const start = cur[0];
        if (dist(end, p[0]) <= tol) cur = [...cur, ...p.slice(1)];
        else if (dist(end, p[p.length - 1]) <= tol) cur = [...cur, ...p.slice(0, -1).reverse()];
        else if (dist(start, p[p.length - 1]) <= tol) cur = [...p.slice(0, -1), ...cur];
        else if (dist(start, p[0]) <= tol) cur = [...p.slice(1).reverse(), ...cur];
        else continue;
        rest.splice(k, 1);
        grew = true;
        break;
      }
    }
    if (cur.length > 2 && dist(cur[0], cur[cur.length - 1]) <= tol) closed.push(cur.slice(0, -1));
    else left.push(cur);
  }
  return { closed, open: left };
}

export function parseDxf(text: string): SvgDrawing & { openPaths: number } {
  const { ents, insunits } = readEntities(pairs(text));
  const u = INSUNITS_MM[insunits] ?? 1;
  step = STEP / u;
  const { pieces: ps, ignored } = pieces(ents);
  if (!ps.length) {
    const extra = ignored.size ? ` Only found: ${[...ignored].join(", ")}.` : "";
    throw new InvalidSvg(`The DXF has no lines, arcs, circles, polylines or splines.${extra} Explode blocks and text before exporting.`);
  }
  const scaled = ps.map((p) => ({ closed: p.closed, pts: p.pts.map((q) => ({ x: q.x * u, y: q.y * u })) }));
  const { closed: chained, open } = chain(
    scaled.filter((p) => !p.closed).map((p) => p.pts),
    0.05,
  );
  const loops = [...scaled.filter((p) => p.closed).map((p) => p.pts), ...chained].filter((p) => p.length >= 3);
  let reg: Region = loops.length ? unionD(loops as PathD[], FillRule.EvenOdd) : [];
  if (open.length) {
    const strokes = inflatePathsD(open as PathD[], OPEN_PATH_WIDTH / 2, JoinType.Round, EndType.Round, 2, 4, 0.02);
    reg = union(reg, strokes);
  }
  reg = simplify(reg, 0.005);
  if (!reg.length) throw new InvalidSvg("The DXF drawing is empty.");
  const b = bounds(reg);
  const width = b.maxX - b.minX;
  const height = b.maxY - b.minY;
  if (!(width > 0.01 && height > 0.01)) throw new InvalidSvg("The DXF drawing is too small.");
  reg = translate(reg, -(b.minX + b.maxX) / 2, -(b.minY + b.maxY) / 2);
  return { region: reg, width, height, openPaths: open.length };
}
