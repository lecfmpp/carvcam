import Anthropic from "@anthropic-ai/sdk";
import { Conversation, runTurn, type AgentOptions, type Transport } from "./agent";
import type { AssistantProvider, AssistantReply, Verifier } from "./types";

/**
 * Claude-powered assistant, called straight from the browser with the key the user pasted
 * (it stays in this browser's storage). It edits the design through the tools in tools.ts;
 * it never sends anything to the machine.
 */
const KEY = "carvcam-anthropic-key";

export function getClaudeKey(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}
export function setClaudeKey(key: string) {
  try {
    if (key) localStorage.setItem(KEY, key.trim());
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the key only lasts for this session */
  }
}

/** Transport over the official SDK (browser: dangerouslyAllowBrowser, since the key is the user's own). */
export function sdkTransport(client: Anthropic): Transport {
  return (params) => client.beta.messages.create(params);
}

/** User-facing text for an API failure (the design is unchanged when this happens). */
export function apiErrorText(e: unknown): string | null {
  if (e instanceof Anthropic.AuthenticationError) return "That API key was not accepted. Check it under Connect Claude. Your design is unchanged.";
  if (e instanceof Anthropic.PermissionDeniedError) return "This API key can't use this model. Your design is unchanged.";
  if (e instanceof Anthropic.RateLimitError) return "Claude is busy right now. Try again in a moment. Your design is unchanged.";
  if (e instanceof Anthropic.APIConnectionError) return "Couldn't reach Claude (no connection?). The offline assistant still works for simple requests. Your design is unchanged.";
  if (e instanceof Anthropic.APIError) return `Claude couldn't answer (${e.status ?? "network"}). Your design is unchanged.`;
  return null;
}

export function makeClaudeAssistant(opts: { apiKey?: string; transport?: Transport; verify: Verifier; agent?: AgentOptions }): AssistantProvider {
  const transport = opts.transport ?? sdkTransport(new Anthropic({ apiKey: opts.apiKey, dangerouslyAllowBrowser: true }));
  let conversation = new Conversation();
  return {
    kind: "claude",
    name: "Claude",
    reset() {
      conversation = new Conversation();
    },
    async send(message, ctx): Promise<AssistantReply> {
      try {
        return await runTurn({ transport, verify: opts.verify, ctx, message, conversation, options: opts.agent });
      } catch (e) {
        const text = apiErrorText(e);
        if (text) return { text, changes: [], remaining: [], provider: "claude" };
        throw e;
      }
    },
  };
}
