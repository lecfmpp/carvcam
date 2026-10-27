import { describe, expect, it } from "vitest";
import { GrblController } from "./controller";
import { FakeGrbl } from "./fake";
import { alarmKind, cleanLine, parseLine } from "./parse";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(cond: () => boolean, ms = 3000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("timeout");
    await wait(5);
  }
}

describe("parse", () => {
  it("reads grblHAL status reports", () => {
    const m = parseLine("<Hold:0|MPos:-10.000,-20.500,-3.000|Bf:35,1024|FS:500,12000|Ov:100,100,90|WCO:-100.000,-200.000,-50.000|Pn:P>");
    expect(m.type).toBe("status");
    if (m.type !== "status") return;
    expect(m.status).toMatchObject({ state: "Hold", sub: 0, mpos: { x: -10, y: -20.5, z: -3 }, feed: 500, rpm: 12000, ov: [100, 100, 90], pins: "P", bf: [35, 1024] });
    expect(m.status.wco).toEqual({ x: -100, y: -200, z: -50 });
  });
  it("reads the rest", () => {
    expect(parseLine("ok")).toEqual({ type: "ok" });
    expect(parseLine("error:9")).toEqual({ type: "error", code: 9 });
    expect(parseLine("ALARM:10")).toEqual({ type: "alarm", code: 10 });
    expect(parseLine("GrblHAL 1.1f ['$' or '$HELP' for help]")).toMatchObject({ type: "welcome", firmware: "grblHAL" });
    expect(parseLine("Grbl 1.1h ['$' for help]")).toMatchObject({ type: "welcome", firmware: "grbl" });
    expect(parseLine("[OPT:VNMSL,35,1024,3,0]")).toMatchObject({ type: "opt", planner: 35, rx: 1024 });
    expect(parseLine("[PRB:1.000,2.000,-15.250:1]")).toEqual({ type: "prb", pos: { x: 1, y: 2, z: -15.25 }, ok: true });
    expect(parseLine("$110=4000.000")).toEqual({ type: "setting", key: "110", value: "4000.000" });
    expect(parseLine("[MSG:Pgm End]")).toEqual({ type: "msg", text: "Pgm End" });
    expect(cleanLine("G1 X10 (move) ; comment")).toBe("G1 X10");
    expect(alarmKind(1)).toBe("limit");
    expect(alarmKind(10)).toBe("estop");
    expect(alarmKind(4)).toBe("probe");
  });
});

describe("controller", () => {
  it("connects to grblHAL and reads version, buffer size and settings", async () => {
    const f = new FakeGrbl("grblHAL");
    const c = new GrblController(f, {}, { pollMs: 20 });
    await c.connect();
    expect(c.version).toBe("1.1f.20240514");
    expect(c.rxSize).toBeGreaterThan(900);
    expect(c.settings["130"]).toBe("1260.000");
    await until(() => !!c.last);
    expect(c.last?.state).toBe("Idle");
    await c.close();
  });

  it("identifies grblHAL from the $I reply, like gSender, even with a small buffer", async () => {
    const f = new FakeGrbl("grblHAL", 128);
    const c = new GrblController(f, {}, { pollMs: 20 });
    await c.connect();
    expect(c.firmware).toBe("grblHAL");
    expect(c.rxSize).toBe(120);
    await c.close();
  });

  it("asks grblHAL for the full status report (0x87) while in alarm", async () => {
    const f = new FakeGrbl("grblHAL");
    const c = new GrblController(f, {}, { pollMs: 20 });
    await c.connect();
    (f as unknown as { state: string }).state = "Alarm";
    await until(() => c.last?.state === "Alarm");
    await until(() => f.realtime.includes("\x87"));
    await c.close();
  });

  it("waits for a LongBoard (grbl) that restarts on connect", async () => {
    const f = new FakeGrbl("grbl");
    const c = new GrblController(f, {}, { pollMs: 20 });
    await c.connect();
    expect(c.firmware).toBe("grbl");
    expect(c.rxSize).toBe(120);
    await c.close();
  });

  it("streams a job without overflowing the 128-byte grbl buffer, in order", async () => {
    const f = new FakeGrbl("grbl");
    const done: number[] = [];
    let finished = false;
    const c = new GrblController(f, { jobLine: (l) => done.push(l), jobDone: () => (finished = true) }, { pollMs: 50 });
    await c.connect();
    const lines = ["G21 G90", ...Array.from({ length: 300 }, (_, i) => `G1 X${(i * 0.731).toFixed(3)} Y${(i * 1.17).toFixed(3)} Z-1.000 F1200 ; step ${i}`), "M5"];
    c.runJob(lines.join("\n"));
    await until(() => finished, 5000);
    const sent = f.received.filter((l) => l.startsWith("G1") || l === "M5" || l === "G21 G90");
    expect(sent.length).toBe(302);
    expect(sent[1]).toBe("G1 X0.000 Y0.000 Z-1.000 F1200");
    expect(f.maxBuffered).toBeLessThanOrEqual(128);
    expect(f.maxBuffered).toBeGreaterThan(60); // mantém o buffer cheio, não uma linha por vez
    expect(done[done.length - 1]).toBe(302);
    await c.close();
  });

  it("holds the job at M6 until the tool change is confirmed", async () => {
    const f = new FakeGrbl("grblHAL");
    let tool = 0;
    let finished = false;
    const c = new GrblController(f, { toolChange: (t) => (tool = t), jobDone: () => (finished = true) }, { pollMs: 50 });
    await c.connect();
    c.runJob(["G1 X1 F100", "G1 X2", "T2 M6", "G1 X3", "M5"].join("\n"));
    await until(() => tool === 2);
    await wait(30);
    expect(f.received).toContain("G1 X2");
    expect(f.received).not.toContain("G1 X3");
    expect(f.received.some((l) => /M6/.test(l))).toBe(false);
    c.confirmToolChange();
    await until(() => finished);
    expect(f.received).toContain("G1 X3");
    await c.close();
  });

  it("stops the job when a line fails and reports it", async () => {
    const f = new FakeGrbl("grbl");
    f.errors["G1 X5 Q9"] = 20;
    const errs: number[] = [];
    const c = new GrblController(f, { error: (code, _l, inJob) => inJob && errs.push(code) }, { pollMs: 50 });
    await c.connect();
    c.runJob(["G1 X1 F100", "G1 X5 Q9", ...Array.from({ length: 50 }, (_, i) => `G1 X${i + 10}`)].join("\n"));
    await until(() => errs.length > 0);
    await wait(40);
    expect(errs).toEqual([20]);
    expect(f.realtime).toContain("!");
    const after = f.received.filter((l) => /^G1 X\d\d/.test(l)).length;
    expect(after).toBeLessThan(50);
    await c.close();
  });

  it("homes, jogs, sets work zero and probes Z", async () => {
    const f = new FakeGrbl("grblHAL");
    const c = new GrblController(f, {}, { pollMs: 20 });
    await c.connect();
    await c.home();
    await c.jog(-100, -50, 0, 3000);
    expect(f.mpos).toMatchObject({ x: -100, y: -50 });
    await c.setZero(["x", "y"]);
    expect(f.wco).toMatchObject({ x: -100, y: -50 });
    await c.probeZ(15);
    expect(f.received).toContain("G38.2 Z-50 F150");
    expect(f.received).toContain("G10 L20 P1 Z15");
    expect(f.received[f.received.length - 1]).toBe("G90");
    f.probeOk = false;
    await expect(c.probeZ(15)).rejects.toThrow();
    await c.close();
  });

  it("stop holds, then resets the controller and clears the queue", async () => {
    const f = new FakeGrbl("grbl");
    const c = new GrblController(f, {}, { pollMs: 10 });
    await c.connect();
    c.runJob(Array.from({ length: 200 }, (_, i) => `G1 X${i} F100`).join("\n"));
    await until(() => f.received.length > 10);
    await c.stop();
    const n = f.received.length;
    await wait(50);
    expect(f.realtime).toContain("!");
    expect(f.realtime).toContain("\x18");
    expect(f.received.length).toBe(n);
    expect(c.busy).toBe(false);
    await c.close();
  });

  it("sets overrides with realtime steps", async () => {
    const f = new FakeGrbl("grblHAL");
    const c = new GrblController(f, {}, { pollMs: 50 });
    await c.connect();
    await c.setFeedOverride(123);
    expect(f.realtime.filter((r) => r !== "?").map((r) => r.charCodeAt(0).toString(16))).toEqual(["90", "91", "91", "93", "93", "93"]);
    await c.close();
  });

  it("reports a lost connection", async () => {
    const f = new FakeGrbl("grblHAL");
    let why = "";
    const c = new GrblController(f, { closed: (r) => (why = r) }, { pollMs: 50 });
    await c.connect();
    const p = c.send("G4 P10");
    f.drop();
    expect(why).toBe("cable pulled");
    await expect(p).rejects.toThrow();
  });

  it("fails clearly when nothing answers", async () => {
    const silent = { label: "x", open: async () => {}, close: async () => {}, write: async () => {}, onData() {}, onClose() {} };
    const c = new GrblController(silent, {}, { timeoutMs: 300 });
    await expect(c.connect()).rejects.toThrow(/didn't answer/);
  });
});

describe("resume in the middle", () => {
  it("lifts to safe Z, restarts the spindle, returns over the last point and plunges at feed", async () => {
    const { resumePreamble } = await import("./resume");
    const g = ["G21 G90", "G0 Z10", "M3 S18000", "G1 Z-1 F300", "G1 X10 F1500", "G1 X20", "G0 Z10"];
    // Recomeça em "G1 X20": volta por cima até X10, desce até Z-1 e só então continua cortando.
    expect(resumePreamble(g, 6)).toEqual(["G21", "G90", "G0 Z10", "M3 S18000", "G4 P3", "G0 X10", "G1 Z-1 F750", "F1500"]);
    expect(resumePreamble(["G20", "M3 S10000", "M5", "G1 X1 F40"], 5)).toEqual(["G20", "G90", "G0 Z5", "G0 X1", "F40"]);
  });
});
