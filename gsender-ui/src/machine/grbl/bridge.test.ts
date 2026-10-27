import net from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error módulo JS do bridge
import { originAllowed, startBridge } from "../../../bridge/server.mjs";
import { GrblController } from "./controller";
import { FakeGrbl } from "./fake";
import { BridgeTransport } from "./transport";

/**
 * Ponta a ponta pelo bridge: CarvCAM → WebSocket → carvcam-bridge → TCP (como a SLB por Ethernet)
 * → placa falsa. Precisa do WebSocket global do Node 22.
 */
const hasWs = typeof WebSocket !== "undefined";

describe.runIf(hasWs)("carvcam-bridge", () => {
  let tcp: net.Server;
  let tcpPort = 0;
  let wss: { close(): void };
  const fake = new FakeGrbl("grblHAL");

  beforeAll(async () => {
    tcp = net.createServer((sock) => {
      fake.onData((t) => sock.write(Buffer.from(t, "latin1")));
      void fake.open();
      sock.on("data", (b) => {
        // Bytes de tempo real chegam soltos; linhas terminam em \n.
        const s = b.toString("latin1");
        for (const ch of s.match(/[?!~\x18\x80-\xff]|[^?!~\x18\x80-\xff]+/g) ?? []) void fake.write(ch);
      });
    });
    await new Promise<void>((r) => tcp.listen(0, "127.0.0.1", () => r()));
    tcpPort = (tcp.address() as net.AddressInfo).port;
    wss = startBridge({ port: 8765, log: () => {} });
    await new Promise((r) => setTimeout(r, 100));
  });
  afterAll(() => {
    wss.close();
    tcp.close();
    void fake.close();
  });

  it("only lets local pages control the machine", () => {
    expect(originAllowed("http://localhost:4173")).toBe(true);
    expect(originAllowed("http://127.0.0.1:5173")).toBe(true);
    expect(originAllowed("https://evil.example.com")).toBe(false);
    expect(originAllowed("https://claude.ai")).toBe(false);
  });

  it("connects over 'Ethernet', jogs and streams through the bridge", async () => {
    const t = new BridgeTransport({ kind: "tcp", host: "127.0.0.1", port: tcpPort }, "test");
    let done = false;
    const c = new GrblController(t, { jobDone: () => (done = true) }, { pollMs: 50 });
    await c.connect();
    expect([c.version, c.rxSize, c.firmware]).toEqual(["1.1f.20240514", 1016, "grblHAL"]);
    await c.jog(0, 0, 2, 500);
    expect(fake.mpos.z).toBe(2);
    c.runJob(Array.from({ length: 40 }, (_, i) => `G1 X${i} F500`).join("\n"));
    const t0 = Date.now();
    while (!done && Date.now() - t0 < 4000) await new Promise((r) => setTimeout(r, 10));
    expect(done).toBe(true);
    await c.setFeedOverride(90);
    await new Promise((r) => setTimeout(r, 50));
    expect(fake.realtime).toContain("\x92");
    await c.close();
  });

  it("explains when the controller can't be reached", async () => {
    const t = new BridgeTransport({ kind: "tcp", host: "127.0.0.1", port: 1 }, "test");
    await expect(t.open()).rejects.toThrow();
  });
});
