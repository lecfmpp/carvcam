import { parseLines, toSegments } from "./gcode.js";

/**
 * G-code verifier. Runs on any file (generated here, by the assistant or imported)
 * before it is sent to the machine. It does not trust the generator: it re-reads the final text.
 */
export interface VerifyLimits {
  /** Allowed box for the bit center, in work coordinates. */
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  /** Maximum allowed depth (negative). */
  zMin: number;
  zMax: number;
  maxFeed: number;
  rpmMin: number;
  rpmMax: number;
}

export interface Problem {
  line: number;
  severity: "error" | "warning";
  message: string;
}

export interface VerifyResult {
  ok: boolean;
  problems: Problem[];
  stats: {
    lines: number;
    extent: { xMin: number; xMax: number; yMin: number; yMax: number; zMin: number; zMax: number };
    cutLength: number;
    estimatedTimeSec: number;
  };
}

const ALLOWED_G = new Set([0, 1, 2, 3, 4, 17, 21, 90, 94]);
const ALLOWED_M = new Set([2, 3, 5, 6, 30]);
const ALLOWED_LETTERS = new Set(["G", "M", "T", "S", "F", "X", "Y", "Z", "I", "J", "P", "N"]);

export function verifyGcode(gcode: string, lim: VerifyLimits, rapidRate = lim.maxFeed): VerifyResult {
  const problems: Problem[] = [];
  const err = (line: number, message: string) => problems.push({ line, severity: "error", message });
  const warn = (line: number, message: string) => problems.push({ line, severity: "warning", message });
  const lines = parseLines(gcode);

  let mm = false;
  let abs = false;
  for (const l of lines) {
    if (l.system) {
      err(l.number, "System/settings commands ($) are not allowed in a carving file.");
      continue;
    }
    const hasMotion = l.words.some((w) => ["X", "Y", "Z"].includes(w.letter));
    for (const w of l.words) {
      if (!ALLOWED_LETTERS.has(w.letter)) err(l.number, `Word not allowed: "${l.raw.trim()}".`);
      else if (w.letter === "G" && !ALLOWED_G.has(w.value)) {
        if (w.value === 20) err(l.number, "G20 (inches) is not accepted; the file must be in millimeters (G21).");
        else if (w.value === 91) err(l.number, "G91 (incremental) is not accepted; use absolute coordinates (G90).");
        else err(l.number, `G${w.value} is not on the list of allowed commands.`);
      } else if (w.letter === "M" && !ALLOWED_M.has(w.value)) err(l.number, `M${w.value} is not on the list of allowed commands.`);
      if (w.letter === "G" && w.value === 21) mm = true;
      if (w.letter === "G" && w.value === 90) abs = true;
      if (w.letter === "F" && w.value > lim.maxFeed) err(l.number, `Feed rate F${w.value} is above the machine maximum (${lim.maxFeed} mm/min).`);
      if (w.letter === "S" && (w.value < lim.rpmMin || w.value > lim.rpmMax)) warn(l.number, `Spindle speed S${w.value} is outside the spindle range (${lim.rpmMin}–${lim.rpmMax}).`);
    }
    if (hasMotion && !mm) err(l.number, "Move before G21: units are undefined.");
    if (hasMotion && !abs) err(l.number, "Move before G90: coordinate mode is undefined.");
  }

  const segs = toSegments(lines, { x: 0, y: 0, z: lim.zMax });
  const ext = { xMin: Infinity, xMax: -Infinity, yMin: Infinity, yMax: -Infinity, zMin: Infinity, zMax: -Infinity };
  let cut = 0;
  let time = 0;
  for (const s of segs) {
    const pts = [s.from, ...(s.points ?? [s.to])];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      const len = Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y, p.z - pts[i - 1].z);
      time += (len / (s.rapid ? rapidRate : Math.max(1, s.feed))) * 60;
      if (!s.rapid) {
        // Only count the part of the move that is below the material surface.
        const z0 = pts[i - 1].z;
        const below = z0 < 0 && p.z < 0 ? 1 : z0 >= 0 && p.z >= 0 ? 0 : Math.abs(Math.min(z0, p.z)) / Math.abs(p.z - z0);
        cut += len * below;
      }
      ext.xMin = Math.min(ext.xMin, p.x);
      ext.xMax = Math.max(ext.xMax, p.x);
      ext.yMin = Math.min(ext.yMin, p.y);
      ext.yMax = Math.max(ext.yMax, p.y);
      ext.zMin = Math.min(ext.zMin, p.z);
      ext.zMax = Math.max(ext.zMax, p.z);
      if (p.x < lim.xMin - 1e-6 || p.x > lim.xMax + 1e-6 || p.y < lim.yMin - 1e-6 || p.y > lim.yMax + 1e-6) {
        err(s.line, `Move leaves the allowed area (X${round(p.x)} Y${round(p.y)}).`);
        break;
      }
      if (p.z < lim.zMin - 1e-6) {
        err(s.line, `Depth Z${round(p.z)} goes past the limit of ${round(lim.zMin)} mm.`);
        break;
      }
      if (p.z > lim.zMax + 1e-6) {
        err(s.line, `Height Z${round(p.z)} is above the limit of ${round(lim.zMax)} mm.`);
        break;
      }
    }
    if (s.rapid && s.from.z < 0 && (s.to.x !== s.from.x || s.to.y !== s.from.y)) err(s.line, "Sideways rapid move (G0) with the bit inside the material.");
    else if (s.rapid && s.to.z < 0) err(s.line, "Rapid move (G0) into the material.");
    if (!s.rapid && s.to.z < 0 && !s.spindleOn) err(s.line, "Cutting with the spindle off.");
    if (!s.rapid && s.feed <= 0) err(s.line, "Cutting move with no feed rate (F) set.");
  }

  // One error per line is enough for a human reader.
  const seen = new Set<string>();
  const dedup = problems.filter((p) => {
    const k = `${p.line}:${p.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return {
    ok: !dedup.some((p) => p.severity === "error"),
    problems: dedup,
    stats: { lines: lines.length, extent: ext, cutLength: Math.round(cut), estimatedTimeSec: Math.round(time) },
  };
}

const round = (v: number) => Math.round(v * 1000) / 1000;
