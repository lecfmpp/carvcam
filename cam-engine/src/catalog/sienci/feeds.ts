import { HEADS, nearestDial, type HeadId } from "./heads.js";
import { BIT_BY_ID, compatibility, VERIFIED_ON, type SienciBit } from "./bits.js";
import { MACHINES, type MachineId } from "./machines.js";
import { officialRow, ROW_GEOMETRY, TABLE_SOURCE, UPCUT_ONLY, type MaterialGroup, type Source, type Speed } from "./table.js";

/**
 * Feeds and speeds for every Sienci bit on every machine, router/spindle, material and speed.
 *
 * "official": the numbers are Sienci's table, unchanged, on a machine Sienci points to the table for
 * (LongMill MK2/MK2.5/MK3), with a router or spindle that reaches the row's RPM.
 *
 * "estimated": anything else. The rules, all starting from Sienci's table and applied in this order:
 *  1. Machine without its own table (AltMill): use the LongMill table without multiplying anything,
 *     as Sienci advises (https://forum.sienci.com/t/altmill-feeds-and-speeds/14176).
 *  2. Bit the table doesn't list (compression, 3-flute DLC, roughing, 3/8″, 1-1/2″ surfacing…), or
 *     downcut/compression in plastic (the table only lists upcut there): start from the row with the
 *     closest geometry (`bit.tableRow`) and
 *       - feed = row feed × (D/Dref) × (flutes/flutes ref), because Sienci keeps the chip load
 *         proportional to the diameter ("chip load per unit diameter"), capped at the row feed ×
 *         the machine's rigidity factor (1: never above the table);
 *       - plunge in the same plunge/feed ratio as the row;
 *       - stepover = the same fraction of the diameter as the row (≈45%; for V-bits, the row's own);
 *       - stepdowns keep the row's material removal rate (feed × width × depth), Sienci's own
 *         criterion ("material removal rate"), and never go past the cutting length.
 *  3. RPM outside the router/spindle's range: RPM goes to the limit; when the row asks for more than
 *     the head can reach, the feed drops in the same proportion (keeps the chip load).
 *  4. Feed and plunge capped at the machine's max rates (X/Y and Z).
 * Estimated values are rounded to 10 mm/min (feeds) and down to 0.05 mm (stepdowns).
 *
 * Combinations Sienci doesn't publish and that have no reference row for the material (surfacing in
 * plastic, tapered in aluminum…) come back as "not-recommended", with the reason: Sienci's FAQ says
 * a missing entry in the table means a combination they advise against.
 */
export type FeedsOrigin = "official" | "estimated";

export interface SienciFeeds {
  bit: string;
  machine: MachineId;
  head: HeadId;
  group: MaterialGroup;
  speed: Speed;
  rpm: number;
  /** Dial setting, for routers whose speed is set by hand (Makita). */
  dial?: number;
  feed: number;
  plunge: number;
  stepover: number;
  /** Slotting stepdown; null when Sienci marks it N/A (tapered bits in 3D). */
  slotStepdown: number | null;
  pocketStepdown: number;
  origin: FeedsOrigin;
  /** Why it is estimated: machine without a table, bit not in the table, head out of range, machine limit. */
  reasons: ("machine" | "bit" | "head" | "limit")[];
  /** Estimation rules applied (empty when official). */
  rules: string[];
  /** Safety adjustments that don't change the origin (stepdown capped at the bit's cutting length). */
  adjustments: string[];
  sources: Source[];
}

export type FeedsResult =
  | { status: "ok"; feeds: SienciFeeds }
  | { status: "not-recommended"; reason: string; sources: Source[] }
  | { status: "incompatible"; reason: string };

const r10 = (v: number) => Math.round(v / 10) * 10;
const r1 = (v: number) => Math.round(v * 10) / 10;
/** Estimated stepdowns: round down to 0.05 mm (never deeper than the math). */
const rStepdown = (v: number) => Math.max(0.05, Math.floor(v * 20 + 1e-9) / 20);

export function sienciFeeds(bitId: string, machineId: MachineId, headId: HeadId, group: MaterialGroup, speed?: Speed): FeedsResult {
  const bit = BIT_BY_ID.get(bitId);
  if (!bit) return { status: "incompatible", reason: `Bit "${bitId}" is not in the Sienci catalog.` };
  const machine = MACHINES[machineId];
  const head = HEADS[headId];
  const spd = speed ?? machine.defaultSpeed;
  if (!machine.heads.includes(headId)) return { status: "incompatible", reason: `The ${head.name} is not an option for the ${machine.name}.` };
  const c = compatibility(bit, headId);
  if (c.status === "incompatible") return { status: "incompatible", reason: c.reason };

  const sources: Source[] = [TABLE_SOURCE, { title: bit.name, url: bit.url, checkedOn: VERIFIED_ON }];
  const explicit = bit.notRecommended?.[group];
  if (explicit) return { status: "not-recommended", reason: explicit, sources };
  const row = bit.tableRow ? officialRow(bit.tableRow, group, spd) : undefined;
  if (!bit.tableRow || !row) {
    return { status: "not-recommended", reason: "Sienci publishes no numbers for this bit in this material (the table's FAQ says that means they don't recommend the combination).", sources };
  }

  const rules: string[] = [];
  const adjustments: string[] = [];
  const reasons: SienciFeeds["reasons"] = [];
  let [feed, plunge, stepover, slotStepdown, pocketStepdown, rpm] = row;
  const ref = ROW_GEOMETRY[bit.tableRow];

  if (machine.feedsTable.status !== "official") {
    reasons.push("machine");
    rules.push(`${machine.family}: ${machine.feedsTable.reason}`);
    sources.push(machine.feedsTable.source);
  }

  const upcutOnly = UPCUT_ONLY[group] && (bit.cut === "downcut" || bit.cut === "compression") && bit.type !== "vbit";
  if (!bit.official || upcutOnly) {
    const why = upcutOnly && bit.official ? "in this material the table only lists upcut bits" : "the table doesn't list this geometry";
    reasons.push("bit");
    rules.push(`Estimated from the "${ref.name}" row (${why}).`);
    if (bit.type !== "vbit" && ref.diameter > 0) {
      const D = bit.diameter;
      const Z = bit.flutes || ref.flutes;
      const scale = (D / ref.diameter) * (Z / ref.flutes);
      const factor = Math.min(scale, machine.rigidityFactor);
      const newFeed = feed * factor;
      const newStepover = (stepover / ref.diameter) * D;
      const slotMrr = slotStepdown === null ? null : feed * ref.diameter * slotStepdown;
      const pocketMrr = feed * stepover * pocketStepdown;
      plunge = plunge * factor;
      slotStepdown = slotMrr === null ? null : slotMrr / (newFeed * D);
      pocketStepdown = pocketMrr / (newFeed * newStepover);
      feed = newFeed;
      stepover = newStepover;
      if (factor < 1) rules.push(`Feed × ${factor.toFixed(2)} for chip load (Ø ${r1(D)} mm, ${Z} flutes).`);
      else if (scale > 1) rules.push(`Chip load would allow ${Math.round((scale - 1) * 100)}% more feed; kept the table's (rigidity factor ${machine.rigidityFactor}).`);
      rules.push("Stepdowns recalculated to keep the reference row's material removal rate.");
    }
  }
  if (bit.cutLength) {
    const max = bit.cutLength;
    if (pocketStepdown > max || (slotStepdown ?? 0) > max) adjustments.push(`Stepdowns capped at the cutting length (${r1(max)} mm).`);
    pocketStepdown = Math.min(pocketStepdown, max);
    if (slotStepdown !== null) slotStepdown = Math.min(slotStepdown, max);
  }

  if (rpm > head.rpmMax) {
    const k = head.rpmMax / rpm;
    reasons.push("head");
    rules.push(`The ${head.name} tops out at ${head.rpmMax} RPM (the table asks for ${rpm}); feed reduced in the same proportion.`);
    feed *= k;
    plunge *= k;
    rpm = head.rpmMax;
  } else if (rpm < head.rpmMin) {
    reasons.push("head");
    rules.push(`The ${head.name} doesn't go below ${head.rpmMin} RPM (the table asks for ${rpm}); feed kept.`);
    rpm = head.rpmMin;
  }

  if (feed > machine.maxFeed.xy) {
    reasons.push("limit");
    rules.push(`Feed capped at the ${machine.name}'s max rate (${machine.maxFeed.xy} mm/min).`);
    feed = machine.maxFeed.xy;
  }
  if (plunge > machine.maxFeed.z) {
    reasons.push("limit");
    rules.push(`Plunge capped at the Z axis max rate (${machine.maxFeed.z} mm/min).`);
    plunge = machine.maxFeed.z;
  }

  const maxCut = bit.cutLength ?? Infinity;
  const origin: FeedsOrigin = rules.length ? "estimated" : "official";
  const est = origin === "estimated";
  const feeds: SienciFeeds = {
    bit: bit.id,
    machine: machineId,
    head: headId,
    group,
    speed: spd,
    rpm,
    dial: head.rpmControl === "manual" ? nearestDial(head, rpm)?.position : undefined,
    feed: est ? r10(feed) : feed,
    plunge: est ? r10(plunge) : plunge,
    stepover: est ? Math.round(stepover * 100) / 100 : stepover,
    slotStepdown: slotStepdown === null ? null : Math.min(est ? rStepdown(slotStepdown) : slotStepdown, maxCut),
    pocketStepdown: Math.min(est ? rStepdown(pocketStepdown) : pocketStepdown, maxCut),
    origin,
    reasons: [...new Set(reasons)],
    rules,
    adjustments,
    sources,
  };
  return { status: "ok", feeds };
}

/** "official" when the bit has Sienci's own numbers on this machine + head in soft wood (the common case). */
export function feedsOrigin(bit: SienciBit, machineId: MachineId, headId: HeadId): FeedsOrigin | null {
  const r = sienciFeeds(bit.id, machineId, headId, "softwood");
  return r.status === "ok" ? r.feeds.origin : null;
}
