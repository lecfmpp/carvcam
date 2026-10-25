import type opentype from "opentype.js";
import { bounds, union, type Pt, type Region } from "./clip.js";

const FLATTEN_TOL = 0.05; // mm de erro máximo ao transformar curvas em segmentos

/**
 * Converte um texto em região 2D (mm, Y para cima) com a altura das maiúsculas = capHeight.
 * A região vem com a linha de base em y = 0 e começa em x = 0.
 */
export function textToRegion(font: opentype.Font, text: string, capHeight: number): Region {
  const unitScale = capHeight / capHeightUnits(font);
  const fontSize = font.unitsPerEm * unitScale;
  const path = font.getPath(text, 0, 0, fontSize, { kerning: true });
  const contours = flatten(path.commands, FLATTEN_TOL);
  // getPath usa Y para baixo; invertemos para o sistema da máquina (Y para cima).
  const flipped = contours.filter((c) => c.length >= 3).map((c) => c.map((p) => ({ x: p.x, y: -p.y })));
  // NonZero junta letras sobrepostas (fontes cursivas) e respeita os miolos (a, o, e…).
  return union(flipped);
}

/** Altura do "H" em unidades da fonte, medida no desenho real (mais confiável que a tabela OS/2). */
function capHeightUnits(font: opentype.Font): number {
  const os2 = (font.tables as { os2?: { sCapHeight?: number } }).os2;
  const glyph = font.charToGlyph("H");
  const bb = glyph.getBoundingBox();
  const measured = bb.y2 - bb.y1;
  if (measured > 0) return measured;
  return os2?.sCapHeight || font.unitsPerEm * 0.7;
}

type Cmd = opentype.PathCommand;

function flatten(commands: Cmd[], tol: number): Pt[][] {
  const out: Pt[][] = [];
  let cur: Pt[] = [];
  let last: Pt = { x: 0, y: 0 };
  let start: Pt = { x: 0, y: 0 };
  for (const c of commands) {
    switch (c.type) {
      case "M":
        if (cur.length) out.push(cur);
        cur = [{ x: c.x, y: c.y }];
        last = start = { x: c.x, y: c.y };
        break;
      case "L":
        cur.push({ x: c.x, y: c.y });
        last = { x: c.x, y: c.y };
        break;
      case "Q": {
        const p1 = { x: c.x1, y: c.y1 };
        const p2 = { x: c.x, y: c.y };
        const n = segmentsFor(last, p1, p1, p2, tol);
        for (let i = 1; i <= n; i++) cur.push(quad(last, p1, p2, i / n));
        last = p2;
        break;
      }
      case "C": {
        const p1 = { x: c.x1, y: c.y1 };
        const p2 = { x: c.x2, y: c.y2 };
        const p3 = { x: c.x, y: c.y };
        const n = segmentsFor(last, p1, p2, p3, tol);
        for (let i = 1; i <= n; i++) cur.push(cubic(last, p1, p2, p3, i / n));
        last = p3;
        break;
      }
      case "Z":
        if (cur.length) out.push(cur);
        cur = [];
        last = start;
        break;
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

function segmentsFor(p0: Pt, p1: Pt, p2: Pt, p3: Pt, tol: number): number {
  // Estimativa clássica: o desvio de uma curva cai com o quadrado do número de segmentos.
  const dd = Math.max(
    Math.hypot(p0.x - 2 * p1.x + p2.x, p0.y - 2 * p1.y + p2.y),
    Math.hypot(p1.x - 2 * p2.x + p3.x, p1.y - 2 * p2.y + p3.y),
  );
  return Math.min(64, Math.max(1, Math.ceil(Math.sqrt((3 * dd) / (4 * tol)))));
}

function quad(p0: Pt, p1: Pt, p2: Pt, t: number): Pt {
  const u = 1 - t;
  return { x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y };
}

function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

/** Centraliza a região (pela caixa envolvente) no ponto dado. */
export function centerAt(r: Region, cx: number, cy: number): Region {
  if (r.length === 0) return r;
  const b = bounds(r);
  const dx = cx - (b.minX + b.maxX) / 2;
  const dy = cy - (b.minY + b.maxY) / 2;
  return r.map((p) => p.map((q) => ({ x: q.x + dx, y: q.y + dy })));
}
