import { areaD, FillRule, simplifyPathsD, unionD, type PathD } from "clipper2-ts";
import type { Pt, Region } from "./geometry/clip.js";

/**
 * Vetorização de imagem (bitmap → contornos). Pixels "dentro" (escuros, por padrão) viram
 * área; segue as bordas entre pixels dentro e fora, junta em contornos fechados, descarta
 * manchas pequenas, simplifica e suaviza a escada dos pixels.
 *
 * Coordenadas de saída em pixels, Y para baixo (como na imagem); quem chama converte para mm.
 */

export interface TraceOpts {
  /** 0–255: luminância abaixo disso conta como "dentro". */
  limiar?: number;
  /** Inverte: claro vira dentro. */
  inverter?: boolean;
  /** Ignora contornos com área menor que isto (px²). */
  manchaMin?: number;
  /** Tolerância da simplificação, em px. */
  detalhe?: number;
  /** Passes de suavização (0–4). */
  suavizar?: number;
}

/** Máscara binária a partir de RGBA (transparente conta como claro). */
export function maskFromRgba(data: Uint8ClampedArray | Uint8Array, w: number, h: number, limiar = 128, inverter = false): Uint8Array {
  const m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = data[i * 4 + 3] / 255;
    const lum = (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) * a + 255 * (1 - a);
    const dark = lum < limiar;
    m[i] = dark !== inverter ? 1 : 0;
  }
  return m;
}

export function traceMask(mask: Uint8Array, w: number, h: number, o: TraceOpts = {}): Region {
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? mask[y * w + x] : 0);
  // Arestas orientadas entre pixels, com o "dentro" à esquerda (em Y para baixo, sentido
  // horário na tela). Vértices na grade (w+1)×(h+1).
  const W = w + 1;
  const out = new Map<number, number[]>();
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const k = y0 * W + x0;
    const v = y1 * W + x1;
    const l = out.get(k);
    if (l) l.push(v);
    else out.set(k, [v]);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!at(x, y)) continue;
      if (!at(x, y - 1)) add(x, y, x + 1, y); // topo: →
      if (!at(x + 1, y)) add(x + 1, y, x + 1, y + 1); // direita: ↓
      if (!at(x, y + 1)) add(x + 1, y + 1, x, y + 1); // baixo: ←
      if (!at(x - 1, y)) add(x, y + 1, x, y); // esquerda: ↑
    }
  }

  const loops: PathD[] = [];
  const pop = (k: number, prevDir?: [number, number]): number | undefined => {
    const l = out.get(k);
    if (!l || !l.length) return undefined;
    let idx = 0;
    if (l.length > 1 && prevDir) {
      // Vértice em sela (dois pixels só pela diagonal): vira sempre para o mesmo lado, para
      // os contornos não se cruzarem.
      const kx = k % W;
      const ky = Math.floor(k / W);
      let best = -Infinity;
      l.forEach((v, i) => {
        const dx = (v % W) - kx;
        const dy = Math.floor(v / W) - ky;
        const cross = prevDir[0] * dy - prevDir[1] * dx;
        if (cross > best) {
          best = cross;
          idx = i;
        }
      });
    }
    const v = l.splice(idx, 1)[0];
    if (!l.length) out.delete(k);
    return v;
  };
  for (const start of [...out.keys()]) {
    while (out.has(start)) {
      const pts: Pt[] = [];
      let k = start;
      let dir: [number, number] | undefined;
      for (let guard = 0; guard < 4 * (w + 2) * (h + 2); guard++) {
        const kx = k % W;
        const ky = Math.floor(k / W);
        const v = pop(k, dir);
        if (v === undefined) break;
        const vx = v % W;
        const vy = Math.floor(v / W);
        const nd: [number, number] = [vx - kx, vy - ky];
        // Só guarda os cantos (onde a direção muda).
        if (!dir || dir[0] !== nd[0] || dir[1] !== nd[1]) pts.push({ x: kx, y: ky });
        dir = nd;
        k = v;
        if (k === start) break;
      }
      if (pts.length >= 3) loops.push(pts);
    }
  }

  const manchaMin = o.manchaMin ?? 4;
  let r: PathD[] = loops.filter((p) => Math.abs(areaD(p)) >= manchaMin);
  const passes = Math.max(0, Math.min(4, Math.round(o.suavizar ?? 2)));
  for (let i = 0; i < passes; i++) r = r.map(chaikin);
  r = simplifyPathsD(r, o.detalhe ?? 0.6, true).filter((p) => p.length >= 3);
  // Par-ímpar resolve furos e ilhas independentemente da orientação de cada contorno.
  return r.length ? unionD(r, FillRule.EvenOdd) : [];
}

/** Um passe de Chaikin (corta os cantos a 1/4 e 3/4): tira a escada dos pixels. */
function chaikin(p: PathD): PathD {
  const out: PathD = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    out.push({ x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y }, { x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y });
  }
  return out;
}

/** Região → SVG (path par-ímpar), em pixels, para virar um desenho importado comum. */
export function regionToSvg(r: Region, w: number, h: number): string {
  const d = r.map((p) => "M" + p.map((q) => `${q.x.toFixed(2)} ${q.y.toFixed(2)}`).join("L") + "Z").join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}px" height="${h}px"><path fill="#000" fill-rule="evenodd" d="${d}"/></svg>`;
}
