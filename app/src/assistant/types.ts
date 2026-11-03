import type { GenerateResult } from "@carvcam/cam-engine";
import type { Design } from "../state/design";

/**
 * What the assistant knows about the project and the shop when the user asks for a change.
 * Everything here is plain data, so the same code runs in the browser and in the Node eval runner.
 */
export interface AssistantContext {
  design: Design;
  machine: AssistantMachine;
  /** Bit ids in My bits. */
  ownedBits: string[];
  /** The account has Pro (inlay wizard, batch, cost). The assistant never changes this, it only reads it. */
  pro: boolean;
}

export interface AssistantMachine {
  id: string;
  name: string;
  headId: string;
  /** Usable travel in mm. */
  travelX: number;
  travelY: number;
  travelZ: number;
}

/** One engine check, in the assistant's words (element ids as the model sees them, e.g. "text:0"). */
export interface Check {
  code: string;
  severity: "error" | "warning";
  message: string;
  suggestion?: string;
  /** Assistant element id ("text:0", "shape:2", "hole:1"…), when the check is about one element. */
  element?: string;
}

/** Result of running the engine on a design: the checks the panel shows, and the layout (for element boxes). */
export interface VerifyOutcome {
  checks: Check[];
  result: GenerateResult | null;
}

/** Runs the engine's layout + verification on a design (worker in the browser, generatePlate in Node). */
export type Verifier = (design: Design, ctx: AssistantContext) => Promise<VerifyOutcome>;

/** A Pro feature the assistant can open (the feature's own gate decides what the user sees). */
export type ProFeatureId = "inlay" | "batch" | "cost";

export interface ProAction {
  feature: ProFeatureId;
  /** Elements to open the inlay wizard on (app ids, e.g. "i:0"). */
  elementIds: string[];
}

export interface ChatTurn {
  from: "user" | "ai";
  text: string;
}

export interface AssistantReply {
  /** One short sentence for the user (or the question, when asking). */
  text: string;
  /** The new design, when the turn changed something (apply it as ONE undo step). */
  design?: Design;
  /** What changed, one line per change ("Text 'SMITH' → size 40 mm"). */
  changes: string[];
  /** The assistant needs an answer before changing anything. */
  question?: { question: string; options: string[] };
  /** Open a Pro feature's UI (its gate stays in charge). */
  action?: ProAction;
  /** Problems the engine still reports after the turn that were not there before it. */
  remaining: Check[];
  /** Which assistant answered. */
  provider: "claude" | "local";
  /** Diagnostics (tool calls made, rounds), for evals and debugging. */
  trace?: TraceEntry[];
}

export interface TraceEntry {
  tool: string;
  input: unknown;
  ok: boolean;
  output: string;
}

/**
 * Assistant provider. It only edits the design: it never talks to the machine,
 * and cutting always starts with an action by the user.
 */
export interface AssistantProvider {
  readonly kind: "claude" | "local";
  readonly name: string;
  send(message: string, ctx: AssistantContext): Promise<AssistantReply>;
  /** Forgets the conversation (new chat). */
  reset(): void;
}
