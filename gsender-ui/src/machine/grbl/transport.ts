/**
 * Caminhos até a controladora. Todos entregam texto e aceitam texto ou bytes (comandos de tempo
 * real, como "?" e 0x18, vão como bytes soltos, fora da fila de linhas).
 *
 * - WebSerial: USB direto do Chrome/Edge, sem instalar nada.
 * - Bridge: o "carvcam-bridge" (bridge/server.mjs) roda no computador junto do app e abre a porta
 *   USB ou a conexão Ethernet (TCP, porta 23 da SLB). Serve para qualquer navegador e para Ethernet,
 *   que o navegador não consegue abrir sozinho.
 */
export interface Transport {
  readonly label: string;
  open(): Promise<void>;
  write(data: string | Uint8Array): Promise<void>;
  close(): Promise<void>;
  onData(cb: (text: string) => void): void;
  onClose(cb: (reason: string) => void): void;
}

/* ---------------- Web Serial ---------------- */

// Tipos mínimos da Web Serial API (não estão no lib.dom do TypeScript).
export interface SerialPortLike {
  open(o: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  getInfo?(): { usbVendorId?: number; usbProductId?: number };
}
interface SerialLike {
  requestPort(o?: object): Promise<SerialPortLike>;
  getPorts(): Promise<SerialPortLike[]>;
}

export function webSerial(): SerialLike | null {
  return typeof navigator !== "undefined" && "serial" in navigator ? ((navigator as unknown as { serial: SerialLike }).serial ?? null) : null;
}

export class WebSerialTransport implements Transport {
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private dataCb: (t: string) => void = () => {};
  private closeCb: (r: string) => void = () => {};
  private closing = false;
  constructor(
    private port: SerialPortLike,
    readonly label: string,
    private baud = 115200,
  ) {}

  async open() {
    await this.port.open({ baudRate: this.baud });
    void this.readLoop();
  }
  private async readLoop() {
    const dec = new TextDecoder();
    while (this.port.readable && !this.closing) {
      this.reader = this.port.readable.getReader();
      try {
        for (;;) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value) this.dataCb(dec.decode(value, { stream: true }));
        }
      } catch {
        break;
      } finally {
        this.reader.releaseLock();
      }
    }
    if (!this.closing) this.closeCb("The USB connection was lost");
  }
  async write(data: string | Uint8Array) {
    const w = this.port.writable?.getWriter();
    if (!w) throw new Error("Port is not open");
    try {
      await w.write(typeof data === "string" ? new TextEncoder().encode(data) : data);
    } finally {
      w.releaseLock();
    }
  }
  async close() {
    this.closing = true;
    try {
      await this.reader?.cancel();
    } catch {
      /* já fechado */
    }
    try {
      await this.port.close();
    } catch {
      /* já fechado */
    }
  }
  onData(cb: (t: string) => void) {
    this.dataCb = cb;
  }
  onClose(cb: (r: string) => void) {
    this.closeCb = cb;
  }
}

/* ---------------- carvcam-bridge ---------------- */

export const BRIDGE_URL = "ws://127.0.0.1:8765";

export interface BridgePort {
  path: string;
  manufacturer?: string;
  vendorId?: string;
  productId?: string;
  serialNumber?: string;
}

export type BridgeTarget = { kind: "serial"; path: string; baud?: number } | { kind: "tcp"; host: string; port: number };

/** Lista as portas USB pelo bridge; null se o bridge não estiver rodando. */
export function bridgePorts(timeoutMs = 1200): Promise<BridgePort[] | null> {
  return new Promise((resolve) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(BRIDGE_URL);
    } catch {
      return resolve(null);
    }
    const t = setTimeout(() => {
      ws.close();
      resolve(null);
    }, timeoutMs);
    ws.onopen = () => ws.send(JSON.stringify({ t: "list" }));
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data));
      if (m.t === "ports") {
        clearTimeout(t);
        ws.close();
        resolve(m.ports as BridgePort[]);
      }
    };
    ws.onerror = () => {
      clearTimeout(t);
      resolve(null);
    };
  });
}

export class BridgeTransport implements Transport {
  private ws: WebSocket | null = null;
  private dataCb: (t: string) => void = () => {};
  private closeCb: (r: string) => void = () => {};
  private closing = false;
  constructor(
    private target: BridgeTarget,
    readonly label: string,
  ) {}

  open() {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(BRIDGE_URL);
      this.ws = ws;
      let opened = false;
      ws.onopen = () => ws.send(JSON.stringify({ t: "open", ...this.target }));
      ws.onmessage = (e) => {
        const m = JSON.parse(String(e.data));
        if (m.t === "opened") {
          opened = true;
          resolve();
        } else if (m.t === "data") this.dataCb(m.data);
        else if (m.t === "error") {
          if (!opened) reject(new Error(m.message));
          else this.closeCb(m.message);
        } else if (m.t === "closed" && !this.closing) this.closeCb(m.reason ?? "The connection was closed");
      };
      ws.onerror = () => {
        if (!opened) reject(new Error("CarvCAM bridge is not running"));
      };
      ws.onclose = () => {
        if (opened && !this.closing) this.closeCb("Lost contact with the CarvCAM bridge");
      };
    });
  }
  async write(data: string | Uint8Array) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error("Not connected");
    const text = typeof data === "string" ? data : String.fromCharCode(...data);
    this.ws.send(JSON.stringify({ t: "write", data: text }));
  }
  async close() {
    this.closing = true;
    this.ws?.close();
  }
  onData(cb: (t: string) => void) {
    this.dataCb = cb;
  }
  onClose(cb: (r: string) => void) {
    this.closeCb = cb;
  }
}
