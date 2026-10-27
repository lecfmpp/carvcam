import type { Move } from "../cam/builder.js";
import type { Tool } from "../schema.js";

export interface PostOperation {
  name: string;
  tool: Tool;
  rpm: number;
  moves: Move[];
}

export interface PostHeader {
  title: string;
  stock: { width: number; height: number; thickness: number };
  safeHeight: number;
  /** Linhas extras de comentário no cabeçalho. */
  notes?: string[];
}

/**
 * Pós-processador GRBL/grblHAL. Só emite comandos da lista permitida pelo verificador:
 * G0 G1 G4 G17 G21 G90 G94, M3 M5 M6 M30, T S F X Y Z P.
 * Troca de ferramenta (M6) só aparece quando o trabalho usa mais de uma fresa;
 * o gSender trata o M6 conforme a configuração de troca de ferramenta do usuário.
 */
export function postGrbl(header: PostHeader, ops: PostOperation[]): string {
  const out: string[] = [];
  const tools = [...new Map(ops.map((o) => [o.tool.id, o.tool])).values()];
  out.push(`; ${header.title}`);
  out.push(`; Gerado por CarvCAM (cam-engine)`);
  out.push(`; Bloco: ${n(header.stock.width)} x ${n(header.stock.height)} x ${n(header.stock.thickness)} mm`);
  out.push(`; Origem: X0 Y0 no canto inferior esquerdo do bloco, Z0 na face de cima`);
  for (const t of tools) out.push(`; T${t.id}: ${t.name} (diametro ${n(t.diameter)} mm)`);
  for (const note of header.notes ?? []) out.push(`; ${note.replace(/[()]/g, "")}`);
  out.push("G21 G90 G17 G94");
  out.push(`G0 Z${n(header.safeHeight)}`);

  let x = NaN;
  let y = NaN;
  let z = header.safeHeight;
  let f = NaN;
  let g = -1;
  let currentTool = -1;
  let currentRpm = -1;

  for (const op of ops) {
    out.push(`; --- ${op.name} ---`);
    if (op.tool.id !== currentTool) {
      if (currentTool !== -1) {
        out.push(`G0 Z${n(header.safeHeight)}`, "M5");
        z = header.safeHeight;
      }
      if (tools.length > 1) out.push(`T${op.tool.id} M6`);
      currentTool = op.tool.id;
      currentRpm = -1;
    }
    if (op.rpm !== currentRpm) {
      out.push(`S${Math.round(op.rpm)} M3`, "G4 P3");
      currentRpm = op.rpm;
    }
    for (const m of op.moves) {
      const words: string[] = [];
      if (m.g !== g) words.push(`G${m.g}`);
      if (m.x !== x) words.push(`X${n(m.x)}`);
      if (m.y !== y) words.push(`Y${n(m.y)}`);
      if (m.z !== z) words.push(`Z${n(m.z)}`);
      if (words.length === 0 || (words.length === 1 && words[0].startsWith("G"))) continue;
      if (m.g === 1 && m.f !== undefined && m.f !== f) {
        words.push(`F${Math.round(m.f)}`);
        f = m.f;
      }
      if (m.g !== g) g = m.g;
      out.push(words.join(" "));
      x = m.x;
      y = m.y;
      z = m.z;
    }
  }
  out.push(`G0 Z${n(header.safeHeight)}`, "M5", "G0 X0 Y0", "M30");
  return out.join("\n") + "\n";
}

/** Número com até 3 casas, sem zeros sobrando. */
export function n(v: number): string {
  const s = (Math.round(v * 1000) / 1000).toFixed(3);
  const t = s.replace(/\.?0+$/, "");
  return t === "-0" ? "0" : t;
}
