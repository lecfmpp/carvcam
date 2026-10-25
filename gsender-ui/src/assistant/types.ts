import type { PlateSpecInput } from "@gsender-next/cam-engine";

/** O que o assistente sabe do projeto quando a pessoa pede uma mudança. */
export interface AssistantContext {
  spec: PlateSpecInput;
  material: string;
  bitName: string;
  machineName: string;
  /** Problemas atuais (em inglês, como aparecem no painel). */
  issues: string[];
}

export interface ChatTurn {
  from: "user" | "ai";
  text: string;
}

export interface AssistantReply {
  text: string;
  /** Nova especificação completa, quando o pedido muda o desenho. */
  spec?: PlateSpecInput;
}

/**
 * Provedor do assistente. Ele só edita o desenho: nunca fala com a máquina,
 * e cortar sempre começa por uma ação da pessoa.
 */
export interface AssistantProvider {
  readonly name: string;
  send(message: string, ctx: AssistantContext, history: ChatTurn[]): Promise<AssistantReply>;
}
