import { describe, expect, it } from "vitest";
import { F, STARTER_BITS } from "./evals/fixtures";
import { machineCtx } from "./evals/node";
import { runLocal } from "./local";
import type { AssistantContext } from "./types";

const ctx = (design = F.smith(), extra: Partial<AssistantContext> = {}): AssistantContext => ({ design, machine: machineCtx(), ownedBits: STARTER_BITS, pro: false, ...extra });

describe("offline assistant", () => {
  it("converts inches for the board size and changes nothing else", async () => {
    const r = await runLocal("make the sign 12 by 8 inches", ctx());
    expect(r.provider).toBe("local");
    expect([r.design?.spec.width, r.design?.spec.height]).toEqual([304.8, 203.2]);
    expect(r.design?.spec.texts).toEqual(ctx().design.spec.texts);
    expect(r.text).toMatch(/12 × 8 in/);
    expect(r.changes).toEqual(["Sign → width 304.8 mm, height 203.2 mm"]);
  });

  it("engraves with a depth", async () => {
    const r = await runLocal("engrave the house number 3 mm deep", ctx(F.houseNumber()));
    expect(r.design?.spec.texts?.[0]).toMatchObject({ mode: "engrave", depth: 3 });
  });

  it("adds a hole in each corner", async () => {
    const r = await runLocal("add a mounting hole in each corner", ctx(F.blank()));
    expect(r.design?.spec.holes).toHaveLength(4);
  });

  it("changes the font, the words, the edge and the frame", async () => {
    expect((await runLocal("change the font to something script", ctx())).design?.spec.texts?.[0].font).toBe("pacifico");
    expect((await runLocal('change the text to "JONES"', ctx())).design?.spec.texts?.[0].content).toBe("JONES");
    expect((await runLocal("chamfer the edge", ctx())).design?.spec.edge?.type).toBe("chamfered");
    expect((await runLocal("remove the frame", ctx())).design?.spec.frame).toBe(0);
    expect((await runLocal("center everything", ctx(F.offCenter()))).design?.spec.icons?.[0].x).toBeCloseTo(120, 0);
  });

  it("never starts the machine", async () => {
    for (const m of ["start carving", "carve it now", "run the job on the machine"]) {
      const r = await runLocal(m, ctx());
      expect(r.design).toBeUndefined();
      expect(r.text).toMatch(/starts with you/);
    }
  });

  it("points to Pro features without doing their work", async () => {
    const r = await runLocal("make this an inlay", ctx(F.heartStar()));
    expect(r.design).toBeUndefined();
    expect(r.action?.feature).toBe("inlay");
  });

  it("says when it doesn't understand, and doesn't guess between several texts", async () => {
    expect((await runLocal("make it look more rustic", ctx())).design).toBeUndefined();
    const two = await runLocal('change the text to "X"', ctx(F.twoLines()));
    expect(two.design).toBeUndefined();
    expect(two.text).toMatch(/Connect Claude/);
  });
});
