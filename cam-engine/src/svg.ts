import { EndType, FillRule, inflatePathsD, JoinType, unionD, type PathD, type PathsD } from "clipper2-ts";
import { bounds, difference, simplify, translate, union, type Pt, type Region } from "./geometry/clip.js";

/**
 * SVG importer: converts the drawing into a 2D region in mm (Y up, centered on the origin).
 *
 * Runs in the worker (no DOMParser), so it has its own minimal XML reader. Supports path
 * (all commands), rect, circle, ellipse, line, polyline, polygon, groups with transform,
 * fill-rule, strokes (a stroke becomes a band as wide as the stroke) and simple class rules in <style>.
 * Shapes with a white fill are subtracted from what came before (the way the eye sees the drawing).
 */

export interface SvgDrawing {
  /** Region in mm, centered on (0, 0). */
  region: Region;
  /** Natural size in mm (from the file's units; px = 1/96 in). */
  width: number;
  height: number;
}

export class InvalidSvg extends Error {}

const cache = new Map<string, SvgDrawing>();

export function parseSvg(text: string): SvgDrawing {
  const hit = cache.get(text);
  if (hit) return hit;
  const d = parse(text);
  if (cache.size > 16) cache.delete(cache.keys().next().value!);
  cache.set(text, d);
  return d;
}

/** Drawing scaled to the given width (keeps the aspect ratio) and centered on (x, y). */
export function placeSvg(d: SvgDrawing, x: number, y: number, width: number): Region {
  const s = width / d.width;
  return d.region.map((p) => p.map((q) => ({ x: q.x * s + x, y: q.y * s + y })));
}

// ---------------------------------------------------------------- XML

interface Node {
  tag: string;
  attrs: Record<string, string>;
  children: Node[];
  text: string;
}

function parseXml(src: string): Node {
  src = src.replace(/<!--[\s\S]*?-->/g, "").replace(/<\?[\s\S]*?\?>/g, "").replace(/<!DOCTYPE[\s\S]*?>/gi, "");
  const root: Node = { tag: "#root", attrs: {}, children: [], text: "" };
  const stack: Node[] = [root];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([A-Za-z_][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.text += m[1];
    else if (m[6] !== undefined) top.text += m[6];
    else if (m[2] === "/") {
      const name = local(m[3]);
      // Close up to the matching tag (tolerates slightly broken XML).
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === name) {
          stack.length = i;
          break;
        }
      }
    } else {
      const node: Node = { tag: local(m[3]), attrs: parseAttrs(m[4]), children: [], text: "" };
      top.children.push(node);
      if (m[5] !== "/") stack.push(node);
    }
  }
  return root;
}

const local = (n: string) => n.slice(n.indexOf(":") + 1);

function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out[local(m[1])] = decode(m[2] ?? m[3]);
  return out;
}

const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const k = e.toLowerCase();
    if (k[0] === "#") return String.fromCharCode(k[1] === "x" ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[k] ?? "";
  });

// ---------------------------------------------------------------- style and transforms

type M = [number, number, number, number, number, number]; // a b c d e f
const ID: M = [1, 0, 0, 1, 0, 0];
const mul = (p: M, q: M): M => [
  p[0] * q[0] + p[2] * q[1],
  p[1] * q[0] + p[3] * q[1],
  p[0] * q[2] + p[2] * q[3],
  p[1] * q[2] + p[3] * q[3],
  p[0] * q[4] + p[2] * q[5] + p[4],
  p[1] * q[4] + p[3] * q[5] + p[5],
];
const apply = (m: M, x: number, y: number): Pt => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
const det = (m: M) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

function parseTransform(s: string | undefined): M {
  let out = ID;
  if (!s) return out;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const a = nums(m[2]);
    let t: M = ID;
    const rad = ((a[0] ?? 0) * Math.PI) / 180;
    switch (m[1]) {
      case "matrix":
        if (a.length >= 6) t = a.slice(0, 6) as M;
        break;
      case "translate":
        t = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
        break;
      case "scale":
        t = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
        break;
      case "rotate": {
        const c = Math.cos(rad);
        const sn = Math.sin(rad);
        t = [c, sn, -sn, c, 0, 0];
        if (a.length >= 3) t = mul(mul([1, 0, 0, 1, a[1], a[2]], t), [1, 0, 0, 1, -a[1], -a[2]]);
        break;
      }
      case "skewX":
        t = [1, 0, Math.tan(rad), 1, 0, 0];
        break;
      case "skewY":
        t = [1, Math.tan(rad), 0, 1, 0, 0];
        break;
    }
    out = mul(out, t);
  }
  return out;
}

const nums = (s: string) => (s.match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? []).map(Number);

interface Style {
  fill: string;
  stroke: string;
  strokeWidth: number;
  fillRule: "nonzero" | "evenodd";
  display: boolean;
}

const STYLE_PROPS = ["fill", "stroke", "stroke-width", "fill-rule", "display", "visibility", "opacity", "fill-opacity"];

function ownStyle(n: Node, classes: Map<string, Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of STYLE_PROPS) if (n.attrs[k] !== undefined) out[k] = n.attrs[k];
  for (const c of (n.attrs.class ?? "").split(/\s+/)) Object.assign(out, classes.get(c) ?? {});
  if (n.attrs.style) Object.assign(out, parseDecls(n.attrs.style));
  return out;
}

function parseDecls(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of s.split(";")) {
    const i = d.indexOf(":");
    if (i > 0) out[d.slice(0, i).trim().toLowerCase()] = d.slice(i + 1).trim();
  }
  return out;
}

function parseClasses(css: string, into: Map<string, Record<string, string>>) {
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    const decls = parseDecls(m[2]);
    for (const sel of m[1].split(",")) {
      const t = sel.trim();
      if (/^\.[\w-]+$/.test(t)) into.set(t.slice(1), { ...into.get(t.slice(1)), ...decls });
    }
  }
}

function inherit(parent: Style, own: Record<string, string>): Style {
  const s = { ...parent };
  if (own.fill !== undefined) s.fill = own.fill.trim().toLowerCase();
  if (own.stroke !== undefined) s.stroke = own.stroke.trim().toLowerCase();
  if (own["stroke-width"] !== undefined) s.strokeWidth = parseFloat(own["stroke-width"]) || 0;
  if (own["fill-rule"] !== undefined) s.fillRule = own["fill-rule"].trim() === "evenodd" ? "evenodd" : "nonzero";
  if (own.display?.trim() === "none" || own.visibility?.trim() === "hidden" || own.opacity?.trim() === "0") s.display = false;
  if (own["fill-opacity"]?.trim() === "0") s.fill = "none";
  return s;
}

const isNone = (c: string) => c === "none" || c === "transparent" || c === "";
const isWhite = (c: string) => ["white", "#fff", "#ffffff", "rgb(255,255,255)", "rgb(255, 255, 255)"].includes(c);

// ---------------------------------------------------------------- geometry

interface Sub {
  pts: Pt[];
  closed: boolean;
}

/** Converts to mm (with the full transform applied) and flattens curves in ~0.25 mm steps. */
class Pen {
  subs: Sub[] = [];
  private cur: Sub | null = null;
  constructor(private m: M) {}

  move(x: number, y: number) {
    this.cur = { pts: [apply(this.m, x, y)], closed: false };
    this.subs.push(this.cur);
  }
  line(x: number, y: number) {
    if (!this.cur) this.move(x, y);
    else this.cur.pts.push(apply(this.m, x, y));
  }
  close() {
    if (this.cur) this.cur.closed = true;
  }
  /** Cubic Bézier (points in user space; an affine transform preserves the curve). */
  cubic(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) {
    const p = [apply(this.m, x0, y0), apply(this.m, x1, y1), apply(this.m, x2, y2), apply(this.m, x3, y3)];
    const len = dist(p[0], p[1]) + dist(p[1], p[2]) + dist(p[2], p[3]);
    const n = Math.max(2, Math.min(200, Math.ceil(len / 0.25)));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const u = 1 - t;
      const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
      this.cur!.pts.push({ x: a * p[0].x + b * p[1].x + c * p[2].x + d * p[3].x, y: a * p[0].y + b * p[1].y + c * p[2].y + d * p[3].y });
    }
  }
  /** Points already computed in user space (arcs, ellipses). */
  userPoints(pts: [number, number][]) {
    for (const [x, y] of pts) this.cur!.pts.push(apply(this.m, x, y));
  }
  /** Number of segments for an arc of radius r (in user units) and angle da. */
  segs(r: number, da: number) {
    const rmm = r * det(this.m);
    return Math.max(4, Math.min(360, Math.ceil((Math.abs(da) * Math.max(rmm, 0.1)) / 0.25)));
  }
}

const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

function tracePath(pen: Pen, d: string) {
  const toks = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
  let i = 0;
  let cmd = "";
  let x = 0, y = 0, sx = 0, sy = 0;
  let cx = 0, cy = 0; // last control point (for S/T)
  let prev = "";
  const isCmd = (t: string | undefined) => t !== undefined && /^[a-zA-Z]$/.test(t);
  const n = () => {
    const t = toks[i++];
    if (t === undefined || isCmd(t)) throw new InvalidSvg("Malformed path.");
    return Number(t);
  };
  // Arc flags can come glued together ("a10 10 0 01 5 5"); the regex keeps "01" as "01",
  // so we handle it here: if the token has more than one 0/1 digit, split it.
  const flag = () => {
    const t = toks[i];
    if (t !== undefined && /^[01]{2,}/.test(t)) {
      toks[i] = t.slice(1);
      return t[0] === "1";
    }
    return n() !== 0;
  };
  while (i < toks.length) {
    if (isCmd(toks[i])) cmd = toks[i++];
    else if (!cmd) throw new InvalidSvg("Malformed path.");
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    switch (C) {
      case "M":
        x = ox + n(); y = oy + n();
        pen.move(x, y);
        sx = x; sy = y;
        cmd = rel ? "l" : "L"; // following pairs are lines
        break;
      case "L":
        x = ox + n(); y = oy + n();
        pen.line(x, y);
        break;
      case "H":
        x = ox + n();
        pen.line(x, y);
        break;
      case "V":
        y = oy + n();
        pen.line(x, y);
        break;
      case "C": {
        const x1 = ox + n(), y1 = oy + n(), x2 = ox + n(), y2 = oy + n(), ex = ox + n(), ey = oy + n();
        ensure(pen, x, y);
        pen.cubic(x, y, x1, y1, x2, y2, ex, ey);
        cx = x2; cy = y2; x = ex; y = ey;
        break;
      }
      case "S": {
        const [x1, y1] = /[CS]/i.test(prev) ? [2 * x - cx, 2 * y - cy] : [x, y];
        const x2 = ox + n(), y2 = oy + n(), ex = ox + n(), ey = oy + n();
        ensure(pen, x, y);
        pen.cubic(x, y, x1, y1, x2, y2, ex, ey);
        cx = x2; cy = y2; x = ex; y = ey;
        break;
      }
      case "Q": {
        const qx = ox + n(), qy = oy + n(), ex = ox + n(), ey = oy + n();
        ensure(pen, x, y);
        quad(pen, x, y, qx, qy, ex, ey);
        cx = qx; cy = qy; x = ex; y = ey;
        break;
      }
      case "T": {
        const [qx, qy] = /[QT]/i.test(prev) ? [2 * x - cx, 2 * y - cy] : [x, y];
        const ex = ox + n(), ey = oy + n();
        ensure(pen, x, y);
        quad(pen, x, y, qx, qy, ex, ey);
        cx = qx; cy = qy; x = ex; y = ey;
        break;
      }
      case "A": {
        const rx = n(), ry = n(), rot = n();
        const large = flag(), sweep = flag();
        const ex = ox + n(), ey = oy + n();
        ensure(pen, x, y);
        arc(pen, x, y, rx, ry, rot, large, sweep, ex, ey);
        x = ex; y = ey;
        break;
      }
      case "Z":
        pen.close();
        x = sx; y = sy;
        break;
      default:
        throw new InvalidSvg(`Path command "${cmd}" is not supported.`);
    }
    prev = C;
  }
}

const ensure = (pen: Pen, x: number, y: number) => {
  if (!pen.subs.length || pen.subs[pen.subs.length - 1].closed) pen.move(x, y);
};

const quad = (pen: Pen, x0: number, y0: number, qx: number, qy: number, x: number, y: number) =>
  pen.cubic(x0, y0, x0 + (2 / 3) * (qx - x0), y0 + (2 / 3) * (qy - y0), x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), x, y);

/** SVG elliptical arc (endpoint → center parameterization), per appendix F.6 of the spec. */
function arc(pen: Pen, x1: number, y1: number, rx: number, ry: number, rotDeg: number, large: boolean, sweep: boolean, x2: number, y2: number) {
  if (rx === 0 || ry === 0) return pen.line(x2, y2);
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const phi = (rotDeg * Math.PI) / 180;
  const cs = Math.cos(phi), sn = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const xp = cs * dx + sn * dy, yp = -sn * dx + cs * dy;
  const lam = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lam > 1) {
    rx *= Math.sqrt(lam);
    ry *= Math.sqrt(lam);
  }
  const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / (rx * rx * yp * yp + ry * ry * xp * xp)));
  const cxp = (k * rx * yp) / ry, cyp = (-k * ry * xp) / rx;
  const cx = cs * cxp - sn * cyp + (x1 + x2) / 2;
  const cy = sn * cxp + cs * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const segs = pen.segs(Math.max(rx, ry), dt);
  const pts: [number, number][] = [];
  for (let i = 1; i <= segs; i++) {
    const t = t1 + (dt * i) / segs;
    const ex = rx * Math.cos(t), ey = ry * Math.sin(t);
    pts.push([cs * ex - sn * ey + cx, sn * ex + cs * ey + cy]);
  }
  pen.userPoints(pts);
}

function ellipse(pen: Pen, cx: number, cy: number, rx: number, ry: number) {
  const segs = pen.segs(Math.max(rx, ry), 2 * Math.PI);
  pen.move(cx + rx, cy);
  const pts: [number, number][] = [];
  for (let i = 1; i < segs; i++) {
    const t = (2 * Math.PI * i) / segs;
    pts.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
  }
  pen.userPoints(pts);
  pen.close();
}

const len = (v: string | undefined, ref = 0) => {
  if (v === undefined) return 0;
  const n = parseFloat(v);
  if (Number.isNaN(n)) return 0;
  return v.trim().endsWith("%") ? (n / 100) * ref : n;
};

function shapePen(n: Node, m: M, vb: { w: number; h: number }): Pen | null {
  const a = n.attrs;
  const pen = new Pen(m);
  switch (n.tag) {
    case "path":
      if (!a.d) return null;
      tracePath(pen, a.d);
      break;
    case "rect": {
      const x = len(a.x, vb.w), y = len(a.y, vb.h), w = len(a.width, vb.w), h = len(a.height, vb.h);
      if (w <= 0 || h <= 0) return null;
      let rx = len(a.rx ?? a.ry, vb.w), ry = len(a.ry ?? a.rx, vb.h);
      rx = Math.min(rx, w / 2);
      ry = Math.min(ry, h / 2);
      if (rx > 0 && ry > 0) {
        const k = 0.5523;
        pen.move(x + rx, y);
        pen.line(x + w - rx, y);
        pen.cubic(x + w - rx, y, x + w - rx + rx * k, y, x + w, y + ry - ry * k, x + w, y + ry);
        pen.line(x + w, y + h - ry);
        pen.cubic(x + w, y + h - ry, x + w, y + h - ry + ry * k, x + w - rx + rx * k, y + h, x + w - rx, y + h);
        pen.line(x + rx, y + h);
        pen.cubic(x + rx, y + h, x + rx - rx * k, y + h, x, y + h - ry + ry * k, x, y + h - ry);
        pen.line(x, y + ry);
        pen.cubic(x, y + ry, x, y + ry - ry * k, x + rx - rx * k, y, x + rx, y);
      } else {
        pen.move(x, y);
        pen.line(x + w, y);
        pen.line(x + w, y + h);
        pen.line(x, y + h);
      }
      pen.close();
      break;
    }
    case "circle": {
      const r = len(a.r, Math.hypot(vb.w, vb.h) / Math.SQRT2);
      if (r <= 0) return null;
      ellipse(pen, len(a.cx, vb.w), len(a.cy, vb.h), r, r);
      break;
    }
    case "ellipse": {
      const rx = len(a.rx, vb.w), ry = len(a.ry, vb.h);
      if (rx <= 0 || ry <= 0) return null;
      ellipse(pen, len(a.cx, vb.w), len(a.cy, vb.h), rx, ry);
      break;
    }
    case "line":
      pen.move(len(a.x1, vb.w), len(a.y1, vb.h));
      pen.line(len(a.x2, vb.w), len(a.y2, vb.h));
      break;
    case "polyline":
    case "polygon": {
      const p = nums(a.points ?? "");
      if (p.length < 4) return null;
      pen.move(p[0], p[1]);
      for (let i = 2; i + 1 < p.length; i += 2) pen.line(p[i], p[i + 1]);
      if (n.tag === "polygon") pen.close();
      break;
    }
    default:
      return null;
  }
  return pen;
}

// ---------------------------------------------------------------- document

const UNIT_MM: Record<string, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96, "": 25.4 / 96 };

function lengthMm(v: string | undefined): number | null {
  if (!v) return null;
  const m = /^\s*([-+]?[\d.]+(?:e[-+]?\d+)?)\s*(mm|cm|in|pt|pc|px)?\s*$/i.exec(v);
  if (!m) return null;
  return parseFloat(m[1]) * UNIT_MM[(m[2] ?? "").toLowerCase()];
}

const SKIP = new Set(["defs", "clipPath", "mask", "symbol", "marker", "pattern", "title", "desc", "metadata", "style", "text", "image", "foreignObject", "linearGradient", "radialGradient", "filter"]);

function parse(text: string): SvgDrawing {
  if (!/<svg[\s>]/i.test(text)) throw new InvalidSvg("The file does not look like an SVG.");
  const doc = parseXml(text);
  const svg = findSvg(doc);
  if (!svg) throw new InvalidSvg("The file does not look like an SVG.");

  const classes = new Map<string, Record<string, string>>();
  collectStyles(svg, classes);

  // Scale from user units → mm.
  const vb = nums(svg.attrs.viewBox ?? "");
  const wMm = lengthMm(svg.attrs.width);
  const hMm = lengthMm(svg.attrs.height);
  let root: M = [UNIT_MM.px, 0, 0, UNIT_MM.px, 0, 0];
  let box = { w: 0, h: 0 };
  if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
    box = { w: vb[2], h: vb[3] };
    const sx = wMm ? wMm / vb[2] : hMm ? hMm / vb[3] : UNIT_MM.px;
    const sy = hMm ? hMm / vb[3] : sx;
    const s = Math.min(sx, sy); // default preserveAspectRatio (meet)
    root = [s, 0, 0, s, -vb[0] * s, -vb[1] * s];
  } else if (wMm && hMm) {
    box = { w: wMm / UNIT_MM.px, h: hMm / UNIT_MM.px };
  }

  let acc: Region = [];
  let any = false;
  const base: Style = { fill: "#000", stroke: "none", strokeWidth: 1, fillRule: "nonzero", display: true };

  const walk = (n: Node, m: M, st: Style) => {
    if (SKIP.has(n.tag)) return;
    const s = inherit(st, ownStyle(n, classes));
    if (!s.display) return;
    const mm = mul(m, parseTransform(n.attrs.transform));
    if (n.tag === "g" || n.tag === "svg" || n.tag === "a" || n.tag === "switch") {
      for (const c of n.children) walk(c, mm, s);
      return;
    }
    const pen = shapePen(n, mm, box);
    if (!pen) return;
    let r: Region = [];
    const closedLike = n.tag !== "line"; // polyline is filled too (implicitly closed)
    if (!isNone(s.fill) && closedLike) {
      const polys = pen.subs.filter((p) => p.pts.length >= 3).map((p) => p.pts as PathD);
      if (polys.length) r = unionD(polys as PathsD, s.fillRule === "evenodd" ? FillRule.EvenOdd : FillRule.NonZero);
    }
    if (!isNone(s.stroke) && s.strokeWidth > 0) {
      const w = s.strokeWidth * det(mm);
      const open = pen.subs.filter((p) => !p.closed && p.pts.length >= 2).map((p) => p.pts as PathD);
      const closed = pen.subs.filter((p) => p.closed && p.pts.length >= 3).map((p) => p.pts as PathD);
      const strokes: PathsD = [];
      if (open.length) strokes.push(...inflatePathsD(open, w / 2, JoinType.Round, EndType.Round, 2, 4, 0.02));
      if (closed.length) strokes.push(...inflatePathsD(closed, w / 2, JoinType.Round, EndType.Joined, 2, 4, 0.02));
      if (strokes.length) r = union(r, strokes);
    }
    if (!r.length) return;
    any = true;
    acc = !isNone(s.fill) && isWhite(s.fill) && isNone(s.stroke) ? difference(acc, r) : union(acc, r);
  };
  for (const c of svg.children) walk(c, root, inherit(base, ownStyle(svg, classes)));

  if (!any) throw new InvalidSvg("The SVG has no shapes that can be cut (paths, rectangles, circles...). Text must be converted to curves.");
  if (!acc.length) throw new InvalidSvg("The drawing is empty after applying the fills.");

  // SVG Y grows downward; the machine's grows upward.
  let reg: Region = acc.map((p) => p.map((q) => ({ x: q.x, y: -q.y })).reverse());
  reg = simplify(reg, 0.005);
  const b = bounds(reg);
  const width = b.maxX - b.minX;
  const height = b.maxY - b.minY;
  if (!(width > 0.01 && height > 0.01)) throw new InvalidSvg("The SVG drawing is too small.");
  reg = translate(reg, -(b.minX + b.maxX) / 2, -(b.minY + b.maxY) / 2);
  return { region: reg, width, height };
}

function findSvg(n: Node): Node | null {
  if (n.tag === "svg") return n;
  for (const c of n.children) {
    const f = findSvg(c);
    if (f) return f;
  }
  return null;
}

function collectStyles(n: Node, into: Map<string, Record<string, string>>) {
  if (n.tag === "style") parseClasses(n.text, into);
  for (const c of n.children) collectStyles(c, into);
}
