import type { Transport } from "./transport";

/**
 * Placa grbl de mentira para testes: responde como uma SLB (grblHAL) ou LongBoard (grbl),
 * executa uma linha por "tick" e confere que nunca recebe mais bytes do que cabem no buffer.
 */
export class FakeGrbl implements Transport {
  readonly label = "Fake grbl";
  received: string[] = [];
  realtime: string[] = [];
  /** Maior quantidade de bytes esperando no buffer ao mesmo tempo. */
  maxBuffered = 0;
  state = "Idle";
  sub: number | undefined;
  mpos = { x: 0, y: 0, z: 0 };
  wco = { x: 0, y: 0, z: 0 };
  /** Linhas que respondem com erro (texto exato → código). */
  errors: Record<string, number> = {};
  probeOk = true;
  private pending: string[] = [];
  private buffered = 0;
  private dataCb: (t: string) => void = () => {};
  private closeCb: (r: string) => void = () => {};
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    readonly kind: "grblHAL" | "grbl" = "grblHAL",
    readonly rx = kind === "grblHAL" ? 1024 : 128,
  ) {}

  /** Placas com Arduino reiniciam ao abrir a porta: só respondem depois da mensagem de boas-vindas. */
  private booted = false;
  async open() {
    this.booted = this.kind === "grblHAL";
    this.timer = setInterval(() => this.tick(), 2);
    if (!this.booted)
      setTimeout(() => {
        this.booted = true;
        this.emit("Grbl 1.1h ['$' for help]");
      }, 30);
  }
  async close() {
    if (this.timer) clearInterval(this.timer);
  }
  onData(cb: (t: string) => void) {
    this.dataCb = cb;
  }
  onClose(cb: (r: string) => void) {
    this.closeCb = cb;
  }
  drop() {
    this.closeCb("cable pulled");
  }

  async write(data: string | Uint8Array) {
    const text = typeof data === "string" ? data : String.fromCharCode(...data);
    if (text.length === 1 && "?!~\x18".includes(text)) return this.rtCmd(text);
    if (text.length === 1 && text.charCodeAt(0) > 0x7f) {
      this.realtime.push(text);
      // 0x87: relatório completo do grblHAL; aqui responde como o "?".
      if (text === "\x87" && this.kind === "grblHAL") this.rtCmd("?", false);
      return;
    }
    for (const l of text.split("\n")) {
      if (!l) continue;
      this.pending.push(l);
      this.buffered += l.length + 1;
      this.maxBuffered = Math.max(this.maxBuffered, this.buffered);
      if (this.buffered > this.rx) throw new Error(`buffer overflow: ${this.buffered} > ${this.rx}`);
    }
  }

  private rtCmd(c: string, record = true) {
    if (record) this.realtime.push(c);
    if (!this.booted) return;
    if (c === "?") {
      const p = this.mpos;
      const st = this.sub !== undefined ? `${this.state}:${this.sub}` : this.state;
      this.emit(`<${st}|MPos:${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}|FS:0,0|WCO:${this.wco.x.toFixed(3)},${this.wco.y.toFixed(3)},${this.wco.z.toFixed(3)}>`);
    } else if (c === "!") {
      if (this.state === "Run") {
        this.state = "Hold";
        this.sub = 0;
      }
    } else if (c === "~") {
      if (this.state === "Hold") {
        this.state = "Run";
        this.sub = undefined;
      }
    } else if (c === "\x18") {
      this.pending = [];
      this.buffered = 0;
      this.state = "Idle";
      this.sub = undefined;
      this.emit(this.kind === "grblHAL" ? "GrblHAL 1.1f ['$' or '$HELP' for help]" : "Grbl 1.1h ['$' for help]");
    }
  }

  private tick() {
    if (this.state === "Hold" || !this.pending.length) {
      if (!this.pending.length && this.state === "Run") this.state = "Idle";
      return;
    }
    const l = this.pending.shift()!;
    this.buffered -= l.length + 1;
    this.received.push(l);
    if (this.errors[l]) return this.emit(`error:${this.errors[l]}`);
    if (l === "$I") {
      // Como a SLB responde: [VER], [OPT] com o buffer e [FIRMWARE:grblHAL].
      if (this.kind === "grblHAL") this.emit("[VER:1.1f.20240514:SLB]", `[OPT:VNMSL,35,${this.rx},3,0]`, "[FIRMWARE:grblHAL]");
      else this.emit("[VER:1.1h.20190825:]", "[OPT:V,15,128]");
    } else if (l === "$$") this.emit("$110=4000.000", "$130=1260.000", "$22=1");
    else if (l === "$H") this.mpos = { x: 0, y: 0, z: 0 };
    else if (l.startsWith("G38.2")) {
      if (!this.probeOk) return this.emit("ALARM:4", "error:9");
      this.mpos = { ...this.mpos, z: this.mpos.z - 20 };
      this.emit(`[PRB:${this.mpos.x.toFixed(3)},${this.mpos.y.toFixed(3)},${this.mpos.z.toFixed(3)}:1]`);
    } else if (l.startsWith("G10 L20 P1")) {
      for (const m of l.matchAll(/([XYZ])(-?[\d.]+)/g)) {
        const k = m[1].toLowerCase() as "x" | "y" | "z";
        this.wco[k] = this.mpos[k] - Number(m[2]);
      }
    } else if (l.startsWith("$J=G91")) {
      for (const m of l.matchAll(/([XYZ])(-?[\d.]+)/g)) this.mpos[m[1].toLowerCase() as "x" | "y" | "z"] += Number(m[2]);
    } else if (/^G0?1?\s|^G1|^X|^Y|^Z/.test(l)) this.state = "Run";
    this.emit("ok");
  }

  private emit(...lines: string[]) {
    for (const l of lines) this.dataCb(l + "\r\n");
  }
}
