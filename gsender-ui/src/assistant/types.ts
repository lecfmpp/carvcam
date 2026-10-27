import type { PlateSpecInput } from "@gsender-next/cam-engine";

/** What the assistant knows about the project when the user asks for a change. */
export interface AssistantContext {
  spec: PlateSpecInput;
  material: string;
  bitName: string;
  machineName: string;
  /** Current issues (in English, as shown in the panel). */
  issues: string[];
}

export interface ChatTurn {
  from: "user" | "ai";
  text: string;
}

export interface AssistantReply {
  text: string;
  /** Full new spec, when the request changes the design. */
  spec?: PlateSpecInput;
}

/**
 * Assistant provider. It only edits the design: it never talks to the machine,
 * and cutting always starts with an action by the user.
 */
export interface AssistantProvider {
  readonly name: string;
  send(message: string, ctx: AssistantContext, history: ChatTurn[]): Promise<AssistantReply>;
}
