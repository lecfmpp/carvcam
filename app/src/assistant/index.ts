import { browserVerify } from "./browser";
import { getClaudeKey, makeClaudeAssistant } from "./claude";
import { makeLocalAssistant } from "./local";
import type { AssistantProvider } from "./types";

export type { AssistantContext, AssistantProvider, AssistantReply, ChatTurn, Check, ProAction } from "./types";
export { getClaudeKey, setClaudeKey } from "./claude";

let claude: { key: string; provider: AssistantProvider } | null = null;
const local = makeLocalAssistant(browserVerify);

/**
 * Claude when a key is saved (one conversation per key, kept until reset); otherwise the built-in
 * assistant, which works offline. The UI shows which one is active.
 */
export function getAssistant(): AssistantProvider {
  const key = getClaudeKey();
  if (!key) return local;
  if (!claude || claude.key !== key) claude = { key, provider: makeClaudeAssistant({ apiKey: key, verify: browserVerify }) };
  return claude.provider;
}

/** Starts a new chat (forgets the Claude conversation). */
export function resetAssistant() {
  claude?.provider.reset();
}
