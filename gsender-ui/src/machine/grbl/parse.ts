/**
 * Leitura das linhas que uma placa grbl ou grblHAL manda (LongBoard, SuperLongBoard, SLB-EXT,
 * SLB-LITE). Formato da documentação oficial do grbl 1.1 e do grblHAL.
 */
export interface V3 {
  x: number;
  y: number;
  z: number;
}

export type GrblState = "Idle" | "Run" | "Hold" | "Jog" | "Alarm" | "Door" | "Check" | "Home" | "Sleep" | "Tool";

export interface StatusReport {
  state: GrblState;
  /** Subestado (Hold:0 = parado em espera, Hold:1 = desacelerando; Door:n). */
  sub?: number;
  mpos?: V3;
  wpos?: V3;
  wco?: V3;
  feed?: number;
  rpm?: number;
  /** Overrides de avanço, rápido e rotação (%). */
  ov?: [number, number, number];
  /** Entradas ativas: X Y Z (fim de curso), P (sonda), D (porta), H (hold), R, S, E (E-stop no grblHAL). */
  pins?: string;
  /** Blocos livres no planejador e bytes livres no buffer serial. */
  bf?: [number, number];
  line?: number;
}

export type GrblMsg =
  | { type: "ok" }
  | { type: "error"; code: number }
  | { type: "alarm"; code: number }
  | { type: "status"; status: StatusReport }
  | { type: "welcome"; firmware: "grbl" | "grblHAL"; version: string }
  | { type: "ver"; version: string; info: string }
  | { type: "opt"; flags: string; planner?: number; rx?: number }
  | { type: "msg"; text: string }
  | { type: "prb"; pos: V3; ok: boolean }
  | { type: "setting"; key: string; value: string }
  | { type: "bracket"; text: string }
  | { type: "other"; text: string };

const STATES: GrblState[] = ["Idle", "Run", "Hold", "Jog", "Alarm", "Door", "Check", "Home", "Sleep", "Tool"];

function v3(s: string): V3 | undefined {
  const p = s.split(",").map(Number);
  if (p.length < 3 || p.slice(0, 3).some((n) => !Number.isFinite(n))) return undefined;
  return { x: p[0], y: p[1], z: p[2] };
}

export function parseStatus(body: string): StatusReport | null {
  const parts = body.split("|");
  const [name, sub] = parts[0].split(":");
  if (!STATES.includes(name as GrblState)) return null;
  const r: StatusReport = { state: name as GrblState };
  if (sub !== undefined && sub !== "") r.sub = Number(sub);
  for (const f of parts.slice(1)) {
    const i = f.indexOf(":");
    const k = i < 0 ? f : f.slice(0, i);
    const v = i < 0 ? "" : f.slice(i + 1);
    if (k === "MPos") r.mpos = v3(v);
    else if (k === "WPos") r.wpos = v3(v);
    else if (k === "WCO") r.wco = v3(v);
    else if (k === "FS" || k === "F") {
      const [fe, rp] = v.split(",").map(Number);
      r.feed = fe;
      if (rp !== undefined && Number.isFinite(rp)) r.rpm = rp;
    } else if (k === "Ov") {
      const o = v.split(",").map(Number);
      if (o.length >= 3) r.ov = [o[0], o[1], o[2]];
    } else if (k === "Pn") r.pins = v;
    else if (k === "Bf") {
      const b = v.split(",").map(Number);
      if (b.length >= 2) r.bf = [b[0], b[1]];
    } else if (k === "Ln") r.line = Number(v);
  }
  return r;
}

export function parseLine(raw: string): GrblMsg {
  const line = raw.trim();
  if (line === "ok") return { type: "ok" };
  let m = /^error:(\d+)/i.exec(line);
  if (m) return { type: "error", code: Number(m[1]) };
  m = /^ALARM:(\d+)/i.exec(line);
  if (m) return { type: "alarm", code: Number(m[1]) };
  if (line.startsWith("<") && line.endsWith(">")) {
    const status = parseStatus(line.slice(1, -1));
    if (status) return { type: "status", status };
  }
  m = /^(Grbl|GrblHAL)\s+(\S+)/i.exec(line);
  if (m) return { type: "welcome", firmware: /hal/i.test(m[1]) ? "grblHAL" : "grbl", version: m[2] };
  if (line.startsWith("[") && line.endsWith("]")) {
    const body = line.slice(1, -1);
    if (body.startsWith("VER:")) {
      const rest = body.slice(4);
      const i = rest.indexOf(":");
      return { type: "ver", version: i < 0 ? rest : rest.slice(0, i), info: i < 0 ? "" : rest.slice(i + 1) };
    }
    if (body.startsWith("OPT:")) {
      const [flags, planner, rx] = body.slice(4).split(",");
      return { type: "opt", flags, planner: planner ? Number(planner) : undefined, rx: rx ? Number(rx) : undefined };
    }
    if (body.startsWith("MSG:")) return { type: "msg", text: body.slice(4).trim() };
    if (body.startsWith("PRB:")) {
      const [p, ok] = body.slice(4).split(":");
      const pos = v3(p);
      if (pos) return { type: "prb", pos, ok: ok === "1" };
    }
    return { type: "bracket", text: body };
  }
  m = /^\$(\w+)=(.*)$/.exec(line);
  if (m) return { type: "setting", key: m[1], value: m[2] };
  return { type: "other", text: line };
}

/** Texto curto dos erros mais comuns (grbl 1.1 / grblHAL). */
export const ERROR_TEXT: Record<number, string> = {
  1: "G-code words consist of a letter and a value",
  2: "Numeric value format is not valid",
  3: "'$' command not recognized",
  5: "Homing is not enabled in the settings",
  8: "Command only works when the machine is idle",
  9: "Locked by an alarm: unlock or find home first",
  15: "Jog target is outside the machine travel",
  20: "Unsupported or invalid G-code command",
  22: "Feed rate has not been set",
  24: "Two G-code commands that both need the XYZ words",
  33: "Motion target is invalid",
  79: "Command not allowed while the E-stop is active",
};

/** Alarmes do grbl/grblHAL agrupados nas telas de alarme do CarvCAM. */
export function alarmKind(code: number): "limit" | "lost" | "probe" | "estop" {
  if (code === 1 || code === 2) return "limit";
  if (code === 4 || code === 5) return "probe";
  if (code === 10) return "estop";
  return "lost";
}

/** Linha de G-code pronta para enviar: sem comentários e espaços sobrando; vazia se não houver nada. */
export function cleanLine(raw: string): string {
  return raw
    .replace(/\(.*?\)/g, "")
    .replace(/;.*$/, "")
    .trim();
}
