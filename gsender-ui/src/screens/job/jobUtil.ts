import { parseLines, toSegments, type GenerateResult } from "@gsender-next/cam-engine";
import { create } from "zustand";
import { bitById, type Preset } from "../../lib/catalog";
import type { Design } from "../../state/design";

/** Minutos legíveis: "28 min", "1 h 5 min", "<1 min". */
export function fmtMin(min: number) {
  if (!isFinite(min)) return "—";
  if (min < 1) return "<1 min";
  if (min >= 60) return `${Math.floor(min / 60)} h ${Math.round(min % 60)} min`;
  return `${Math.round(min)} min`;
}

export const rpmText = (n: number) => `${Math.round(n).toLocaleString("en-US")} RPM`;

/** Etapa do fluxo que fica só na interface (o resto vem da máquina). */
interface Flow {
  stockOk: boolean;
  zeroSet: boolean;
  bitIn: boolean;
  routerOn: boolean;
  probeOpen: boolean;
  jogStep: number;
  set(p: Partial<Omit<Flow, "set">>): void;
}

export const useFlow = create<Flow>()((set) => ({
  stockOk: false,
  zeroSet: false,
  bitIn: false,
  routerOn: false,
  probeOpen: false,
  jogStep: 10,
  set: (p) => set(p),
}));

/** Nome da fresa para o número da ferramenta (T1 = principal, T2 = recorte). */
export function bitNameFor(design: Design, toolId: number) {
  const id = toolId === 2 && design.useBit2 && design.bit2 ? design.bit2 : design.bit;
  return bitById(id)?.name ?? `T${toolId}`;
}

export interface OpGroup {
  label: string;
  tool: number;
  /** Índices em result.operacoes (e em job.ops, que segue a mesma ordem). */
  raw: number[];
  sec: number;
}

/** Tempo (s) de cada operação, lido do próprio G-code e normalizado pelo tempo do verificador. */
export function opSeconds(result: GenerateResult): number[] {
  const lines = parseLines(result.gcode);
  const segs = toSegments(lines, { x: 0, y: 0, z: 10 });
  const opAt: number[] = [];
  let cur = -1;
  for (const l of lines) {
    if (/;\s*---\s*(.+?)\s*---/.test(l.raw)) cur++;
    opAt[l.number] = cur;
  }
  const out = result.operations.map(() => 0);
  for (const s of segs) {
    const len = Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y, s.to.z - s.from.z);
    const t = (len / (s.rapid ? 4000 : Math.max(1, s.feed))) * 60;
    const i = Math.max(0, opAt[s.line] ?? 0);
    if (i < out.length) out[i] += t;
  }
  const sum = out.reduce((a, b) => a + b, 0) || 1;
  const total = result.verification?.stats.estimatedTimeSec ?? sum;
  return out.map((t) => (t / sum) * total);
}

/** Agrupa as operações do motor em passos legíveis ("Drill 2 mounting holes"…). */
export function groupOps(result: GenerateResult, tabs: number, lettering: boolean): OpGroup[] {
  const secs = opSeconds(result);
  const groups: OpGroup[] = [];
  const ops = result.operations;
  let i = 0;
  while (i < ops.length) {
    const o = ops[i];
    const same: number[] = [i];
    // Junta operações vizinhas do mesmo tipo e da mesma fresa.
    while (i + 1 < ops.length && ops[i + 1].type === o.type && ops[i + 1].tool === o.tool && o.type !== "profile") same.push(++i);
    const names = same.map((k) => elementName(ops[k].name));
    let label = "";
    if (o.type === "engrave") label = names.length === 1 ? `Engrave ${names[0]}` : names.length === 2 ? `Engrave ${names[0]} and ${names[1]}` : `Engrave ${names.length} details`;
    else if (o.type === "relief") label = `Lower the background · ${fmtNum(o.depth)} mm`;
    else if (o.type === "cutout") label = "Cut through the letters";
    else if (o.type === "hole") {
      const holes = same.filter((k) => /furo \d/i.test(ops[k].name)).length;
      const slots = same.length - holes;
      label = [holes ? `Drill ${holes} mounting hole${holes > 1 ? "s" : ""}` : "", slots ? "cut the hanging slot" : ""].filter(Boolean).join(", ");
      label = label.charAt(0).toUpperCase() + label.slice(1);
    } else label = lettering ? "Cut out the letters" : tabs > 0 ? `Cut out with ${tabs} tabs` : "Cut out, no tabs";
    groups.push({ label, tool: o.tool, raw: same, sec: same.reduce((a, k) => a + secs[k], 0) });
    i++;
  }
  return groups;
}

const ICON_EN: Record<string, string> = { heart: "heart", star: "star", house: "house", leaf: "leaf" };
const SHAPE_EN: Record<string, string> = { "retângulo": "rectangle", "círculo": "circle", linha: "line" };

/** "Gravação: texto 1 (LUNA)" → “LUNA”; "Gravação: ícone 2 (folha)" → the leaf. */
function elementName(name: string) {
  const t = /texto \d+ \((.+)\)/.exec(name);
  if (t) return `“${t[1]}”`;
  const ic = /ícone \d+ \((\w+)\)/.exec(name);
  if (ic) return `the ${ICON_EN[ic[1]] ?? ic[1]}`;
  const sh = /(retângulo|círculo|linha) \d+/.exec(name);
  if (sh) return `the ${SHAPE_EN[sh[1]]}`;
  return "the details";
}

const fmtNum = (n: number) => String(Math.round(n * 10) / 10);

export const PRESETS: Preset[] = ["fast", "balanced", "detailed"];
