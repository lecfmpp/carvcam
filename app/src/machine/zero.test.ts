import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { useMachine, zeroPatch } from "./store";

/** Work zero in the simulator: the touch plate is optional, Z can be set by hand (paper method). */
describe("work zero", () => {
  beforeAll(() => {
    // The simulator animates moves with requestAnimationFrame (not in Node).
    const g = globalThis as unknown as { requestAnimationFrame?: (cb: () => void) => void };
    g.requestAnimationFrame ??= (cb) => void setTimeout(cb, 4);
  });
  beforeEach(() => {
    useMachine.setState({ conn: null, status: "idle", homed: true, pos: { x: 60, y: 60, z: -40 }, workZero: null, zMeasured: false, zeroMethod: null });
  });

  it("setting Z by hand marks the height as known and records the manual method", () => {
    useMachine.getState().setWorkZero(["z"]);
    const s = useMachine.getState();
    expect(s.zMeasured).toBe(true);
    expect(s.zeroMethod).toBe("manual");
    expect(s.workZero?.z).toBe(-40);
  });

  it("X and Y alone don't claim a Z height", () => {
    useMachine.getState().setWorkZero(["x", "y"]);
    const s = useMachine.getState();
    expect(s.zMeasured).toBe(false);
    expect(s.zeroMethod).toBeNull();
    expect(s.workZero).toMatchObject({ x: 60, y: 60 });
  });

  it("X/Y after a manual Z keeps the Z zero and the method", () => {
    useMachine.getState().setWorkZero(["z"]);
    useMachine.setState({ pos: { x: 70, y: 65, z: -35 } });
    useMachine.getState().setWorkZero(["x", "y"]);
    const s = useMachine.getState();
    expect(s.workZero).toEqual({ x: 70, y: 65, z: -40 });
    expect(s.zMeasured).toBe(true);
    expect(s.zeroMethod).toBe("manual");
  });

  it("X, Y and Z at once by hand", () => {
    useMachine.getState().setWorkZero();
    const s = useMachine.getState();
    expect(s.workZero).toEqual({ x: 60, y: 60, z: -40 });
    expect(s.zeroMethod).toBe("manual");
  });

  it("the touch plate records the probe method, and a later manual Z overrides it", async () => {
    await useMachine.getState().probeZ(15);
    expect(useMachine.getState().zMeasured).toBe(true);
    expect(useMachine.getState().zeroMethod).toBe("probe");
    useMachine.getState().setWorkZero(["z"]);
    expect(useMachine.getState().zeroMethod).toBe("manual");
  });

  it("Z jogs are allowed during a bit change, X/Y jogs are not", () => {
    useMachine.setState({ status: "toolchange" });
    useMachine.getState().jog(0, 0, -0.1);
    expect(useMachine.getState().pos.z).toBeCloseTo(-40.1);
    useMachine.getState().jog(5, 0, 0);
    expect(useMachine.getState().pos.x).toBe(60);
  });

  it("zeroPatch (shared with the real controller) only touches Z state when Z is zeroed", () => {
    expect(zeroPatch(["x", "y"])).toEqual({});
    expect(zeroPatch(["z"])).toEqual({ zMeasured: true, zeroMethod: "manual" });
    expect(zeroPatch(["x", "y", "z"])).toEqual({ zMeasured: true, zeroMethod: "manual" });
  });
});
