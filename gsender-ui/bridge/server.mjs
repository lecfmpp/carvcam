#!/usr/bin/env node
// carvcam-bridge: liga o CarvCAM (no navegador) à controladora da máquina.
//
// O navegador não abre portas USB em todos os navegadores e nunca abre conexões TCP diretas, que é
// como a SuperLongBoard fala por Ethernet (porta 23). Este programa roda no próprio computador,
// só aceita conexões dele mesmo (127.0.0.1) e de páginas servidas pelo próprio computador, e passa
// os bytes nos dois sentidos.
//
//   node bridge/server.mjs            (o "npm run local" já inicia junto)
//
// Mensagens (JSON por WebSocket em ws://127.0.0.1:8765):
//   → {t:"list"}                                   ← {t:"ports", ports:[{path, manufacturer, vendorId, productId}]}
//   → {t:"open", kind:"serial", path, baud?}       ← {t:"opened"} | {t:"error", message}
//   → {t:"open", kind:"tcp", host, port}
//   → {t:"write", data}   (texto; bytes acima de 0x7F vão como caracteres latin1)
//   ← {t:"data", data}    ← {t:"closed", reason}
import { existsSync, readdirSync } from "node:fs";
import net from "node:net";
import { SerialPort } from "serialport";
import { WebSocketServer } from "ws";

export const BRIDGE_PORT = Number(process.env.CARVCAM_BRIDGE_PORT ?? 8765);

/** Só páginas do próprio computador (o app local) podem mandar na máquina. */
export function originAllowed(origin) {
  if (!origin) return true; // ferramentas locais (sem navegador)
  try {
    const u = new URL(origin);
    return ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) && (u.protocol === "http:" || u.protocol === "https:");
  } catch {
    return false;
  }
}

/** Lista portas seriais. No Linux sem udevadm (alguns contêineres), procura em /dev. */
export async function listPorts() {
  if (process.platform === "linux" && !["/usr/bin/udevadm", "/bin/udevadm", "/sbin/udevadm", "/usr/sbin/udevadm"].some(existsSync)) {
    return readdirSync("/dev")
      .filter((f) => /^tty(ACM|USB)\d+$/.test(f))
      .map((f) => ({ path: `/dev/${f}` }));
  }
  const ports = await SerialPort.list();
  return ports
    .filter((p) => p.vendorId || /usb|acm|modem|COM\d/i.test(p.path))
    .map((p) => ({ path: p.path, manufacturer: p.manufacturer, vendorId: p.vendorId, productId: p.productId, serialNumber: p.serialNumber }));
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
        /* já fechado */
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
