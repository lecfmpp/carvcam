import { fmt, type Warning } from "../../warnings.js";
import type { CutParams } from "../../materials.js";
import type { MachineInput, MaterialId, ToolInput } from "../../schema.js";
import { HEADS, nearestDial, type HeadId } from "./heads.js";
import { compatibility, BIT_BY_ID, toTool, type SienciBit } from "./bits.js";
import { machineLimits, MACHINES, type MachineId } from "./machines.js";
import { sienciParams, type Speed } from "./table.js";

/** Mergulho máximo para descida reta (resources.sienci.com, "Feeds & Speeds - LongMill"). */
export const MAX_STRAIGHT_PLUNGE = 300;

/** O que o usuário escolhe na interface: máquina, router/spindle, fresas e velocidade. */
export interface SienciConfig {
  machine: MachineId;
  /** Padrão: o cabeçote padrão da máquina. */
  head?: HeadId;
  /** Fresa principal (gravação e relevo), id do catálogo. */
  bit: string;
  /** Fresa para recortes e furos. Padrão: a principal. */
  cutoutBit?: string;
  /** Padrão: a velocidade sugerida para a máquina. */
  speed?: Speed;
}

export interface ManualAdjustment {
  tool: number;
  rpm: number;
  dial: number;
  message: string;
}

export interface ResolvedConfig {
  machine: MachineInput;
  tool: ToolInput;
  cutoutTool?: ToolInput;
  cut?: Partial<CutParams>;
  cutoutCut?: Partial<CutParams>;
  warnings: Warning[];
  /** Quando o router não é controlado pelo G-code (Makita), o usuário precisa girar o dial. */
  manualAdjustments: ManualAdjustment[];
  source: string;
}

/** Traduz a escolha do usuário em limites, ferramentas e parâmetros de corte para o motor. */
export function resolveSienci(cfg: SienciConfig, material: MaterialId): ResolvedConfig {
  const machine = MACHINES[cfg.machine];
  const headId = cfg.head ?? machine.defaultHead;
  const head = HEADS[headId];
  const speed = cfg.speed ?? machine.defaultSpeed;
  const warnings: Warning[] = [];
  const manualAdjustments: ManualAdjustment[] = [];

  if (!machine.heads.includes(headId)) {
    warnings.push({ code: "BIT_INCOMPATIBLE", severity: "error", message: `O ${head.name} não é uma opção para a ${machine.name}.` });
  }

  const bits: { f: SienciBit; toolNumber: number; role: string }[] = [];
  const main = findBit(cfg.bit, warnings);
  if (main) bits.push({ f: main, toolNumber: 1, role: "principal" });
  const cutout = cfg.cutoutBit && cfg.cutoutBit !== cfg.bit ? findBit(cfg.cutoutBit, warnings) : undefined;
  if (cutout) bits.push({ f: cutout, toolNumber: 2, role: "de recorte" });

  const params: Partial<CutParams>[] = [];
  for (const { f, toolNumber, role } of bits) {
    if (!f.supportedInV1) {
      warnings.push({
        code: "BIT_NOT_SUPPORTED",
        severity: "error",
        message: `A fresa ${role} (${f.name}) não serve para placas e letreiros.`,
        suggestion: f.bestFor,
      });
    }
    const c = compatibility(f, headId);
    if (c.status === "incompatible") warnings.push({ code: "BIT_INCOMPATIBLE", severity: "error", message: c.reason });
    if (c.status === "with-accessory") {
      warnings.push({
        code: "BIT_NEEDS_ACCESSORY",
        severity: "warning",
        message: `Para usar a ${f.name} no ${head.name} você precisa de: ${c.accessory.name}.`,
        data: { url: c.accessory.url },
      });
    }

    const t = f.tableRow ? sienciParams(f.tableRow, material, speed) : undefined;
    if (!t) {
      warnings.push({
        code: "NO_SIENCI_TABLE",
        severity: "warning",
        message: `A Sienci não publica parâmetros da ${f.name} para este material; usando valores conservadores calculados.`,
      });
      params.push({});
      continue;
    }
    let stepdown = t.slotStepdown;
    if (f.compressionUpcut && stepdown <= f.compressionUpcut) {
      const minimum = f.compressionUpcut + 0.5;
      if (minimum <= t.pocketStepdown) {
        stepdown = minimum;
        warnings.push({
          code: "COMPRESSION_STEPDOWN",
          severity: "warning",
          message: `Passada aumentada para ${fmt(minimum)} mm: numa fresa de compressão a primeira passada precisa passar dos ${fmt(f.compressionUpcut)} mm de corte para cima.`,
        });
      } else {
        warnings.push({
          code: "COMPRESSION_STEPDOWN",
          severity: "warning",
          message: `Com este material e velocidade a passada fica abaixo de ${fmt(f.compressionUpcut)} mm, e a fresa de compressão vai lascar a face de cima.`,
          suggestion: "Use uma fresa downcut ou suba a velocidade da tabela.",
        });
      }
    }
    // O motor ainda desce reto (sem rampa). Fora de entalhe 3D, a Sienci recomenda
    // mergulho de 100–300 mm/min, bem abaixo do valor da tabela.
    const plunge = Math.min(t.plunge, MAX_STRAIGHT_PLUNGE);
    params.push({ rpm: t.rpm, feed: t.feed, plunge, stepdown, stepover: t.stepover });

    if (head.rpmControl === "manual") {
      const d = nearestDial(head, t.rpm);
      if (d) {
        manualAdjustments.push({
          tool: toolNumber,
          rpm: t.rpm,
          dial: d.position,
          message: `Antes de cortar com a ${f.name}, gire o dial do ${head.name} para ${d.position} (${d.rpm.toLocaleString("pt-BR")} RPM).`,
        });
      }
    }
  }

  return {
    machine: machineLimits(cfg.machine, headId),
    tool: main ? toTool(main, 1) : {},
    cutoutTool: cutout ? toTool(cutout, 2) : undefined,
    cut: params[0],
    cutoutCut: cutout ? params[1] : undefined,
    warnings,
    manualAdjustments,
    source: `Tabela Sienci Labs, velocidade ${speed}`,
  };
}

function findBit(id: string, warnings: Warning[]): SienciBit | undefined {
  const f = BIT_BY_ID.get(id);
  if (!f) warnings.push({ code: "BIT_INCOMPATIBLE", severity: "error", message: `Fresa "${id}" não está no catálogo Sienci.` });
  return f;
}
