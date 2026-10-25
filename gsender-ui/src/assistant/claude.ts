import Anthropic from "@anthropic-ai/sdk";
import { PlateSpecSchema, type PlateSpecInput } from "@gsender-next/cam-engine";
import type { AssistantContext, AssistantProvider, AssistantReply, ChatTurn } from "./types";

/**
 * Assistente com o Claude, chamado direto do navegador com a chave que a pessoa colou.
 * Ele recebe a especificação atual e devolve a especificação inteira atualizada por uma
 * ferramenta; nunca envia nada para a máquina.
 */
const KEY = "gsender-anthropic-key";
const MODEL = "claude-opus-5-5";
const TOOL = "update_design";

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
    /* armazenamento bloqueado: a chave vale só nesta sessão */
  }
}

const num = { type: "number" } as const;
const nullableNum = { type: ["number", "null"] } as const;
const modo = { type: "string", enum: ["relevo", "gravado", "recorte"] } as const;
const obj = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, properties, required: Object.keys(properties) });

/** Espelha PlateSpecSchema. Em modo estrito todo campo é obrigatório; x/y de texto aceitam null (posição automática). */
const SPEC_SCHEMA = obj({
  tipo: { type: "string", enum: ["placa", "letreiro"], description: "placa = sign with a background; letreiro = cut-out lettering" },
  largura: { ...num, description: "Width in mm" },
  altura: { ...num, description: "Height in mm" },
  espessura: { ...num, description: "Board thickness in mm. Keep the current value unless asked." },
  material: { type: "string", enum: ["mdf", "compensado", "madeira_macia", "madeira_dura", "acrilico"] },
  texto: {
    type: "array",
    description: "Up to 6 lines of text",
    items: obj({
      conteudo: { type: "string" },
      fonte: { type: "string", enum: ["archivo-black", "pacifico", "bebas-neue"], description: "archivo-black bold and easiest to cut; bebas-neue condensed; pacifico script with joined letters" },
      tamanho: { ...num, description: "Cap height in mm" },
      modo,
      profundidade: { ...num, description: "Depth in mm" },
      x: { ...nullableNum, description: "Centre X from the left edge in mm, or null to auto-centre" },
      y: { ...nullableNum, description: "Centre Y from the bottom edge in mm, or null to auto-stack" },
    }),
  },
  borda: obj({ tipo: { type: "string", enum: ["reta", "arredondada", "chanfrada"] }, raio: num }),
  moldura: { ...num, description: "Raised frame width in mm; 0 = none, 6 = standard frame" },
  icones: { type: "array", items: obj({ id: { type: "string", enum: ["coracao", "estrela", "casa", "folha"] }, x: num, y: num, tamanho: num, modo, profundidade: num }) },
  formas: {
    type: "array",
    items: {
      anyOf: [
        obj({ tipo: { type: "string", enum: ["retangulo"] }, x: num, y: num, largura: num, altura: num, raio: num, modo, profundidade: num }),
        obj({ tipo: { type: "string", enum: ["circulo"] }, x: num, y: num, diametro: num, modo, profundidade: num }),
        obj({ tipo: { type: "string", enum: ["linha"] }, x: num, y: num, x2: num, y2: num, espessura: num, modo, profundidade: num }),
      ],
    },
  },
  furos: { type: "array", items: obj({ x: num, y: num, diametro: num }) },
  rasgos: { type: "array", items: obj({ x: num, y: num, comprimento: num, largura: num, angulo: num }) },
});

const RESPONSE_SCHEMA = obj({
  reply: { type: "string", description: "One or two short, friendly sentences in English telling the person what changed." },
  spec: SPEC_SCHEMA,
});

const SYSTEM = `You are the design assistant inside CarvCAM, the app that designs signs and drives a hobby CNC router (it works alongside gSender).
You edit the design of a flat sign ("placa") or cut-out lettering ("letreiro"). You cannot carve, move the machine or start a job: the person always does that themselves.
When the person asks for a change, call the ${TOOL} tool once with the complete updated spec and a short reply. Keep every field you were not asked to change exactly as it is.
Coordinates are millimetres from the bottom-left corner of the piece. Field values stay in the schema's Portuguese identifiers (relevo = raised, gravado = engraved, recorte = cut through).
Only flat 2.5D work is possible: text, the four icons, rectangles, circles, lines, holes and slots. If asked for a 3D carving, explain that briefly and offer the closest flat alternative instead of calling the tool.
Prefer changes that fix the listed problems. If a request is unclear, answer with a short question instead of calling the tool.`;

function contextText(ctx: AssistantContext) {
  return [
    `Material: ${ctx.material}. Bit: ${ctx.bitName}. Machine: ${ctx.machineName}.`,
    ctx.issues.length ? `Current problems:\n- ${ctx.issues.join("\n- ")}` : "No problems right now.",
    `Current spec:\n${JSON.stringify(ctx.spec)}`,
  ].join("\n\n");
}

/** null → ausente, para o esquema do motor aplicar a posição automática. */
function clean(spec: Record<string, unknown>, prev: PlateSpecInput): PlateSpecInput {
  const texto = Array.isArray(spec.texto)
    ? (spec.texto as Record<string, unknown>[]).map(({ x, y, ...t }) => ({ ...t, ...(x == null ? {} : { x }), ...(y == null ? {} : { y }) }))
    : spec.texto;
  return { recorteExterno: prev.recorteExterno, margem: prev.margem, ...spec, texto } as PlateSpecInput;
}

export function makeClaudeAssistant(apiKey: string): AssistantProvider {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  return {
    name: "Claude",
    async send(message, ctx, history: ChatTurn[]): Promise<AssistantReply> {
      const messages: Anthropic.Beta.BetaMessageParam[] = [
        ...history.slice(-8).map((t) => ({ role: t.from === "user" ? ("user" as const) : ("assistant" as const), content: t.text })),
        { role: "user", content: `${contextText(ctx)}\n\nRequest: ${message}` },
      ];
      // A conversa precisa começar pelo usuário.
      while (messages.length && messages[0].role !== "user") messages.shift();
      try {
        const res = await client.beta.messages.create({
          model: MODEL,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          max_tokens: 16000,
          output_config: { effort: "low" },
          system: SYSTEM,
          messages,
          tools: [{ name: TOOL, description: "Replace the design with an updated spec and tell the person what changed.", strict: true, input_schema: RESPONSE_SCHEMA as Anthropic.Beta.BetaTool.InputSchema }],
          tool_choice: { type: "auto" },
        });
        if (res.stop_reason === "refusal") return { text: "I can't help with that one. I can change the text, shapes, edge or holes of the design." };
        const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(" ").trim();
        const call = res.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === TOOL);
        if (!call) return { text: text || "I didn't change anything. Could you say it another way?" };
        const input = call.input as { reply?: string; spec?: Record<string, unknown> };
        const parsed = PlateSpecSchema.safeParse(clean(input.spec ?? {}, ctx.spec));
        if (!parsed.success) return { text: "I came up with a design the app can't carve, so I left yours as it was. Try asking in smaller steps." };
        return { text: input.reply || text || "Done.", spec: parsed.data };
      } catch (e) {
        if (e instanceof Anthropic.AuthenticationError) return { text: "That API key was not accepted. Check it under Connect Claude." };
        if (e instanceof Anthropic.RateLimitError) return { text: "Claude is busy right now. Try again in a moment." };
        if (e instanceof Anthropic.APIError) return { text: `Claude couldn't answer (${e.status ?? "network"}). Your design is unchanged.` };
        throw e;
      }
    },
  };
}
