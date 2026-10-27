// carvcam-bridge: connects CarvCAM (in the browser) to the machine's controller.
//
// Not every browser can open USB ports, and none can open raw TCP connections, which is how the
// SuperLongBoard talks over Ethernet (port 23). This program runs on the same computer, only
// accepts connections from itself (127.0.0.1) and from pages served by this computer, and passes
// the bytes through in both directions.
//
//   node bridge/server.mjs            ("npm run local" already starts it)
//
// Messages (JSON over WebSocket at ws://127.0.0.1:8765):
//   → {t:"list"}                                   ← {t:"ports", ports:[{path, manufacturer, vendorId, productId}]}
//   → {t:"open", kind:"serial", path, baud?}       ← {t:"opened"} | {t:"error", message}
//   → {t:"open", kind:"tcp", host, port}
//   → {t:"write", data}   (text; bytes above 0x7F are sent as latin1 characters)
//   ← {t:"data", data}    ← {t:"closed", reason}
import { existsSync, readdirSync } from "node:fs";
import net from "node:net";
import { SerialPort } from "serialport";
import { WebSocketServer } from "ws";

export const BRIDGE_PORT = Number(process.env.CARVCAM_BRIDGE_PORT ?? 8765);

/** Only pages from this computer (the local app) may control the machine. */
export function originAllowed(origin) {
  if (!origin) return true; // local tools (no browser)
  try {
    const u = new URL(origin);
    return ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) && (u.protocol === "http:" || u.protocol === "https:");
  } catch {
    return false;
  }
}

/** Lists serial ports. On Linux without udevadm (some containers), looks in /dev. */
// Same list of USB chips that gSender 1.6.4 accepts as a controller (CNCEngine.js):
// 0483 STM32 (SuperLongBoard, SLB-EXT, SLB-LITE), 1A86 CH340 e 2341 Arduino (LongBoard), FTDI, CP210x, Teensy, RP2040...
const KNOWN_VIDS = ["2E8A", "16C0", "1D50", "0403", "2341", "0042", "1A86", "10C4", "067B", "03EB", "16D0", "0483"];
export const knownController = (p) => !!p.vendorId && KNOWN_VIDS.includes(String(p.vendorId).toUpperCase());

export async function listPorts() {
  if (process.platform === "linux" && !["/usr/bin/udevadm", "/bin/udevadm", "/sbin/udevadm", "/usr/sbin/udevadm"].some(existsSync)) {
    return readdirSync("/dev")
      .filter((f) => /^tty(ACM|USB)\d+$/.test(f))
      .map((f) => ({ path: `/dev/${f}` }));
  }
  const ports = await SerialPort.list();
  return ports
    .filter((p) => p.vendorId || /usb|acm|modem|COM\d/i.test(p.path))
    .map((p) => ({ path: p.path, manufacturer: p.manufacturer, vendorId: p.vendorId, productId: p.productId, serialNumber: p.serialNumber, known: knownController(p) }))
    // Known controllers first (on Windows, Bluetooth and modem ports also show up as COM ports).
    .sort((a, b) => Number(b.known) - Number(a.known));
}

export function startBridge({ port = BRIDGE_PORT, log = console.log } = {}) {
  const wss = new WebSocketServer({ host: "127.0.0.1", port, verifyClient: (info) => originAllowed(info.origin) });

  wss.on("connection", (ws) => {
    /** @type {{write(b: Buffer): void, close(): void} | null} */
    let dev = null;
    const send = (m) => ws.readyState === 1 && ws.send(JSON.stringify(m));
    const closeDev = () => {
      try {
        dev?.close();
      } catch {
        /* already closed */
      }
      dev = null;
    };

    ws.on("message", async (raw) => {
      let m;
      try {
        m = JSON.parse(String(raw));
      } catch {
        return;
      }
      try {
        if (m.t === "list") send({ t: "ports", ports: await listPorts() });
        else if (m.t === "open") {
          closeDev();
          if (m.kind === "serial") {
            const sp = new SerialPort({ path: m.path, baudRate: m.baud ?? 115200, autoOpen: false });
            await new Promise((res, rej) => sp.open((e) => (e ? rej(e) : res())));
            sp.on("data", (b) => send({ t: "data", data: b.toString("latin1") }));
            sp.on("close", () => send({ t: "closed", reason: "The USB connection was lost" }));
            sp.on("error", (e) => send({ t: "error", message: e.message }));
            dev = { write: (b) => sp.write(b), close: () => sp.isOpen && sp.close() };
            log(`[bridge] opened ${m.path}`);
          } else if (m.kind === "tcp") {
            const sock = net.createConnection({ host: m.host, port: m.port ?? 23 });
            sock.setNoDelay(true);
            await new Promise((res, rej) => {
              const t = setTimeout(() => rej(new Error(`No answer from ${m.host}:${m.port ?? 23}`)), 5000);
              sock.once("connect", () => (clearTimeout(t), res()));
              sock.once("error", (e) => (clearTimeout(t), rej(e)));
            });
            sock.on("data", (b) => send({ t: "data", data: b.toString("latin1") }));
            sock.on("close", () => send({ t: "closed", reason: "The Ethernet connection was lost" }));
            sock.on("error", (e) => send({ t: "error", message: e.message }));
            dev = { write: (b) => sock.write(b), close: () => sock.destroy() };
            log(`[bridge] connected to ${m.host}:${m.port ?? 23}`);
          } else throw new Error("Unknown connection type");
          send({ t: "opened" });
        } else if (m.t === "write") {
          if (!dev) throw new Error("Not connected");
          dev.write(Buffer.from(String(m.data), "latin1"));
        } else if (m.t === "close") closeDev();
      } catch (e) {
        send({ t: "error", message: e instanceof Error ? e.message : String(e) });
      }
    });
    ws.on("close", closeDev);
  });

  wss.on("listening", () => log(`[bridge] CarvCAM bridge on ws://127.0.0.1:${port}`));
  wss.on("error", (e) => {
    if (e.code === "EADDRINUSE") log(`[bridge] already running on port ${port}`);
    else log(`[bridge] ${e.message}`);
  });
  return wss;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("server.mjs")) startBridge();
