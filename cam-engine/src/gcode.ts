/** Minimal G-code reader (GRBL subset), shared by the verifier and the simulator. */

export interface Word {
  letter: string;
  value: number;
}

export interface Line {
  number: number;
  raw: string;
  words: Word[];
  /** Line starting with "$" (GRBL system/settings command). */
  system: boolean;
}

export function parseLines(gcode: string): Line[] {
  return gcode.split(/\r?\n/).map((raw, i) => {
    const code = raw.replace(/\([^)]*\)/g, "").replace(/;.*$/, "").trim();
    const system = code.startsWith("$");
    const words: Word[] = [];
    if (!system) {
      const re = /([A-Za-z])\s*([-+]?(?:\d+\.?\d*|\.\d+))/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(code))) words.push({ letter: m[1].toUpperCase(), value: Number(m[2]) });
      const leftover = code.replace(re, "").replace(/\s+/g, "").replace(/^%$/, "");
      if (leftover.length) words.push({ letter: "?", value: NaN });
    }
    return { number: i + 1, raw, words, system };
  });
}

export interface Segment {
  line: number;
  rapid: boolean;
  from: { x: number; y: number; z: number };
  to: { x: number; y: number; z: number };
  feed: number;
  spindleOn: boolean;
  /** For arcs: intermediate points, already interpolated. */
  points?: { x: number; y: number; z: number }[];
}

/**
 * Interprets the moves in absolute coordinates (mm). Assumes the verifier has already
 * rejected G20/G91; here we only track the modal state.
 */
export function toSegments(lines: Line[], start = { x: 0, y: 0, z: 0 }): Segment[] {
  const segs: Segment[] = [];
  let pos = { ...start };
  let motion = 0;
  let feed = 0;
  let spindleOn = false;
  for (const l of lines) {
    const get = (c: string) => l.words.find((w) => w.letter === c)?.value;
    for (const w of l.words) {
      if (w.letter === "G" && [0, 1, 2, 3].includes(w.value)) motion = w.value;
      if (w.letter === "M" && (w.value === 3 || w.value === 4)) spindleOn = true;
      if (w.letter === "M" && (w.value === 5 || w.value === 30 || w.value === 2)) spindleOn = false;
    }
    const f = get("F");
    if (f !== undefined) feed = f;
    const isDwell = l.words.some((w) => w.letter === "G" && w.value === 4);
    const x = get("X");
    const y = get("Y");
    const z = get("Z");
    if (isDwell || (x === undefined && y === undefined && z === undefined)) continue;
    const to = { x: x ?? pos.x, y: y ?? pos.y, z: z ?? pos.z };
    const seg: Segment = { line: l.number, rapid: motion === 0, from: pos, to, feed, spindleOn };
    if (motion === 2 || motion === 3) {
      const i = get("I") ?? 0;
      const j = get("J") ?? 0;
      seg.points = arcPoints(pos, to, { x: pos.x + i, y: pos.y + j }, motion === 2);
    }
    segs.push(seg);
    pos = to;
  }
  return segs;
}

function arcPoints(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, c: { x: number; y: number }, cw: boolean) {
  const r = Math.hypot(a.x - c.x, a.y - c.y);
  const a0 = Math.atan2(a.y - c.y, a.x - c.x);
  let a1 = Math.atan2(b.y - c.y, b.x - c.x);
  if (cw) {
    if (a1 >= a0) a1 -= 2 * Math.PI;
  } else if (a1 <= a0) a1 += 2 * Math.PI;
  const n = Math.max(4, Math.ceil((Math.abs(a1 - a0) * r) / 0.25));
  const pts = [];
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    const ang = a0 + (a1 - a0) * t;
    pts.push({ x: c.x + r * Math.cos(ang), y: c.y + r * Math.sin(ang), z: a.z + (b.z - a.z) * t });
  }
  return pts;
}
