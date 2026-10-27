import { parseLines, toSegments } from "../gcode.js";
import type { Tool } from "../schema.js";

/**
 * Simulação de remoção de material por mapa de alturas: o mesmo princípio do `carve.ts`
 * do rudra496/cnc (MIT), reescrito sem Three.js para rodar em testes, em worker ou no servidor.
 * Cada célula guarda a altura do material (0 = face de cima intacta, negativo = usinado).
 */
export class Heightmap {
  readonly cols: number;
  readonly rows: number;
  readonly h: Float32Array;

  constructor(
    readonly x0: number,
    readonly y0: number,
    readonly width: number,
    readonly height: number,
    readonly res: number,
  ) {
    this.cols = Math.ceil(width / res) + 1;
    this.rows = Math.ceil(height / res) + 1;
    this.h = new Float32Array(this.cols * this.rows);
  }

  at(x: number, y: number): number {
    const i = Math.round((x - this.x0) / this.res);
    const j = Math.round((y - this.y0) / this.res);
    if (i < 0 || j < 0 || i >= this.cols || j >= this.rows) return 0;
    return this.h[j * this.cols + i];
  }

  /** Carimba a fresa com a ponta em (x, y, z). */
  stamp(x: number, y: number, z: number, tool: Tool) {
    if (z >= 0) return;
    const r = tool.diameter / 2;
    const vTan = tool.type === "vbit" ? Math.tan(((tool.angle ?? 60) * Math.PI) / 360) : 0;
    // Uma V-bit só corta até o raio em que o cone sai do material.
    const reach = tool.type === "vbit" ? Math.min(r, -z * vTan) : r;
    const i0 = Math.max(0, Math.floor((x - reach - this.x0) / this.res));
    const i1 = Math.min(this.cols - 1, Math.ceil((x + reach - this.x0) / this.res));
    const j0 = Math.max(0, Math.floor((y - reach - this.y0) / this.res));
    const j1 = Math.min(this.rows - 1, Math.ceil((y + reach - this.y0) / this.res));
    const r2 = reach * reach;
    for (let j = j0; j <= j1; j++) {
      const cy = this.y0 + j * this.res - y;
      for (let i = i0; i <= i1; i++) {
        const cx = this.x0 + i * this.res - x;
        const d2 = cx * cx + cy * cy;
        if (d2 > r2) continue;
        const surf = tool.type === "vbit" ? z + Math.sqrt(d2) / vTan : z;
        const k = j * this.cols + i;
        if (surf < this.h[k]) this.h[k] = surf;
      }
    }
  }
}

/** Simula um G-code inteiro com uma fresa (ou uma por ferramenta T, se o mapa for dado). */
export function simulate(gcode: string, tools: Tool[] | Tool, box: { x0: number; y0: number; width: number; height: number }, res = 0.25): Heightmap {
  const hm = new Heightmap(box.x0, box.y0, box.width, box.height, res);
  const list = Array.isArray(tools) ? tools : [tools];
  const lines = parseLines(gcode);
  // Ferramenta ativa por linha (T#).
  const toolAt = new Map<number, Tool>();
  let active = list[0];
  for (const l of lines) {
    const t = l.words.find((w) => w.letter === "T");
    if (t) active = list.find((x) => x.id === t.value) ?? active;
    toolAt.set(l.number, active);
  }
  for (const s of toSegments(lines, { x: 0, y: 0, z: 10 })) {
    const tool = toolAt.get(s.line) ?? list[0];
    const pts = [s.from, ...(s.points ?? [s.to])];
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1];
      const b = pts[k];
      if (a.z >= 0 && b.z >= 0) continue;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const n = Math.max(1, Math.ceil(len / (res * 0.5)));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        hm.stamp(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t, tool);
      }
    }
  }
  return hm;
}
