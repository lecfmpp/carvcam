import { parseLines, toSegments } from "./gcode.js";

/**
 * Verificador de G-code. Roda sobre qualquer arquivo (gerado aqui, pela IA ou importado)
 * antes de mandar para a máquina. Ele não confia no gerador: relê o texto final.
 */
export interface VerifyLimits {
  /** Caixa permitida para o centro da fresa, em coordenadas do trabalho. */
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  /** Profundidade máxima permitida (negativa). */
  zMin: number;
  zMax: number;
  avancoMax: number;
  rpmMin: number;
  rpmMax: number;
}

export interface Problema {
  linha: number;
  severidade: "erro" | "aviso";
  mensagem: string;
}

export interface VerifyResult {
  ok: boolean;
  problemas: Problema[];
  estatisticas: {
    linhas: number;
    extensao: { xMin: number; xMax: number; yMin: number; yMax: number; zMin: number; zMax: number };
    comprimentoCorte: number;
    tempoEstimadoSeg: number;
  };
}

const ALLOWED_G = new Set([0, 1, 2, 3, 4, 17, 21, 90, 94]);
const ALLOWED_M = new Set([2, 3, 5, 6, 30]);
const ALLOWED_LETTERS = new Set(["G", "M", "T", "S", "F", "X", "Y", "Z", "I", "J", "P", "N"]);

export function verifyGcode(gcode: string, lim: VerifyLimits, rapidRate = lim.avancoMax): VerifyResult {
  const problemas: Problema[] = [];
  const err = (linha: number, mensagem: string) => problemas.push({ linha, severidade: "erro", mensagem });
  const warn = (linha: number, mensagem: string) => problemas.push({ linha, severidade: "aviso", mensagem });
  const lines = parseLines(gcode);

  let mm = false;
  let abs = false;
  for (const l of lines) {
    if (l.system) {
      err(l.number, "Comando de sistema/configuração ($) não é permitido em arquivo de corte.");
      continue;
    }
    const hasMotion = l.words.some((w) => ["X", "Y", "Z"].includes(w.letter));
    for (const w of l.words) {
      if (!ALLOWED_LETTERS.has(w.letter)) err(l.number, `Palavra não permitida: "${l.raw.trim()}".`);
      else if (w.letter === "G" && !ALLOWED_G.has(w.value)) {
        if (w.value === 20) err(l.number, "G20 (polegadas) não é aceito; o arquivo precisa estar em milímetros (G21).");
        else if (w.value === 91) err(l.number, "G91 (incremental) não é aceito; use coordenadas absolutas (G90).");
        else err(l.number, `G${w.value} não está na lista de comandos permitidos.`);
      } else if (w.letter === "M" && !ALLOWED_M.has(w.value)) err(l.number, `M${w.value} não está na lista de comandos permitidos.`);
      if (w.letter === "G" && w.value === 21) mm = true;
      if (w.letter === "G" && w.value === 90) abs = true;
      if (w.letter === "F" && w.value > lim.avancoMax) err(l.number, `Avanço F${w.value} acima do máximo da máquina (${lim.avancoMax} mm/min).`);
      if (w.letter === "S" && (w.value < lim.rpmMin || w.value > lim.rpmMax)) warn(l.number, `Rotação S${w.value} fora da faixa do spindle (${lim.rpmMin}–${lim.rpmMax}).`);
    }
    if (hasMotion && !mm) err(l.number, "Movimento antes de G21: unidade indefinida.");
    if (hasMotion && !abs) err(l.number, "Movimento antes de G90: modo de coordenadas indefinido.");
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
        // Só conta a parte do movimento que fica abaixo da face do material.
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
        err(s.line, `Movimento sai da área permitida (X${round(p.x)} Y${round(p.y)}).`);
        break;
      }
      if (p.z < lim.zMin - 1e-6) {
        err(s.line, `Profundidade Z${round(p.z)} passa do limite de ${round(lim.zMin)} mm.`);
        break;
      }
      if (p.z > lim.zMax + 1e-6) {
        err(s.line, `Altura Z${round(p.z)} acima do limite de ${round(lim.zMax)} mm.`);
        break;
      }
    }
    if (s.rapid && s.from.z < 0 && (s.to.x !== s.from.x || s.to.y !== s.from.y)) err(s.line, "Movimento rápido (G0) lateral com a fresa dentro do material.");
    else if (s.rapid && s.to.z < 0) err(s.line, "Movimento rápido (G0) para dentro do material.");
    if (!s.rapid && s.to.z < 0 && !s.spindleOn) err(s.line, "Corte com o spindle desligado.");
    if (!s.rapid && s.feed <= 0) err(s.line, "Movimento de corte sem avanço (F) definido.");
  }

  // Um erro por linha basta para a leitura humana.
  const seen = new Set<string>();
  const dedup = problemas.filter((p) => {
    const k = `${p.linha}:${p.mensagem}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return {
    ok: !dedup.some((p) => p.severidade === "erro"),
    problemas: dedup,
    estatisticas: { linhas: lines.length, extensao: ext, comprimentoCorte: Math.round(cut), tempoEstimadoSeg: Math.round(time) },
  };
}

const round = (v: number) => Math.round(v * 1000) / 1000;
