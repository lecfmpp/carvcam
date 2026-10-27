import type { HeadId, MachineId } from "./catalog";

/**
 * Machine profile already chosen in gSender (Config › Machine profile). Returns null for now:
 * once the real gSender adapter exists, it will read the profile from the server
 * (`GET /api/state` → workspace.machineProfile) and map it to the catalog.
 */
export function detectGsenderProfile(): { machine: MachineId; head?: HeadId } | null {
  return null;
}
