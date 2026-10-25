import type { Pt } from "../geometry/clip.js";

export interface Move {
  g: 0 | 1;
  x: number;
  y: number;
  z: number;
  f?: number;
}

export interface Feeds {
  avanco: number;
  mergulho: number;
  alturaRecuo: number;
  alturaSegura: number;
}

/**
 * Monta a sequência de movimentos garantindo as regras de segurança por construção:
 * deslocamento rápido (G0) só acima da face do material, e descida sempre em avanço controlado.
 */
export class PathBuilder {
  readonly moves: Move[] = [];
  x = 0;
  y = 0;
  z: number;

  constructor(readonly feeds: Feeds) {
    this.z = feeds.alturaSegura;
  }

  private push(m: Move) {
    if (m.x === this.x && m.y === this.y && m.z === this.z) return;
    this.moves.push(m);
    this.x = m.x;
    this.y = m.y;
    this.z = m.z;
  }

  rapidZ(z: number) {
    if (z < 0) throw new Error("G0 abaixo da face do material não é permitido");
    this.push({ g: 0, x: this.x, y: this.y, z });
  }

  /** Sobe até a altura de recuo (dentro da operação). */
  retract() {
    if (this.z < this.feeds.alturaRecuo) this.rapidZ(this.feeds.alturaRecuo);
  }

  safe() {
    if (this.z < this.feeds.alturaSegura) this.rapidZ(this.feeds.alturaSegura);
  }

  /** Vai até (x, y) pelo alto. */
  travel(p: Pt) {
    if (Math.abs(p.x - this.x) < 1e-9 && Math.abs(p.y - this.y) < 1e-9) return;
    this.retract();
    this.push({ g: 0, x: p.x, y: p.y, z: this.z });
  }

  /**
   * Desce até z: rápido só até 0,5 mm acima da face do material, depois em avanço de mergulho.
   */
  plunge(z: number) {
    if (this.z > 0.5) this.rapidZ(0.5);
    if (z < this.z) this.push({ g: 1, x: this.x, y: this.y, z, f: this.feeds.mergulho });
  }

  feed(p: Pt, z = this.z) {
    const f = z < this.z ? this.feeds.mergulho : this.feeds.avanco;
    this.push({ g: 1, x: p.x, y: p.y, z, f });
  }

  feedZ(z: number) {
    this.push({ g: 1, x: this.x, y: this.y, z, f: this.feeds.mergulho });
  }
}

/** Níveis de profundidade, do mais raso ao final, com passadas iguais. */
export function depthLevels(depth: number, stepdown: number): number[] {
  const n = Math.max(1, Math.ceil(depth / stepdown - 1e-9));
  return Array.from({ length: n }, (_, i) => -round4((depth * (i + 1)) / n));
}

/** Gira o contorno fechado para começar no vértice mais próximo de `from`. */
export function rotateToNearest(path: Pt[], from: Pt): Pt[] {
  let best = 0;
  let bd = Infinity;
  path.forEach((p, i) => {
    const d = (p.x - from.x) ** 2 + (p.y - from.y) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return [...path.slice(best), ...path.slice(0, best)];
}

export function dist(a: Pt, b: Pt) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export const round4 = (v: number) => Math.round(v * 1e4) / 1e4;
