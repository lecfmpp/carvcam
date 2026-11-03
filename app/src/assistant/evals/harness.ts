import { Conversation, runTurn, type AgentOptions, type Message, type MessageParams, type Transport } from "../agent";
import { boxesOf, newDraft } from "../ops";
import type { AssistantContext } from "../types";
import type { EvalCase } from "./cases";
import type { Outcome } from "./expect";
import { STARTER_BITS } from "./fixtures";
import { machineCtx, nodeVerify } from "./node";

export interface CaseResult {
  id: string;
  category: string;
  pass: boolean;
  failures: string[];
  reply: string;
  changes: string[];
  tools: string[];
  ms: number;
  error?: string;
}

export function caseContext(c: EvalCase): AssistantContext {
  return { design: c.start(), machine: machineCtx(c.machine), ownedBits: c.ownedBits ?? STARTER_BITS, pro: c.pro ?? false };
}

/** Runs one case through the real turn loop, tools and engine; only the transport differs (live API or replay). */
export async function runCase(c: EvalCase, transport: Transport, options: AgentOptions = {}): Promise<CaseResult> {
  const t0 = Date.now();
  const ctx = caseContext(c);
  try {
    const reply = await runTurn({ transport, verify: nodeVerify, ctx, message: c.message, conversation: new Conversation(), options });
    const after = reply.design ?? ctx.design;
    const before = await nodeVerify(ctx.design, ctx);
    const afterV = await nodeVerify(after, ctx);
    const boxes = boxesOf(newDraft({ ...ctx, design: after }, afterV.checks, afterV.result));
    const outcome: Outcome = { reply, before: ctx.design, after, beforeChecks: before.checks, afterChecks: afterV.checks, boxes };
    const failures = c.expect.flatMap((a) => {
      const why = a.check(outcome);
      return why ? [`${a.name}: ${why}`] : [];
    });
    return { id: c.id, category: c.category, pass: !failures.length, failures, reply: reply.text, changes: reply.changes, tools: (reply.trace ?? []).map((t) => `${t.tool}${t.ok ? "" : "!"}`), ms: Date.now() - t0 };
  } catch (e) {
    return { id: c.id, category: c.category, pass: false, failures: [], reply: "", changes: [], tools: [], ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) };
  }
}

/** A transport that answers with the case's golden tool calls, then its golden reply (offline tests). */
export function replayTransport(golden: EvalCase["golden"]): Transport {
  let step = 0;
  return async (_params: MessageParams) => {
    const first = step++ === 0 && golden.calls.length > 0;
    const content = first ? golden.calls.map((c, i) => ({ type: "tool_use", id: `toolu_golden_${i}`, name: c.tool, input: c.input })) : [{ type: "text", text: golden.text, citations: null }];
    return fakeMessage(content, first ? "tool_use" : "end_turn");
  };
}

/** A minimal Messages API response (tests and replays). */
export function fakeMessage(content: unknown[], stop_reason: string): Message {
  return {
    id: `msg_fake_${Math.random().toString(36).slice(2)}`,
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content,
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
  } as unknown as Message;
}
