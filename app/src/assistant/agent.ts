import type Anthropic from "@anthropic-ai/sdk";
import { checksText } from "./describe";
import { changed, describe, newDraft, runTool, type Draft } from "./ops";
import { sessionSystemPrompt, staticSystemPrompt } from "./prompt";
import { READ_TOOLS, assistantTools } from "./tools";
import { newChecks } from "./verify";
import type { AssistantContext, AssistantReply, Check, TraceEntry, Verifier } from "./types";

/**
 * The assistant's turn loop (one user message → one reply and at most one design change).
 *
 * Manual tool loop rather than the SDK tool runner, because the app owns more than the tools:
 * every edit goes to a draft (applied as ONE undo step at the end), the engine re-checks the draft
 * after each round of edits and the new problems are fed back to the model, and the transport is
 * swappable (browser SDK client, Node SDK client, or a mock in tests).
 *
 * History is append-only (thinking blocks are passed back unchanged, as preserved thinking requires):
 * the design state for each request rides in that request's user message, and a note is appended
 * when the design changed between turns (user edits or Undo).
 */

export const DEFAULT_MODEL = "claude-opus-5-5";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type MessageParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
export type Message = Anthropic.Beta.Messages.BetaMessage;
/** Sends one Messages API request. */
export type Transport = (params: MessageParams) => Promise<Message>;

export interface AgentOptions {
  model?: string;
  effort?: Effort;
  /** Model calls per turn (each call is one step of the tool loop). */
  maxSteps?: number;
  /** How many times new engine problems are fed back to the model in one turn. */
  maxVerifyRounds?: number;
}

/** One chat with the assistant (the API history, append-only). */
export class Conversation {
  messages: Anthropic.Beta.Messages.BetaMessageParam[] = [];
  /** Design (JSON) after the last turn, to tell the model when the user changed it in between. */
  lastDesign: string | null = null;

  push(role: "user" | "assistant", content: Anthropic.Beta.Messages.BetaContentBlockParam[]) {
    const last = this.messages[this.messages.length - 1];
    // Two user messages in a row (a turn that stopped after tool results): merge, never edit earlier blocks.
    if (last && last.role === role && role === "user" && Array.isArray(last.content)) {
      last.content = [...(last.content as Anthropic.Beta.Messages.BetaContentBlockParam[]), ...content];
      return;
    }
    this.messages.push({ role, content } as Anthropic.Beta.Messages.BetaMessageParam);
  }
}

export function buildRequest(ctx: AssistantContext, conv: Conversation, opts: AgentOptions): MessageParams {
  return {
    model: opts.model ?? DEFAULT_MODEL,
    max_tokens: 16000,
    // Opus 5.5 always thinks adaptively; effort sets how much.
    output_config: { effort: opts.effort ?? "medium" },
    // Refusals fall back to a model chosen by refusal category (Opus 5.5 default).
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    // Cached prefix: tools → static system → session system; the top-level marker also caches the
    // growing conversation between the steps of the tool loop.
    cache_control: { type: "ephemeral" },
    system: [
      { type: "text", text: staticSystemPrompt(), cache_control: { type: "ephemeral" } },
      { type: "text", text: sessionSystemPrompt(ctx), cache_control: { type: "ephemeral" } },
    ],
    tools: assistantTools(),
    tool_choice: { type: "auto" },
    messages: conv.messages,
  };
}

const textOf = (m: Message) =>
  m.content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join(" ")
    .trim();

function reply(draft: Draft, text: string, baseline: Check[], trace: TraceEntry[]): AssistantReply {
  const did = changed(draft);
  return {
    text: draft.question?.question && !text ? draft.question.question : text || (did ? "Done." : "I didn't change anything."),
    ...(did ? { design: draft.design } : {}),
    changes: did ? draft.changes : [],
    ...(draft.question ? { question: draft.question } : {}),
    ...(draft.action ? { action: draft.action } : {}),
    remaining: did ? newChecks(baseline, draft.checks) : [],
    provider: "claude",
    trace,
  };
}

/** Runs one user turn. Never throws for model behavior; API/transport errors propagate (the design is untouched). */
export async function runTurn(args: { transport: Transport; verify: Verifier; ctx: AssistantContext; message: string; conversation: Conversation; options?: AgentOptions }): Promise<AssistantReply> {
  const { transport, verify, ctx, conversation: conv } = args;
  const opts = args.options ?? {};
  const maxSteps = opts.maxSteps ?? 10;
  const maxVerify = opts.maxVerifyRounds ?? 3;
  const startLen = conv.messages.length;

  const base = await verify(ctx.design, ctx);
  const baseline = base.checks;
  const draft = newDraft(ctx, baseline, base.result);
  const trace: TraceEntry[] = [];
  const reported = new Set<string>();
  let verifyRounds = 0;

  /** Re-checks the draft; returns the new problems not reported to the model yet. */
  const recheck = async (): Promise<Check[]> => {
    const out = await verify(draft.design, ctx);
    draft.checks = out.checks;
    draft.layout = { spec: draft.design.spec, result: out.result };
    const fresh = newChecks(baseline, out.checks).filter((c) => !reported.has(JSON.stringify([c.code, c.element, c.message])));
    return fresh;
  };
  const feedback = (fresh: Check[]) => {
    fresh.forEach((c) => reported.add(JSON.stringify([c.code, c.element, c.message])));
    verifyRounds++;
    return `[Automatic engine check after your edits] New problems your changes caused:\n${checksText(fresh)}\nFix them with the smallest change that keeps what the user asked, or leave them and mention them in your reply if they can't be fixed.`;
  };

  const userChanged = conv.lastDesign !== null && conv.lastDesign !== JSON.stringify(ctx.design);
  const intro = userChanged ? "Note: the design changed since your last reply (the user edited it or pressed Undo). Work from the current design below.\n\n" : "";
  conv.push("user", [{ type: "text", text: `${intro}Current design:\n${describe(draft)}\n\nUser request: ${args.message}` }]);

  try {
    let finalText = "";
    for (let step = 0; step < maxSteps; step++) {
      const res = await transport(buildRequest(ctx, conv, opts));
      conv.push("assistant", res.content as Anthropic.Beta.Messages.BetaContentBlockParam[]);
      if (res.stop_reason === "refusal") {
        // Nothing from a refused turn is applied.
        conv.lastDesign = JSON.stringify(ctx.design);
        return { text: "I can't help with that one. I can change the text, shapes, sizes, styles, holes, bits and board of the design.", changes: [], remaining: [], provider: "claude", trace };
      }
      const uses = res.content.filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use");
      if (res.stop_reason === "max_tokens" && uses.length) {
        // A cut-off tool call may be incomplete: don't run it. Answer each call so the history stays valid.
        conv.push("user", uses.map((u) => ({ type: "tool_result" as const, tool_use_id: u.id, is_error: true, content: "Not run: the response was cut off (max_tokens). Make fewer, smaller calls." })));
        continue;
      }
      if (!uses.length) {
        finalText = textOf(res);
        if (changed(draft) && !draft.question && verifyRounds < maxVerify && step < maxSteps - 1) {
          const fresh = await recheck();
          if (fresh.length) {
            conv.push("user", [{ type: "text", text: feedback(fresh) }]);
            continue;
          }
        }
        break;
      }
      const results: Anthropic.Beta.Messages.BetaContentBlockParam[] = [];
      let wrote = false;
      for (const u of uses) {
        const out = runTool(draft, u.name, u.input);
        trace.push({ tool: u.name, input: u.input, ok: out.ok, output: out.ok ? out.output : out.error });
        if (out.ok && !(READ_TOOLS as readonly string[]).includes(u.name)) wrote = true;
        results.push({ type: "tool_result", tool_use_id: u.id, content: out.ok ? out.output : out.error, ...(out.ok ? {} : { is_error: true }) });
      }
      if (wrote && changed(draft) && verifyRounds < maxVerify) {
        const fresh = await recheck();
        if (fresh.length) results.push({ type: "text", text: feedback(fresh) });
      }
      conv.push("user", results);
    }
    if (changed(draft) && JSON.stringify(draft.layout?.spec) !== JSON.stringify(draft.design.spec)) await recheck();
    conv.lastDesign = JSON.stringify(changed(draft) ? draft.design : ctx.design);
    return reply(draft, finalText, baseline, trace);
  } catch (e) {
    // The request failed: forget this turn (the next one starts from the last complete turn).
    conv.messages.length = startLen;
    throw e;
  }
}
