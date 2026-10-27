import type { Pt } from "../geometry/clip.js";

export interface Move {
  g: 0 | 1;
  x: number;
  y: number;
  z: number;
  f?: number;
}

export interface Feeds {
  feed: number;
  plunge: number;
  retractHeight: number;
  safeHeight: number;
}

/**
 * Builds the sequence of moves, enforcing the safety rules by construction:
 * rapid moves (G0) only above the material surface, and plunges always at a controlled feed rate.
 */
export class PathBuilder {
  readonly moves: Move[] = [];
  x = 0;
  y = 0;
  z: number;

  constructor(readonly feeds: Feeds) {
    this.z = feeds.safeHeight;
  }

  private push(m: Move) {
    if (m.x === this.x && m.y === this.y && m.z === this.z) return;
    this.moves.push(m);
    this.x = m.x;
    this.y = m.y;
    this.z = m.z;
  }

  rapidZ(z: number) {
    if (z < 0) throw new Error("G0 below the material surface is not allowed");
    this.push({ g: 0, x: this.x, y: this.y, z });
  }

  /** Rises to the retract height (within the operation). */
  retract() {
    if (this.z < this.feeds.retractHeight) this.rapidZ(this.feeds.retractHeight);
  }

  safe() {
    if (this.z < this.feeds.safeHeight) this.rapidZ(this.feeds.safeHeight);
  }

  /** Moves to (x, y) at height. */
  travel(p: Pt) {
    if (Math.abs(p.x - this.x) < 1e-9 && Math.abs(p.y - this.y) < 1e-9) return;
    this.retract();
    this.push({ g: 0, x: p.x, y: p.y, z: this.z });
  }

  /**
   * Plunges to z: rapid only down to 0.5 mm above the material surface, then at the plunge rate.
   */
  plunge(z: number) {
    if (this.z > 0.5) this.rapidZ(0.5);
    if (z < this.z) this.push({ g: 1, x: this.x, y: this.y, z, f: this.feeds.plunge });
  }

  feed(p: Pt, z = this.z) {
    const f = z < this.z ? this.feeds.plunge : this.feeds.feed;
    this.push({ g: 1, x: p.x, y: p.y, z, f });
  }

  feedZ(z: number) {
    this.push({ g: 1, x: this.x, y: this.y, z, f: this.feeds.plunge });
  }
}

/** Depth levels, from the shallowest to the final one, with equal passes. */
export function depthLevels(depth: number, stepdown: number): number[] {
  const n = Math.max(1, Math.ceil(depth / stepdown - 1e-9));
  return Array.from({ length: n }, (_, i) => -round4((depth * (i + 1)) / n));
}

/** Rotates the closed outline to start at the vertex closest to `from`. */
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
