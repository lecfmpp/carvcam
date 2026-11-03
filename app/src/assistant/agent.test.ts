import { describe, expect, it } from "vitest";
import { useDesign } from "../state/design";
import { Conversation, runTurn, type MessageParams, type Transport } from "./agent";
import { fakeMessage } from "./evals/harness";
import { F, STARTER_BITS } from "./evals/fixtures";
import { machineCtx, nodeVerify } from "./evals/node";
import type { AssistantContext, Check, Verifier } from "./types";

const ctx = (design = F.smith(), extra: Partial<AssistantContext> = {}): AssistantContext => ({ design, machine: machineCtx(), ownedBits: STARTER_BITS, pro: false, ...extra });

type Step = { tools?: [string, Record<string, unknown>][]; text?: string; stop?: string };

/** A scripted model: one response per request; records every request (deep-copied). */
function scripted(steps: Step[]) {
  const requests: MessageParams[] = [];
  let i = 0;
  const transport: Transport = async (params) => {
    requests.push(structuredClone(params));
    const s = steps[Math.min(i++, steps.length - 1)];
    const content: unknown[] = [];
    if (s.text) content.push({ type: "text", text: s.text, citations: null });
    (s.tools ?? []).forEach(([name, input], k) => content.push({ type: "tool_use", id: `toolu_${i}_${k}`, name, input }));
    return fakeMessage(content, s.stop ?? (s.tools?.length ? "tool_use" : "end_turn"));
  };
  return { transport, requests };
}

/** A verifier with no problems (fast; no engine). */
const quiet: Verifier = async () => ({ checks: [], result: null });

const lastUser = (p: MessageParams) => p.messages[p.messages.length - 1];
const blocks = (m: MessageParams["messages"][number]) => (Array.isArray(m.content) ? m.content : []) as { type: string; text?: string; content?: string; is_error?: boolean; tool_use_id?: string }[];

describe("assistant turn loop (mocked model)", () => {
  it("applies tool calls to a draft and returns one new design with the change list", async () => {
    const m = scripted([{ tools: [["set_text", { id: "text:0", content: "", font: "keep", size: 40 }]] }, { text: "SMITH is now 40 mm tall." }]);
    const c = ctx();
    const reply = await runTurn({ transport: m.transport, verify: quiet, ctx: c, message: "make SMITH 40 mm tall", conversation: new Conversation() });
    expect(reply.text).toBe("SMITH is now 40 mm tall.");
    expect(reply.design?.spec.texts?.[0].size).toBe(40);
    expect(reply.changes).toEqual(["Text 'SMITH' → size 40 mm"]);
    expect(c.design.spec.texts?.[0].size).toBe(30); // the input design is never mutated
    expect(reply.provider).toBe("claude");
  });

  it("sends a cacheable, grounded request with strict tools and no forced tool choice", async () => {
    const m = scripted([{ text: "Hi." }]);
    await runTurn({ transport: m.transport, verify: quiet, ctx: ctx(), message: "hello", conversation: new Conversation() });
    const p = m.requests[0];
    expect(p.model).toBe("claude-opus-5-5");
    expect(p.tool_choice).toEqual({ type: "auto" });
    expect(p.thinking).toBeUndefined();
    expect(p.output_config?.effort).toBe("medium");
    expect(p.cache_control).toEqual({ type: "ephemeral" });
    const system = p.system as { text: string; cache_control?: unknown }[];
    expect(system).toHaveLength(2);
    expect(system.every((b) => b.cache_control)).toBe(true);
    expect(system[0].text).toMatch(/Archivo Black/);
    expect(system[0].text).toMatch(/paw/);
    expect(system[0].text).toMatch(/25\.4/);
    expect(system[1].text).toMatch(/LongMill MK2 30×30/);
    expect(system[1].text).toMatch(/vbit-60-15mm/);
    // Nothing time-dependent or design-specific in the cached system prompt.
    expect(system[0].text).not.toMatch(/SMITH/);
    expect((p.tools as { strict?: boolean }[]).filter((t) => t.strict).length).toBeGreaterThan(10);
    expect(blocks(p.messages[0])[0].text).toMatch(/User request: hello/);
    expect(blocks(p.messages[0])[0].text).toMatch(/text:0 Text 'SMITH'/);
  });

  it("returns invalid tool input to the model as an error and lets it retry", async () => {
    const m = scripted([
      { tools: [["update_element", { id: "text:0", changes: { size: 9000 } }]] },
      { tools: [["update_element", { id: "text:0", changes: { size: 400 } }]] },
      { text: "Done." },
    ]);
    const reply = await runTurn({ transport: m.transport, verify: quiet, ctx: ctx(), message: "huge letters", conversation: new Conversation() });
    const r1 = blocks(lastUser(m.requests[1]))[0];
    expect(r1.is_error).toBe(true);
    expect(r1.content).toMatch(/Nothing was changed/);
    expect(reply.design?.spec.texts?.[0].size).toBe(400);
    expect(reply.trace?.map((t) => t.ok)).toEqual([false, true]);
  });

  it("keeps the history append-only across steps and turns", async () => {
    const m = scripted([{ tools: [["get_design", {}]] }, { text: "Looked." }, { text: "Second." }]);
    const conv = new Conversation();
    const c = ctx();
    await runTurn({ transport: m.transport, verify: quiet, ctx: c, message: "look", conversation: conv });
    await runTurn({ transport: m.transport, verify: quiet, ctx: c, message: "again", conversation: conv });
    for (let k = 1; k < m.requests.length; k++) {
      const prev = m.requests[k - 1].messages;
      const cur = m.requests[k].messages;
      // Every earlier message is resent unchanged (thinking blocks and tool calls included).
      expect(cur.slice(0, prev.length - 1)).toEqual(prev.slice(0, prev.length - 1));
    }
    expect(m.requests[2].messages[0]).toEqual(m.requests[0].messages[0]);
  });

  it("tells the model when the user changed the design between turns", async () => {
    const m = scripted([{ tools: [["set_text", { id: "text:0", content: "", font: "keep", size: 40 }]] }, { text: "Done." }, { text: "Ok." }]);
    const conv = new Conversation();
    const first = await runTurn({ transport: m.transport, verify: quiet, ctx: ctx(), message: "bigger", conversation: conv });
    // The user pressed Undo: the design is the original again.
    await runTurn({ transport: m.transport, verify: quiet, ctx: ctx(), message: "now engrave it", conversation: conv });
    expect(first.design).toBeDefined();
    expect(blocks(lastUser(m.requests[2]))[0].text).toMatch(/design changed since your last reply/);
  });

  it("feeds new engine problems back and lets the model fix them", async () => {
    const tooBig: Check = { code: "TEXT_DOES_NOT_FIT", severity: "error", message: "Text 1 (SMITH) does not fit.", element: "text:0" };
    const verify: Verifier = async (d) => ({ checks: (d.spec.texts?.[0].size ?? 0) > 100 ? [tooBig] : [], result: null });
    const m = scripted([
      { tools: [["set_text", { id: "text:0", content: "", font: "keep", size: 200 }]] },
      { tools: [["set_text", { id: "text:0", content: "", font: "keep", size: 60 }]] },
      { text: "SMITH is now 60 mm, the largest that fits." },
    ]);
    const reply = await runTurn({ transport: m.transport, verify, ctx: ctx(), message: "make SMITH 200 mm", conversation: new Conversation() });
    const feedback = blocks(lastUser(m.requests[1]));
    expect(feedback.at(-1)?.type).toBe("text");
    expect(feedback.at(-1)?.text).toMatch(/Automatic engine check[\s\S]*TEXT_DOES_NOT_FIT \(text:0\)/);
    expect(reply.design?.spec.texts?.[0].size).toBe(60);
    expect(reply.remaining).toEqual([]);
  });

  it("checks again when the model ends its turn, and stops after the round limit, reporting what's left", async () => {
    let n = 0;
    const verify: Verifier = async (d) => ({ checks: d === undefined || (d.spec.texts?.[0].size ?? 0) === 30 ? [] : [{ code: "TEXT_DOES_NOT_FIT", severity: "error", message: `still too big (${++n})`, element: "text:0" }], result: null });
    const m = scripted([{ tools: [["set_text", { id: "text:0", content: "", font: "keep", size: 200 }]] }, { text: "Done." }]);
    const reply = await runTurn({ transport: m.transport, verify, ctx: ctx(), message: "200 mm", conversation: new Conversation(), options: { maxVerifyRounds: 2 } });
    // Round 1: after the edit. Round 2: when the model said "Done." Then it stops asking.
    expect(m.requests.length).toBe(3);
    expect(reply.design).toBeDefined();
    expect(reply.remaining.map((c) => c.code)).toEqual(["TEXT_DOES_NOT_FIT"]);
  });

  it("uses the real engine checks (problems that were already there are not reported)", async () => {
    const m = scripted([{ tools: [["set_text", { id: "text:0", content: "", font: "archivo-black", size: 0 }]] }, { text: "Bolder now." }, { text: "Still bolder." }]);
    const reply = await runTurn({ transport: m.transport, verify: nodeVerify, ctx: ctx(F.script()), message: "bolder font", conversation: new Conversation(), options: { maxVerifyRounds: 1 } });
    // Archivo Black at 40 mm doesn't fit: a NEW error the model is told about.
    const fb = blocks(lastUser(m.requests[1])).at(-1)?.text ?? "";
    expect(fb).toMatch(/TEXT_DOES_NOT_FIT/);
    expect(fb).not.toMatch(/BIT_NEEDS_ACCESSORY/); // already there before the request
    expect(reply.remaining.some((c) => c.code === "TEXT_DOES_NOT_FIT")).toBe(true);
  });

  it("returns a question without changing the design", async () => {
    const m = scripted([{ tools: [["ask_clarifying_question", { question: "Which one: the heart or the star?", options: ["Heart", "Star"] }]] }, { text: "Which one: the heart or the star?" }]);
    const reply = await runTurn({ transport: m.transport, verify: quiet, ctx: ctx(F.heartStar()), message: "move it", conversation: new Conversation() });
    expect(reply.question?.options).toEqual(["Heart", "Star"]);
    expect(reply.design).toBeUndefined();
  });

  it("applies nothing from a refused turn", async () => {
    const m = scripted([{ tools: [["set_text", { id: "text:0", content: "X", font: "keep", size: 0 }]] }, { text: "", stop: "refusal" }]);
    const reply = await runTurn({ transport: m.transport, verify: quiet, ctx: ctx(), message: "…", conversation: new Conversation() });
    expect(reply.design).toBeUndefined();
    expect(reply.changes).toEqual([]);
  });

  it("does not run tool calls cut off by max_tokens", async () => {
    const m = scripted([{ tools: [["set_text", { id: "text:0", content: "HALF", font: "keep", size: 0 }]], stop: "max_tokens" }, { text: "Sorry." }]);
    const reply = await runTurn({ transport: m.transport, verify: quiet, ctx: ctx(), message: "x", conversation: new Conversation() });
    expect(reply.design).toBeUndefined();
    expect(blocks(lastUser(m.requests[1]))[0].is_error).toBe(true);
  });

  it("forgets a turn whose request failed (design untouched)", async () => {
    const conv = new Conversation();
    const failing: Transport = async () => {
      throw new Error("network down");
    };
    await expect(runTurn({ transport: failing, verify: quiet, ctx: ctx(), message: "x", conversation: conv })).rejects.toThrow("network down");
    expect(conv.messages).toEqual([]);
  });

  it("stops after maxSteps even if the model keeps calling tools", async () => {
    const m = scripted([{ tools: [["get_design", {}]] }]);
    const reply = await runTurn({ transport: m.transport, verify: quiet, ctx: ctx(), message: "loop", conversation: new Conversation(), options: { maxSteps: 3 } });
    expect(m.requests.length).toBe(3);
    expect(reply.design).toBeUndefined();
  });
});

describe("design store: one assistant reply = one undo step", () => {
  it("commit always adds its own undo step", () => {
    const st = useDesign.getState();
    st.setDesign(F.smith());
    // A manual edit just before (would normally merge with the next change within 600 ms)…
    st.patchSpec((s) => ({ ...s, width: 310 }));
    const beforeReply = useDesign.getState().design;
    st.commit({ ...beforeReply, spec: { ...beforeReply.spec, width: 320, height: 160 } });
    expect(useDesign.getState().design.spec.width).toBe(320);
    useDesign.getState().undo();
    expect(useDesign.getState().design).toBe(beforeReply);
  });
});
