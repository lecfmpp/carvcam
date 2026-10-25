import { getClaudeKey, makeClaudeAssistant } from "./claude";
import { localAssistant } from "./local";
import type { AssistantProvider } from "./types";

export type { AssistantContext, AssistantProvider, AssistantReply, ChatTurn } from "./types";
export { getClaudeKey, setClaudeKey } from "./claude";

/** Claude quando há chave salva; senão o assistente embutido, que funciona sem rede. */
export function getAssistant(): AssistantProvider {
  const key = getClaudeKey();
  return key ? makeClaudeAssistant(key) : localAssistant;
}
