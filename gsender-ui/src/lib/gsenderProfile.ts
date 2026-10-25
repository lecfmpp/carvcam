import type { HeadId, MachineId } from "./catalog";

/**
 * Perfil de máquina já escolhido no gSender (Config › Machine profile). Hoje devolve null:
 * quando o adaptador real do gSender existir, ele lê o perfil pelo servidor
 * (`GET /api/state` → workspace.machineProfile) e traduz para o catálogo.
 */
export function detectGsenderProfile(): { machine: MachineId; head?: HeadId } | null {
  return null;
}
