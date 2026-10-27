/**
 * Linhas para recomeçar um trabalho no meio (depois de um alarme, por exemplo). Lê o estado das
 * linhas anteriores: unidades, avanço, rotação e a última posição. Sobe ao Z seguro, liga o
 * spindle e espera ele acelerar, vai por cima até o último X/Y e desce no avanço até o último Z.
 * Assim a linha seguinte continua exatamente de onde o corte estava. Supõe G90 (o CarvCAM só gera G90).
 */
export function resumePreamble(lines: string[], fromLine: number): string[] {
  let units = "G21";
  let spindle = "";
  let feed = 0;
  let safeZ = 5;
  const pos: { x?: number; y?: number; z?: number } = {};
  for (const raw of lines.slice(0, fromLine - 1)) {
    const l = raw.replace(/\(.*?\)|;.*$/g, "").toUpperCase();
    if (/G20\b/.test(l)) units = "G20";
    if (/G21\b/.test(l)) units = "G21";
    const s = /(M[34])\b.*?S([\d.]+)|S([\d.]+).*?(M[34])\b/.exec(l);
    if (s) spindle = `${s[1] ?? s[4]} S${s[2] ?? s[3]}`;
    if (/M5\b/.test(l)) spindle = "";
    const f = /F([\d.]+)/.exec(l);
    if (f) feed = Number(f[1]);
    if (/G53\b/.test(l)) continue; // movimento em coordenadas de máquina não conta como posição do trabalho
    for (const m of l.matchAll(/([XYZ])(-?[\d.]+)/g)) pos[m[1].toLowerCase() as "x" | "y" | "z"] = Number(m[2]);
    const z = /G0\b.*Z([\d.]+)/.exec(l);
    if (z) safeZ = Math.max(safeZ, Number(z[1]));
  }
  const out = [units, "G90", `G0 Z${safeZ}`];
  if (spindle) out.push(spindle, "G4 P3");
  if (pos.x !== undefined || pos.y !== undefined) out.push(`G0${pos.x !== undefined ? ` X${pos.x}` : ""}${pos.y !== undefined ? ` Y${pos.y}` : ""}`);
  if (pos.z !== undefined && pos.z < safeZ) out.push(`G1 Z${pos.z} F${Math.max(50, Math.round((feed || 300) / 2))}`);
  if (feed) out.push(`F${feed}`);
  return out;
}
