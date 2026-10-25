import { EndType, inflatePathsD, JoinType } from "clipper2-ts";
import type { IconId } from "../schema.js";
import { bounds, union, type Pt, type Region } from "./clip.js";

const ARC_STEP = 0.25; // mm entre pontos nos arcos

export function rect(x: number, y: number, w: number, h: number): Region {
  return [[{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]];
}

export function circle(cx: number, cy: number, r: number): Region {
  const n = Math.max(24, Math.ceil((2 * Math.PI * r) / ARC_STEP));
  const p: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    p.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return [p];
}

/** Contorno da placa: retângulo com cantos retos, arredondados ou chanfrados. */
export function plateOutline(x: number, y: number, w: number, h: number, tipo: "reta" | "arredondada" | "chanfrada", raio: number): Region {
  const r = Math.min(raio, w / 2, h / 2);
  if (tipo === "reta" || r <= 0) return rect(x, y, w, h);
  if (tipo === "chanfrada") {
    return [[
      { x: x + r, y }, { x: x + w - r, y }, { x: x + w, y: y + r }, { x: x + w, y: y + h - r },
      { x: x + w - r, y: y + h }, { x: x + r, y: y + h }, { x, y: y + h - r }, { x, y: y + r },
    ]];
  }
  const p: Pt[] = [];
  const corners: [number, number, number][] = [
    [x + w - r, y + r, -90],
    [x + w - r, y + h - r, 0],
    [x + r, y + h - r, 90],
    [x + r, y + r, 180],
  ];
  const n = Math.max(6, Math.ceil((Math.PI / 2) * r / ARC_STEP));
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= n; i++) {
      const a = ((a0 + (90 * i) / n) * Math.PI) / 180;
      p.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
  }
  return [p];
}

/**
 * Polígono regular inscrito no círculo de raio r. Com rotação 0 o lado de baixo fica
 * horizontal (é o que se espera de um hexágono ou triângulo numa placa).
 */
export function polygon(cx: number, cy: number, r: number, lados: number, rotacaoDeg = 0): Region {
  const n = Math.max(3, Math.round(lados));
  const a0 = -Math.PI / 2 + Math.PI / n + (rotacaoDeg * Math.PI) / 180;
  const p: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (2 * Math.PI * i) / n;
    p.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return [p];
}

/** Estrela com `pontas` pontas; `interno` é o raio interno como fração do externo. */
export function star(cx: number, cy: number, r: number, pontas: number, interno: number, rotacaoDeg = 0): Region {
  const n = Math.max(3, Math.round(pontas));
  const a0 = Math.PI / 2 + (rotacaoDeg * Math.PI) / 180;
  const p: Pt[] = [];
  for (let i = 0; i < 2 * n; i++) {
    const a = a0 + (Math.PI * i) / n;
    const rr = i % 2 === 0 ? r : r * interno;
    p.push({ x: cx + rr * Math.cos(a), y: cy + rr * Math.sin(a) });
  }
  return [p];
}

/**
 * Curva livre (Bézier cúbica por partes). Fechada: área (NonZero). Aberta: traço de `espessura`
 * com pontas redondas.
 */
export function curve(
  ox: number,
  oy: number,
  pontos: { x: number; y: number; ix?: number; iy?: number; ox?: number; oy?: number }[],
  fechada: boolean,
  espessura: number,
): Region {
  const line = curvePolyline(ox, oy, pontos, fechada);
  if (line.length < 2) return [];
  if (fechada) return line.length >= 3 ? union([line]) : [];
  return inflatePathsD([line], espessura / 2, JoinType.Round, EndType.Round, 2, 4, 0.02);
}

/** Pontos da curva achatada (mm absolutos), com passo de ~0,25 mm nas partes curvas. */
export function curvePolyline(
  ox: number,
  oy: number,
  pontos: { x: number; y: number; ix?: number; iy?: number; ox?: number; oy?: number }[],
  fechada: boolean,
): Pt[] {
  const n = pontos.length;
  if (!n) return [];
  const abs = pontos.map((p) => ({ x: ox + p.x, y: oy + p.y }));
  const out: Pt[] = [{ ...abs[0] }];
  const segs = fechada ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = pontos[i];
    const b = pontos[(i + 1) % n];
    const p0 = abs[i];
    const p3 = abs[(i + 1) % n];
    const straight = !a.ox && !a.oy && !b.ix && !b.iy;
    if (straight) {
      out.push({ ...p3 });
      continue;
    }
    const p1 = { x: p0.x + (a.ox ?? 0), y: p0.y + (a.oy ?? 0) };
    const p2 = { x: p3.x + (b.ix ?? 0), y: p3.y + (b.iy ?? 0) };
    const len = Math.hypot(p1.x - p0.x, p1.y - p0.y) + Math.hypot(p2.x - p1.x, p2.y - p1.y) + Math.hypot(p3.x - p2.x, p3.y - p2.y);
    const k = Math.max(2, Math.min(200, Math.ceil(len / ARC_STEP)));
    for (let j = 1; j <= k; j++) {
      const t = j / k;
      const u = 1 - t;
      out.push({
        x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
        y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
      });
    }
  }
  // Fechada: o último ponto repete o primeiro; tira para o polígono não ter vértice duplicado.
  if (fechada && out.length > 1) out.pop();
  return out;
}

/** Traço reto de (x1, y1) a (x2, y2), com pontas arredondadas e a largura dada. */
export function stroke(x1: number, y1: number, x2: number, y2: number, width: number): Region {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  return slot((x1 + x2) / 2, (y1 + y2) / 2, len + width, width, ang);
}

/** Rasgo oblongo (estádio), usado para pendurar a placa num prego ou parafuso. */
export function slot(cx: number, cy: number, length: number, width: number, angleDeg: number): Region {
  const r = width / 2;
  const half = Math.max(0, length / 2 - r);
  const n = Math.max(12, Math.ceil((Math.PI * r) / ARC_STEP));
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / n;
    pts.push({ x: half + r * Math.cos(a), y: r * Math.sin(a) });
  }
  for (let i = 0; i <= n; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / n;
    pts.push({ x: -half + r * Math.cos(a), y: r * Math.sin(a) });
  }
  const t = (angleDeg * Math.PI) / 180;
  return [pts.map((p) => ({ x: cx + p.x * Math.cos(t) - p.y * Math.sin(t), y: cy + p.x * Math.sin(t) + p.y * Math.cos(t) }))];
}

/** Ícone centralizado em (cx, cy), cabendo num quadrado de lado `size`. */
export function icon(id: IconId, cx: number, cy: number, size: number): Region {
  const raw = ICONS[id]();
  const b = bounds(raw);
  const s = size / Math.max(b.maxX - b.minX, b.maxY - b.minY);
  const mx = (b.minX + b.maxX) / 2;
  const my = (b.minY + b.maxY) / 2;
  return raw.map((p) => p.map((q) => ({ x: cx + (q.x - mx) * s, y: cy + (q.y - my) * s })));
}

const ICONS: Record<IconId, () => Region> = {
  coracao: () => {
    const p: Pt[] = [];
    for (let i = 0; i < 200; i++) {
      const t = (i / 200) * 2 * Math.PI;
      p.push({
        x: 16 * Math.sin(t) ** 3,
        y: 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t),
      });
    }
    return union([p]);
  },
  estrela: () => {
    const p: Pt[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 1 : 0.42;
      const a = Math.PI / 2 + (i * Math.PI) / 5;
      p.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
    }
    return union([p]);
  },
  casa: () =>
    union([[
      { x: -0.8, y: -1 }, { x: 0.8, y: -1 }, { x: 0.8, y: 0.2 }, { x: 1, y: 0.2 },
      { x: 0, y: 1 }, { x: -1, y: 0.2 }, { x: -0.8, y: 0.2 },
    ]]),
  folha: () => {
    // Lente formada por dois arcos, inclinada 45°, com um pequeno cabo.
    const p: Pt[] = [];
    const R = 1;
    const half = Math.PI / 3;
    for (let i = 0; i <= 60; i++) {
      const a = -half + (2 * half * i) / 60;
      p.push({ x: R * Math.sin(a), y: R * Math.cos(a) - R * Math.cos(half) });
    }
    for (let i = 0; i <= 60; i++) {
      const a = half - (2 * half * i) / 60;
      p.push({ x: R * Math.sin(a), y: -(R * Math.cos(a) - R * Math.cos(half)) });
    }
    const t = Math.PI / 4;
    const rot = p.map((q) => ({ x: q.x * Math.cos(t) - q.y * Math.sin(t), y: q.x * Math.sin(t) + q.y * Math.cos(t) }));
    const stem = [{ x: -0.45, y: -0.55 }, { x: -0.9, y: -1.0 }, { x: -1.0, y: -0.9 }, { x: -0.55, y: -0.45 }];
    return union([rot], [stem]);
  },
};
