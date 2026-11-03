import { describe, expect, it } from "vitest";
import { specError } from "../ops";
import { CASES, categories } from "./cases";
import { caseContext, replayTransport, runCase } from "./harness";

/**
 * Offline check of the eval set: every starting design is valid, and every case's golden answer,
 * replayed through the real turn loop, tools and engine, passes the case's own assertions. (The live
 * run against Claude is `npm run eval:assistant`.)
 */
describe("assistant eval cases", () => {
  it("has at least 40 cases with unique ids, in every category", () => {
    expect(CASES.length).toBeGreaterThanOrEqual(40);
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
    expect(categories()).toEqual(expect.arrayContaining(["board", "text", "style", "layout", "elements", "copies", "bits", "ambiguous", "pro", "safety", "fix"]));
  });

  it.each(CASES.map((c) => [c.id, c] as const))("%s: starting design is valid", (_id, c) => {
    expect(specError(caseContext(c).design.spec)).toBeNull();
  });

  it.each(CASES.map((c) => [c.id, c] as const))("%s: golden answer passes", async (_id, c) => {
    const r = await runCase(c, replayTransport(c.golden), { maxVerifyRounds: 0 });
    expect(r.error).toBeUndefined();
    expect(r.tools.filter((t) => t.endsWith("!"))).toEqual([]);
    expect(r.failures).toEqual([]);
  });
});
