import { cleanLine, parseLine, type GrblMsg, type StatusReport, type V3 } from "./parse";
import type { Transport } from "./transport";

/**
 * Fala com uma placa grbl/grblHAL: conecta, consulta o estado, move, zera, mede com a placa de
 * toque e envia o trabalho pelo método de contagem de caracteres (o mesmo do gSender e do
 * grbl-streaming oficial): mantém o buffer serial da placa cheio sem nunca passar do tamanho dele.
 *
 * Comandos de tempo real (?, !, ~, Ctrl-X, jog cancel, overrides) vão como bytes soltos, sem fila.
 */
export interface ControllerEvents {
  status(s: StatusReport): void;
  alarm(code: number): void;
  /** Erro de uma linha (com o texto enviado). Durante um trabalho, a fila para em seguida. */
  error(code: number, line: string, inJob: boolean): void;
  message(text: string): void;
  log(dir: "in" | "out", text: string): void;
  /** Linha do trabalho confirmada pela placa (número da linha no G-code original). */
  jobLine(line: number): void;
  jobDone(): void;
  /** Chegou num M6: a fila espera a troca de ferramenta. */
  toolChange(tool: number): void;
  closed(reason: string): void;
}

interface Item {
  text: string;
  bytes: number;
  /** Linha no G-code do trabalho (só para itens do trabalho). */
  jobLine?: number;
  /** Troca de ferramenta: segura a fila até confirmar. */
  tool?: number;
  resolve?(lines: string[]): void;
  reject?(e: Error): void;
  /** Respostas entre o envio e o ok ([VER], [PRB], $n=…). */
  replies: string[];
}

export const RT = {
  status: "?",
  hold: "!",
  resume: "~",
  reset: "\x18",
  jogCancel: "\x85",
  feed100: "\x90",
  feedUp10: "\x91",
  feedDown10: "\x92",
  feedUp1: "\x93",
  feedDown1: "\x94",
  rpm100: "\x99",
  rpmUp10: "\x9a",
  rpmDown10: "\x9b",
  rpmUp1: "\x9c",
  rpmDown1: "\x9d",
  /** grblHAL: relatório de estado completo (subestado do alarme incluso), como o gSender usa em alarme. */
  fullStatus: "\x87",
} as const;

export class GrblController {
  firmware: "grbl" | "grblHAL" | null = null;
  version = "";
  /** Tamanho do buffer serial da placa (grbl: 128; grblHAL informa no [OPT]). */
  rxSize = 128;
  settings: Record<string, string> = {};
  last: StatusReport | null = null;
  wco: V3 = { x: 0, y: 0, z: 0 };
  private buf = "";
  private queue: Item[] = [];
  private inflight: Item[] = [];
  private inflightBytes = 0;
  /** Fila do trabalho segurada (troca de ferramenta ou erro). */
  private held = false;
  private jobActive = false;
  private poll: ReturnType<typeof setInterval> | null = null;
  private waiters: ((m: GrblMsg) => void)[] = [];
  private open = false;

  constructor(
    private t: Transport,
    private ev: Partial<ControllerEvents> = {},
    private opts: { pollMs?: number; timeoutMs?: number } = {},
  ) {}

  get connected() {
    return this.open;
  }
  get busy() {
    return this.jobActive;
  }

  /** Abre, espera a placa responder e lê versão e configurações. */
  async connect() {
    this.t.onData((d) => this.onData(d));
    this.t.onClose((r) => this.onClosed(r));
    await this.t.open();
    this.open = true;
    // Placas com Arduino (LongBoard) reiniciam ao abrir a porta e levam ~1,5 s para responder.
    const alive = await this.waitFor((m) => m.type === "welcome" || m.type === "status", this.opts.timeoutMs ?? 4000, () => this.rt(RT.status));
    if (!alive) {
      await this.close();
      throw new Error("The controller didn't answer. Check it is on and the E-stop is released.");
    }
    // Como o gSender: o firmware sai do texto do $I ("[FIRMWARE:grblHAL]" ou o [VER:] do grbl).
    // A SLB não reinicia ao conectar, então nem sempre há mensagem de boas-vindas.
    let info: string[] = [];
    for (let i = 0; i < 3 && !info.length; i++) info = await this.send("$I").catch(() => [] as string[]);
    for (const l of info) {
      const m = parseLine(l);
      if (m.type === "ver") this.version = m.version;
      if (m.type === "opt" && m.rx) this.rxSize = Math.max(64, Math.min(m.rx - 8, 1016));
    }
    const said = info.join("\n");
    if (/grblhal/i.test(said)) this.firmware = "grblHAL";
    else if (!this.firmware && /grbl|fluidnc/i.test(said)) this.firmware = "grbl";
    // Último recurso: só o grblHAL informa buffer maior que 128 no [OPT].
    if (!this.firmware) this.firmware = this.rxSize > 128 ? "grblHAL" : "grbl";
    const set = await this.send("$$").catch(() => [] as string[]);
    for (const l of set) {
      const m = parseLine(l);
      if (m.type === "setting") this.settings[m.key] = m.value;
    }
    this.poll = setInterval(() => void this.rt(this.firmware === "grblHAL" && this.last?.state === "Alarm" ? RT.fullStatus : RT.status), this.opts.pollMs ?? 200);
  }

  async close() {
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
    this.failAll("Disconnected");
    this.open = false;
    await this.t.close();
  }

  /* ---------------- envio ---------------- */

  /** Envia uma linha pela fila e espera o "ok". Rejeita com o erro da placa. */
  send(line: string): Promise<string[]> {
    const text = cleanLine(line);
    if (!text) return Promise.resolve([]);
    return new Promise((resolve, reject) => {
      this.queue.push({ text, bytes: text.length + 1, resolve, reject: (e) => reject(e), replies: [] });
      this.pump();
    });
  }

  /** Byte de tempo real (não espera resposta). */
  async rt(code: string) {
    if (!this.open) return;
    if (code !== RT.status) this.ev.log?.("out", rtName(code));
    await this.t.write(code.length === 1 && code.charCodeAt(0) > 0x7f ? new Uint8Array([code.charCodeAt(0)]) : code);
  }

  /** Coloca o trabalho na fila. As linhas M6 seguram a fila até confirmToolChange(). */
  runJob(gcode: string) {
    const lines = gcode.split(/\r?\n/);
    this.jobActive = true;
    this.held = false;
    lines.forEach((raw, i) => {
      const text = cleanLine(raw);
      if (!text) return;
      const m6 = /(^|\s)M0?6(\s|$)/i.test(text);
      if (m6) {
        const tool = Number(/T(\d+)/i.exec(text)?.[1] ?? 0);
        // O grbl não aceita M6: a troca é feita pelo CarvCAM. A linha só avisa.
        this.queue.push({ text: "", bytes: 0, jobLine: i + 1, tool, replies: [] });
        const rest = text.replace(/(^|\s)M0?6(\s|$)/i, " ").replace(/T\d+/i, "").trim();
        if (rest) this.queue.push({ text: rest, bytes: rest.length + 1, jobLine: i + 1, replies: [] });
      } else this.queue.push({ text, bytes: text.length + 1, jobLine: i + 1, replies: [] });
    });
    this.pump();
  }

  /** Continua depois da troca de ferramenta. */
  confirmToolChange() {
    this.held = false;
    this.pump();
  }

  pause() {
    return this.rt(RT.hold);
  }
  resume() {
    this.held = false;
    void this.rt(RT.resume);
    this.pump();
  }

  /** Para tudo: segura o movimento, espera parar e reinicia a placa (mantém a posição). */
  async stop() {
    this.jobActive = false;
    this.queue = this.queue.filter((q) => q.jobLine === undefined);
    await this.rt(RT.hold);
    await this.waitFor((m) => m.type === "status" && (m.status.state === "Hold" ? m.status.sub === 0 : m.status.state !== "Run"), 1500, () => this.rt(RT.status));
    await this.rt(RT.reset);
    this.failAll("Stopped");
  }

  /* ---------------- comandos prontos ---------------- */

  home() {
    return this.send("$H");
  }
  unlock() {
    return this.send("$X");
  }
  jog(dx: number, dy: number, dz: number, feed: number) {
    const ax = [dx && `X${fmt(dx)}`, dy && `Y${fmt(dy)}`, dz && `Z${fmt(dz)}`].filter(Boolean).join(" ");
    if (!ax) return Promise.resolve([]);
    return this.send(`$J=G91 G21 ${ax} F${Math.round(feed)}`);
  }
  /** Vai até uma posição em coordenadas de máquina (só X/Y). */
  jogTo(x: number, y: number, feed: number) {
    return this.send(`$J=G53 G21 X${fmt(x)} Y${fmt(y)} F${Math.round(feed)}`);
  }
  jogCancel() {
    return this.rt(RT.jogCancel);
  }
  setZero(axes: ("x" | "y" | "z")[]) {
    return this.send(`G10 L20 P1 ${axes.map((a) => `${a.toUpperCase()}0`).join(" ")}`);
  }
  /** Desce até tocar a placa, zera Z na espessura da placa e sobe 5 mm. */
  async probeZ(plate: number, maxTravel = 50, feed = 150) {
    await this.send("G21 G91");
    try {
      const r = await this.send(`G38.2 Z-${fmt(maxTravel)} F${feed}`);
      const prb = r.map(parseLine).find((m) => m.type === "prb");
      if (prb && prb.type === "prb" && !prb.ok) throw new Error("The touch plate didn't make contact");
      await this.send(`G10 L20 P1 Z${fmt(plate)}`);
      await this.send("G0 Z5");
    } finally {
      await this.send("G90").catch(() => {});
    }
  }
  async spinTest(rpm: number, ms: number) {
    await this.send(`M3 S${Math.round(rpm)}`);
    await new Promise((r) => setTimeout(r, ms));
    await this.send("M5");
  }
  /** Leva os overrides ao valor pedido a partir de 100%. */
  async setFeedOverride(pct: number) {
    await this.stepOverride(pct, RT.feed100, RT.feedUp10, RT.feedDown10, RT.feedUp1, RT.feedDown1);
  }
  async setRpmOverride(pct: number) {
    await this.stepOverride(pct, RT.rpm100, RT.rpmUp10, RT.rpmDown10, RT.rpmUp1, RT.rpmDown1);
  }
  private async stepOverride(pct: number, reset: string, up10: string, dn10: string, up1: string, dn1: string) {
    await this.rt(reset);
    let d = Math.round(pct) - 100;
    while (Math.abs(d) >= 10) {
      await this.rt(d > 0 ? up10 : dn10);
      d -= d > 0 ? 10 : -10;
    }
    while (d !== 0) {
      await this.rt(d > 0 ? up1 : dn1);
      d -= d > 0 ? 1 : -1;
    }
  }

  /* ---------------- recepção ---------------- */

  private pump() {
    if (!this.open) return;
    while (this.queue.length) {
      const next = this.queue[0];
      const isJob = next.jobLine !== undefined;
      if (isJob && this.held) return;
      if (next.tool !== undefined) {
        // Só para a troca quando tudo antes dela foi executado.
        if (this.inflight.length) return;
        this.queue.shift();
        this.held = true;
        this.ev.jobLine?.(next.jobLine!);
        this.ev.toolChange?.(next.tool);
        return;
      }
      if (this.inflightBytes + next.bytes > this.rxSize && this.inflight.length) return;
      this.queue.shift();
      this.inflight.push(next);
      this.inflightBytes += next.bytes;
      this.ev.log?.("out", next.text);
      void this.t.write(next.text + "\n");
    }
    if (this.jobActive && !this.inflight.some((i) => i.jobLine !== undefined) && !this.queue.some((i) => i.jobLine !== undefined)) {
      this.jobActive = false;
      this.ev.jobDone?.();
    }
  }

  private onData(chunk: string) {
    this.buf += chunk;
    let i: number;
    while ((i = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, i).replace(/\r$/, "");
      this.buf = this.buf.slice(i + 1);
      if (line.trim()) this.handle(line.trim());
    }
  }

  private handle(line: string) {
    const m = parseLine(line);
    if (m.type !== "status") this.ev.log?.("in", line);
    for (const w of this.waiters.slice()) w(m);
    switch (m.type) {
      case "ok":
      case "error": {
        const it = this.inflight.shift();
        if (!it) break;
        this.inflightBytes -= it.bytes;
        if (m.type === "ok") {
          it.resolve?.(it.replies);
          if (it.jobLine !== undefined) this.ev.jobLine?.(it.jobLine);
        } else {
          it.reject?.(new GrblError(m.code, it.text));
          this.ev.error?.(m.code, it.text, it.jobLine !== undefined);
          if (it.jobLine !== undefined) {
            // Erro no meio do trabalho: segura a fila e o movimento, como o gSender faz.
            this.held = true;
            void this.rt(RT.hold);
          }
        }
        this.pump();
        break;
      }
      case "status":
        if (m.status.wco) this.wco = m.status.wco;
        if (!m.status.mpos && m.status.wpos) m.status.mpos = { x: m.status.wpos.x + this.wco.x, y: m.status.wpos.y + this.wco.y, z: m.status.wpos.z + this.wco.z };
        this.last = m.status;
        this.ev.status?.(m.status);
        break;
      case "alarm":
        this.ev.alarm?.(m.code);
        break;
      case "welcome":
        this.firmware = m.firmware;
        // Depois de um reset a placa esquece o que estava no buffer.
        if (this.inflight.length) this.failAll("The controller restarted");
        break;
      case "msg":
        this.ev.message?.(m.text);
        break;
      default:
        this.inflight[0]?.replies.push(line);
    }
  }

  private onClosed(reason: string) {
    if (!this.open) return;
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
    this.open = false;
    this.failAll(reason);
    this.ev.closed?.(reason);
  }

  private failAll(reason: string) {
    const all = [...this.inflight, ...this.queue];
    this.inflight = [];
    this.queue = [];
    this.inflightBytes = 0;
    this.held = false;
    this.jobActive = false;
    for (const it of all) it.reject?.(new Error(reason));
  }

  /** Espera uma mensagem que satisfaça a condição; repete `kick` a cada 300 ms. */
  private waitFor(pred: (m: GrblMsg) => boolean, ms: number, kick?: () => unknown): Promise<boolean> {
    return new Promise((resolve) => {
      const done = (ok: boolean) => {
        clearTimeout(timer);
        if (k) clearInterval(k);
        this.waiters = this.waiters.filter((w) => w !== fn);
        resolve(ok);
      };
      const fn = (m: GrblMsg) => pred(m) && done(true);
      this.waiters.push(fn);
      const timer = setTimeout(() => done(false), ms);
      const k = kick ? setInterval(() => void kick(), 300) : null;
      void kick?.();
    });
  }
}

export class GrblError extends Error {
  constructor(
    readonly code: number,
    readonly line: string,
  ) {
    super(`error:${code} on "${line}"`);
  }
}

const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

function rtName(c: string) {
  const names: Record<string, string> = { "!": "! (feed hold)", "~": "~ (resume)", "\x18": "Ctrl-X (reset)", "\x85": "jog cancel", "\x90": "feed 100%", "\x99": "spindle 100%" };
  return names[c] ?? `0x${c.charCodeAt(0).toString(16)}`;
}
