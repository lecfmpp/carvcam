import { getClaudeKey, makeClaudeAssistant } from "./claude";
import { localAssistant } from "./local";
import type { AssistantProvider } from "./types";

export type { AssistantContext, AssistantProvider, AssistantReply, ChatTurn } from "./types";
export { getClaudeKey, setClaudeKey } from "./claude";

/** Claude when a key is saved; otherwise the built-in assistant, which works offline. */
export function getAssistant(): AssistantProvider {
  const key = getClaudeKey();
  return key ? makeClaudeAssistant(key) : localAssistant;
}
