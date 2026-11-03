import { describe, expect, it } from "vitest";
import { buildUpload, candidateAddresses, GsenderError, jobFileName, normalizeAddress, parseControllers, parseSignin, pickPort, sendToGsender, type Transport, type TransportInit } from "./gsender";

// Formato real de controller.status (src/server/controllers/Grbl/GrblController.js, get status()).
const ctrl = (port: string, workflow = "idle", activeState = "Idle", ready = true) => ({
  port,
  baudrate: 115200,
  rtscts: false,
  sockets: ["abc"],
  ready,
  controller: { type: "grblHAL", settings: {}, state: { status: { activeState } } },
  feeder: {},
  sender: {},
  workflow: { state: workflow },
});

type Call = { url: string; init?: TransportInit };
function mock(routes: Record<string, (init?: TransportInit) => { status: number; body: string } | Error>) {
  const calls: Call[] = [];
  const t: Transport = async (url, init) => {
    calls.push({ url, init });
    const path = new URL(url).pathname;
    const key = `${init?.method ?? "GET"} ${new URL(url).host}${path}`;
    const h = routes[key] ?? routes[`${init?.method ?? "GET"} ${path}`];
    if (!h) throw new Error("ECONNREFUSED");
    const r = h(init);
    if (r instanceof Error) throw r;
    return r;
  };
  return { t, calls };
}
const json = (v: unknown, status = 200) => ({ status, body: JSON.stringify(v) });

describe("gsender address", () => {
  it("normalizes what people type", () => {
    expect(normalizeAddress("192.168.1.50:8000")).toBe("http://192.168.1.50:8000");
    expect(normalizeAddress("192.168.1.50")).toBe("http://192.168.1.50:8000");
    expect(normalizeAddress(" http://pi.local:8123/ ")).toBe("http://pi.local:8123");
    expect(normalizeAddress("")).toBeNull();
    expect(normalizeAddress("not an address")).toBeNull();
  });
  it("tries this computer when nothing is saved", () => {
    expect(candidateAddresses("")).toEqual(["http://127.0.0.1:8000"]);
    expect(candidateAddresses("10.0.0.7:8000")).toEqual(["http://10.0.0.7:8000"]);
  });
});

describe("gsender responses", () => {
  it("parses /api/controllers", () => {
    const list = parseControllers(JSON.stringify([ctrl("COM3"), ctrl("/dev/ttyACM0", "running", "Run", false)]));
    expect(list).toHaveLength(2);
    expect(list[1]).toMatchObject({ port: "/dev/ttyACM0", workflow: "running", activeState: "Run", type: "grblHAL" });
    expect(pickPort(list)).toBe("COM3");
    expect(pickPort([])).toBe("");
  });
  it("rejects something that isn't gSender", () => {
    expect(() => parseControllers("<html>")).toThrow(GsenderError);
    expect(() => parseControllers('{"ok":true}')).toThrow(/isn't gSender/);
  });
  it("reads the signin token", () => {
    expect(parseSignin(json({ enabled: false, token: "jwt.x.y", name: "" }))).toBe("jwt.x.y");
    expect(parseSignin(json({ msg: "Authentication failed" }, 401))).toBeUndefined();
  });
  it("names files for gSender", () => {
    expect(jobFileName("Família Silva")).toBe("Familia-Silva.nc");
    expect(jobFileName("  ")).toBe("carvcam-job.nc");
  });
  it("builds the same multipart form as gSender's own file load", () => {
    const { body, contentType } = buildUpload("G21\n; Família\nG0 X0\n", "job.nc", "COM3", "B");
    expect(contentType).toBe("multipart/form-data; boundary=B");
    expect(body).toContain('--B\r\nContent-Disposition: form-data; name="gcode"; filename="job.nc"\r\n');
    expect(body).toContain("G21\n; Familia\nG0 X0\n\r\n");
    expect(body).toContain('name="port"\r\n\r\nCOM3\r\n');
    expect(body).toContain('name="visualizer"\r\n\r\nVISUALIZER_PRIMARY\r\n');
    expect(body.endsWith("--B--\r\n")).toBe(true);
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7f]/.test(body)).toBe(false);
  });
});

describe("sendToGsender", () => {
  it("signs in, finds the machine and uploads to /api/file", async () => {
    const { t, calls } = mock({
      "GET /api/controllers": () => json([ctrl("COM3")]),
      "POST /api/signin": () => json({ enabled: false, token: "tok", name: "" }),
      "POST /api/file": () => json({ msg: "Successfully loaded file" }),
    });
    const r = await sendToGsender({ gcode: "G21\n", name: "Sign", address: "192.168.1.50:8000", transport: t, browser: false });
    expect(r).toEqual({ address: "http://192.168.1.50:8000", port: "COM3", fileName: "Sign.nc" });
    const up = calls.find((c) => c.url.endsWith("/api/file"))!;
    expect(up.url).toBe("http://192.168.1.50:8000/api/file");
    expect(up.init?.headers?.Authorization).toBe("Bearer tok");
    expect(up.init?.headers?.["Content-Type"]).toMatch(/^multipart\/form-data; boundary=/);
    expect(up.init?.body).toContain('name="port"\r\n\r\nCOM3');
  });

  it("still loads the file when no machine is connected in gSender", async () => {
    const { t, calls } = mock({
      "GET /api/controllers": () => json([]),
      "POST /api/signin": () => json({ msg: "Authentication failed" }, 401),
      "POST /api/file": () => json({ msg: "Successfully loaded file" }),
    });
    const r = await sendToGsender({ gcode: "G21\n", name: "x", transport: t, browser: false });
    expect(r.port).toBe("");
    expect(r.address).toBe("http://127.0.0.1:8000");
    const up = calls.find((c) => c.url.endsWith("/api/file"))!;
    expect(up.init?.headers?.Authorization).toBeUndefined();
    expect(up.init?.body).toContain('name="port"\r\n\r\n\r\n');
  });

  it("refuses to replace a running job", async () => {
    const { t, calls } = mock({ "GET /api/controllers": () => json([ctrl("COM3", "running", "Run")]) });
    await expect(sendToGsender({ gcode: "G21\n", name: "x", transport: t, browser: false })).rejects.toMatchObject({ code: "busy" });
    expect(calls.some((c) => c.url.includes("/api/file"))).toBe(false);
  });

  it("refuses while paused (feed hold)", async () => {
    const { t } = mock({ "GET /api/controllers": () => json([ctrl("COM3", "paused", "Hold:0")]) });
    await expect(sendToGsender({ gcode: "G21\n", name: "x", transport: t, browser: false })).rejects.toMatchObject({ code: "busy" });
  });

  it("explains when gSender isn't running", async () => {
    const { t } = mock({});
    await expect(sendToGsender({ gcode: "G21\n", name: "x", transport: t, browser: false })).rejects.toMatchObject({ code: "unreachable", fix: expect.stringMatching(/Remote Mode/) });
  });

  it("keeps browser requests CORS-simple (no signin, no Authorization)", async () => {
    const { t, calls } = mock({
      "GET /api/controllers": () => json([ctrl("COM3")]),
      "POST /api/file": () => json({ msg: "Successfully loaded file" }),
    });
    await sendToGsender({ gcode: "G21\n", name: "x", transport: t, browser: true, pageProtocol: "http:" });
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual(["/api/controllers", "/api/file"]);
    expect(Object.keys(calls[1].init?.headers ?? {})).toEqual(["Content-Type"]);
  });

  it("explains browser blocking (CORS / private network)", async () => {
    const { t } = mock({ "GET /api/controllers": () => new TypeError("Failed to fetch") });
    await expect(sendToGsender({ gcode: "G21\n", name: "x", transport: t, browser: true })).rejects.toMatchObject({ code: "blocked", fix: expect.stringMatching(/desktop app/) });
  });

  it("doesn't even try another computer from an https page", async () => {
    const { t, calls } = mock({});
    await expect(sendToGsender({ gcode: "G21\n", name: "x", address: "192.168.1.50:8000", transport: t, browser: true, pageProtocol: "https:" })).rejects.toMatchObject({ code: "blocked" });
    expect(calls).toHaveLength(0);
  });

  it("reports timeouts", async () => {
    const { t } = mock({ "GET /api/controllers": () => new Error("Request timed out") });
    await expect(sendToGsender({ gcode: "G21\n", name: "x", address: "10.0.0.2", transport: t, browser: false })).rejects.toMatchObject({ code: "timeout" });
  });

  it("reports a bad address before sending anything", async () => {
    const { t, calls } = mock({});
    await expect(sendToGsender({ gcode: "G21\n", name: "x", address: "what?? no", transport: t, browser: false })).rejects.toMatchObject({ code: "bad-address" });
    expect(calls).toHaveLength(0);
  });

  it("surfaces gSender's error message", async () => {
    const { t } = mock({
      "GET /api/controllers": () => json([]),
      "POST /api/signin": () => json({ token: "t" }),
      "POST /api/file": () => json({ msg: "No file attached" }, 400),
    });
    await expect(sendToGsender({ gcode: "G21\n", name: "x", transport: t, browser: false })).rejects.toThrow(/400: No file attached/);
  });
});
