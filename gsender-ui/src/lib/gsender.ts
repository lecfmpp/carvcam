/**
 * "Send to gSender": carrega o G-code verificado num gSender aberto (neste computador ou na rede da
 * oficina) pela API REST do servidor embutido do gSender. Pesquisa e fontes em
 * docs/gsender-reverse-engineering/07-enviar-para-gsender.md.
 *
 * Resumo do que o servidor do gSender faz (src/server/app.js, api/api.file.js, CNCEngine.load):
 * - `GET /api/controllers` lista as máquinas conectadas (porta + estado do workflow).
 * - `POST /api/signin` devolve um token quando não há usuários; o token é opcional (o middleware de
 *   JWT deixa tudo passar hoje), mas mandamos quando vem, para continuar funcionando se apertarem.
 * - `POST /api/file` (multipart: gcode, port, visualizer) é o mesmo caminho do "Load File" da UI do
 *   gSender: guarda o arquivo no CNCEngine, carrega no controlador (se houver porta) e avisa todas as
 *   janelas abertas por Socket.IO ('file:load'), que desenham o arquivo no visualizador.
 *   Atenção: carregar um arquivo novo para o job em andamento (workflow.stop()); por isso recusamos antes.
 *
 * Todo HTTP passa por um `Transport`: no app desktop é o processo principal do Electron (sem CORS);
 * no navegador é `fetch`, que pode ser bloqueado (Private Network Access / conteúdo misto).
 */
import { desktop } from "../desktop/bridge";

export interface TransportResponse {
  status: number;
  body: string;
}
export interface TransportInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}
export type Transport = (url: string, init?: TransportInit) => Promise<TransportResponse>;

/** Porta do Remote Mode do gSender (padrão do diálogo) e do servidor sem Electron (server-cli.js). */
export const GSENDER_DEFAULT_PORT = 8000;
/** Mesma constante da UI do gSender (src/app/src/constants/index.ts). */
export const VISUALIZER_PRIMARY = "VISUALIZER_PRIMARY";

export type GsenderErrorCode =
  | "bad-address" // endereço digitado inválido
  | "unreachable" // nada respondeu (gSender fechado, Remote Mode desligado, IP/porta errados)
  | "blocked" // navegador bloqueou (CORS / rede privada / http em página https)
  | "timeout"
  | "not-gsender" // respondeu, mas não parece o gSender
  | "busy" // job rodando ou pausado no gSender
  | "rejected"; // gSender recusou o arquivo

export class GsenderError extends Error {
  constructor(
    public code: GsenderErrorCode,
    message: string,
    public fix?: string,
  ) {
    super(message);
    this.name = "GsenderError";
  }
}

// ---------------------------------------------------------------- endereço

/** "192.168.1.50:8000", "http://pi.local:8000/", "localhost" → "http://host:porta". */
export function normalizeAddress(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  // só host[:porta]: nada de caminho, consulta ou usuário
  if (!/^[a-z0-9.-]+$|^\[[0-9a-f:.]+\]$/i.test(u.hostname) || (u.pathname !== "/" && u.pathname !== "") || u.search || u.hash || u.username) return null;
  const port = u.port || String(GSENDER_DEFAULT_PORT);
  return `${u.protocol}//${u.hostname}:${port}`;
}

/** Endereços tentados, na ordem: o salvo; sem nada salvo, este computador na porta padrão. */
export function candidateAddresses(saved: string | undefined): string[] {
  const s = saved ? normalizeAddress(saved) : null;
  if (s) return [s];
  return [`http://127.0.0.1:${GSENDER_DEFAULT_PORT}`];
}

const isLoopback = (base: string) => /^https?:\/\/(127\.\d+\.\d+\.\d+|localhost|\[::1\])(:|\/|$)/i.test(base);

// ---------------------------------------------------------------- respostas

export interface GsenderController {
  port: string;
  ready: boolean;
  workflow: string;
  activeState: string;
  type: string;
}

/** Corpo de `GET /api/controllers` (lista de `controller.status`). Lança se não for o gSender. */
export function parseControllers(body: string): GsenderController[] {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    throw new GsenderError("not-gsender", "That address answered, but it isn't gSender.", "Check the address in gSender's Remote Mode.");
  }
  if (!Array.isArray(data)) throw new GsenderError("not-gsender", "That address answered, but it isn't gSender.", "Check the address in gSender's Remote Mode.");
  return data
    .filter((c): c is Record<string, any> => !!c && typeof c === "object")
    .map((c) => ({
      port: typeof c.port === "string" ? c.port : "",
      ready: !!c.ready,
      workflow: String(c.workflow?.state ?? "idle"),
      activeState: String(c.controller?.state?.status?.activeState ?? ""),
      type: String(c.controller?.type ?? ""),
    }))
    .filter((c) => c.port);
}

/** Máquina ocupada: job rodando/pausado, ou o firmware em Run/Hold/Door. */
export const isBusy = (c: GsenderController) => c.workflow !== "idle" || /^(run|hold|door)/i.test(c.activeState);

/** Escolhe a porta da máquina conectada (a pronta primeiro). Sem máquina: "". */
export function pickPort(list: GsenderController[]): string {
  return (list.find((c) => c.ready) ?? list[0])?.port ?? "";
}

/** Token de `POST /api/signin` (vem mesmo sem usuários cadastrados; 401 quando há senha). */
export function parseSignin(res: TransportResponse): string | undefined {
  if (res.status !== 200) return undefined;
  try {
    const t = JSON.parse(res.body)?.token;
    return typeof t === "string" && t ? t : undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------- upload

/** Nome do arquivo como aparece no gSender (ASCII, termina em .nc). */
export function jobFileName(name: string): string {
  const base = toAscii(name).trim().replace(/[^\w\-]+/g, "-").replace(/^-|-$/g, "");
  return `${base || "carvcam-job"}.nc`;
}

/**
 * O gSender lê o arquivo como latin1 (api.file.js: buffer.toString('latin1')) e o corpo sai do
 * Electron como UTF-8, então acentos (só aparecem nos comentários) virariam lixo. Tira os acentos.
 */
export function toAscii(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x00-\x7f]/g, "?");
}

/** Corpo multipart/form-data igual ao do `uploadGcodeFileToServer` da UI do gSender. */
export function buildUpload(gcode: string, fileName: string, port: string, boundary = `----CarvCAM${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`) {
  const crlf = "\r\n";
  const field = (name: string, value: string) => `--${boundary}${crlf}Content-Disposition: form-data; name="${name}"${crlf}${crlf}${value}${crlf}`;
  const body =
    `--${boundary}${crlf}Content-Disposition: form-data; name="gcode"; filename="${fileName}"${crlf}Content-Type: application/octet-stream${crlf}${crlf}` +
    toAscii(gcode) +
    crlf +
    field("port", port) +
    field("visualizer", VISUALIZER_PRIMARY) +
    `--${boundary}--${crlf}`;
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

// ---------------------------------------------------------------- transporte

/** Desktop (Electron, sem CORS) quando existir; senão fetch do navegador. */
export function defaultTransport(): Transport {
  const d = desktop();
  if (d) return (url, init) => d.request(url, init).then((r) => ({ status: r.status, body: r.body }));
  return fetchTransport;
}

class TimeoutError extends Error {}

export const fetchTransport: Transport = async (url, init = {}) => {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), init.timeoutMs ?? 10000);
  try {
    const r = await fetch(url, { method: init.method ?? "GET", headers: init.headers, body: init.body, signal: ctl.signal, cache: "no-store" });
    return { status: r.status, body: await r.text() };
  } catch (e) {
    if (ctl.signal.aborted) throw new TimeoutError("timeout");
    throw e;
  } finally {
    clearTimeout(timer);
  }
};

const isTimeout = (e: unknown) => e instanceof TimeoutError || /timed? ?out|ETIMEDOUT|aborted/i.test(String((e as Error)?.message ?? e));

// ---------------------------------------------------------------- fluxo

export interface SendOptions {
  gcode: string;
  name: string;
  /** Endereço salvo pela pessoa (IP:porta do Remote Mode). Vazio: tenta este computador. */
  address?: string;
  transport?: Transport;
  /** No navegador, sem o app desktop: muda as mensagens de erro (CORS etc.). */
  browser?: boolean;
  /** Protocolo da página (http: / https:), para avisar de conteúdo misto. */
  pageProtocol?: string;
}

export interface SendResult {
  address: string;
  /** Porta serial/IP da máquina em que o arquivo foi carregado; "" sem máquina conectada. */
  port: string;
  fileName: string;
}

const REMOTE_FIX = "In gSender, turn on Remote Mode and type the address it shows (like 192.168.1.50:8000) in CarvCAM's gSender address.";

/** Procura o gSender, confere que a máquina está parada e carrega o G-code. */
export async function sendToGsender(opts: SendOptions): Promise<SendResult> {
  const transport = opts.transport ?? defaultTransport();
  const browser = opts.browser ?? !desktop();
  if (opts.address?.trim() && !normalizeAddress(opts.address)) throw new GsenderError("bad-address", `"${opts.address}" isn't an address.`, "Type it like 192.168.1.50:8000.");
  const candidates = candidateAddresses(opts.address);

  // 1. Achar o gSender
  let base = "";
  let controllers: GsenderController[] = [];
  let lastErr: GsenderError | undefined;
  for (const c of candidates) {
    if (browser && opts.pageProtocol === "https:" && !isLoopback(c)) {
      lastErr = new GsenderError("blocked", "Your browser blocks this page from talking to gSender on another computer.", "Use the CarvCAM desktop app, or Download the G-code.");
      continue;
    }
    try {
      const r = await transport(`${c}/api/controllers?_=${Date.now()}`, { method: "GET", timeoutMs: 3000 });
      if (r.status !== 200) throw new GsenderError("not-gsender", `That address answered with an error (${r.status}), not gSender.`, REMOTE_FIX);
      controllers = parseControllers(r.body);
      base = c;
      break;
    } catch (e) {
      lastErr = e instanceof GsenderError ? e : reachError(c, e, browser, !!opts.address?.trim());
    }
  }
  if (!base) throw lastErr ?? new GsenderError("unreachable", "Couldn't find gSender.", REMOTE_FIX);

  // 2. Nunca trocar o arquivo de um job em andamento (o gSender pararia o job).
  if (controllers.some(isBusy)) throw new GsenderError("busy", "A job is running in gSender.", "Let it finish or stop it in gSender, then send again.");
  const port = pickPort(controllers);

  // 3. Token (opcional hoje; ver app.js "Secure API Access"). No navegador fica sem: JSON e
  //    Authorization forçam preflight de CORS, e GET + multipart sem cabeçalhos extras não.
  const headers: Record<string, string> = {};
  if (!browser) {
    try {
      const r = await transport(`${base}/api/signin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", timeoutMs: 3000 });
      const token = parseSignin(r);
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch {
      // sem token: a API do gSender aceita mesmo assim
    }
  }

  // 4. Enviar
  const fileName = jobFileName(opts.name);
  const { body, contentType } = buildUpload(opts.gcode, fileName, port);
  let r: TransportResponse;
  try {
    r = await transport(`${base}/api/file`, { method: "POST", headers: { ...headers, "Content-Type": contentType }, body, timeoutMs: 20000 });
  } catch (e) {
    if (isTimeout(e)) throw new GsenderError("timeout", "gSender took too long to answer.", "Check gSender, then try again.");
    throw reachError(base, e, browser, true);
  }
  if (r.status !== 200) throw new GsenderError("rejected", `gSender didn't accept the file (${r.status}${errMsg(r.body)}).`, "Try again, or Download the G-code and open it in gSender.");
  return { address: base, port, fileName };
}

function errMsg(body: string) {
  try {
    const m = JSON.parse(body)?.msg;
    return m ? `: ${m}` : "";
  } catch {
    return "";
  }
}

function reachError(base: string, e: unknown, browser: boolean, saved: boolean): GsenderError {
  const where = base.replace(/^https?:\/\//, "");
  if (isTimeout(e)) return new GsenderError("timeout", `No answer from gSender at ${where}.`, saved ? "Check that gSender is open and Remote Mode is on, and that both computers are on the same network." : REMOTE_FIX);
  if (browser)
    return new GsenderError(
      "blocked",
      `Couldn't reach gSender at ${where}.`,
      "If gSender is open with Remote Mode on, your browser may be blocking the connection: use the CarvCAM desktop app, or Download the G-code.",
    );
  return new GsenderError("unreachable", `gSender isn't answering at ${where}.`, saved ? "Check that gSender is open and Remote Mode is on, and that the address matches the one gSender shows." : REMOTE_FIX);
}
