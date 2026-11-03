/**
 * "Send to gSender": loads the verified G-code into a running gSender (on this computer or on the
 * shop network) through the REST API of gSender's built-in server. Research and sources in
 * docs/send-to-gsender.md.
 *
 * What gSender's server does (src/server/app.js, api/api.file.js, CNCEngine.load):
 * - `GET /api/controllers` lists connected machines (port + workflow state).
 * - `POST /api/signin` returns a token when no users are set up. The token is optional today (the JWT
 *   middleware lets everything through), but we send it when we get one, in case that tightens.
 * - `POST /api/file` (multipart: gcode, port, visualizer) is the same path as gSender's own "Load
 *   File": it stores the file in CNCEngine, loads it into the controller (if there is a port) and tells
 *   every open window over Socket.IO ('file:load') to draw it in the visualizer.
 *   Loading a new file stops the running job (workflow.stop()), so we refuse while one runs.
 *
 * All HTTP goes through a `Transport` (fetch by default). The desktop app and `try-carvcam` serve the
 * page from http://127.0.0.1, which may reach gSender on this computer or the LAN (gSender allows any
 * origin). The hosted web app (https) can't reach another computer over http (mixed content).
 */

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

/** gSender's Remote Mode port (dialog default) and the headless server's port (server-cli.js). */
export const GSENDER_DEFAULT_PORT = 8000;
/** Same constant as gSender's UI (src/app/src/constants/index.ts). */
export const VISUALIZER_PRIMARY = "VISUALIZER_PRIMARY";

export type GsenderErrorCode =
  | "bad-address" // the typed address is invalid
  | "unreachable" // nothing answered (gSender closed, Remote Mode off, wrong IP/port)
  | "blocked" // the browser blocked it (CORS / private network / http from an https page)
  | "timeout"
  | "not-gsender" // something answered, but it isn't gSender
  | "busy" // a job is running or paused in gSender
  | "rejected"; // gSender refused the file

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

// ---------------------------------------------------------------- address

/** "192.168.1.50:8000", "http://pi.local:8000/", "localhost" → "http://host:port". */
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
  // host[:port] only: no path, query or user
  if (!/^[a-z0-9.-]+$|^\[[0-9a-f:.]+\]$/i.test(u.hostname) || (u.pathname !== "/" && u.pathname !== "") || u.search || u.hash || u.username) return null;
  const port = u.port || String(GSENDER_DEFAULT_PORT);
  return `${u.protocol}//${u.hostname}:${port}`;
}

/** Addresses to try: the saved one; with nothing saved, this computer on the default port. */
export function candidateAddresses(saved: string | undefined): string[] {
  const s = saved ? normalizeAddress(saved) : null;
  if (s) return [s];
  return [`http://127.0.0.1:${GSENDER_DEFAULT_PORT}`];
}

const isLoopback = (base: string) => /^https?:\/\/(127\.\d+\.\d+\.\d+|localhost|\[::1\])(:|\/|$)/i.test(base);

// ---------------------------------------------------------------- responses

export interface GsenderController {
  port: string;
  ready: boolean;
  workflow: string;
  activeState: string;
  type: string;
}

/** Body of `GET /api/controllers` (a list of `controller.status`). Throws if it isn't gSender. */
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

/** Busy machine: a job running or paused, or the firmware in Run/Hold/Door. */
export const isBusy = (c: GsenderController) => c.workflow !== "idle" || /^(run|hold|door)/i.test(c.activeState);

/** Port of the connected machine (a ready one first). No machine: "". */
export function pickPort(list: GsenderController[]): string {
  return (list.find((c) => c.ready) ?? list[0])?.port ?? "";
}

/** Token from `POST /api/signin` (returned even with no users; 401 when there is a password). */
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

/** File name as gSender shows it (ASCII, ends in .nc). */
export function jobFileName(name: string): string {
  const base = toAscii(name).trim().replace(/[^\w\-]+/g, "-").replace(/^-|-$/g, "");
  return `${base || "carvcam-job"}.nc`;
}

/**
 * gSender reads the file as latin1 (api.file.js: buffer.toString('latin1')) while fetch sends UTF-8,
 * so accented letters (only ever in comments) would turn into garbage. Strip them.
 */
export function toAscii(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x00-\x7f]/g, "?");
}

/** multipart/form-data body, the same as `uploadGcodeFileToServer` in gSender's UI. */
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

// ---------------------------------------------------------------- transport

export function defaultTransport(): Transport {
  return fetchTransport;
}

/** The page is the hosted web app (https): it can only reach gSender on this computer. */
const hostedPage = () => typeof location !== "undefined" && location.protocol === "https:";

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

// ---------------------------------------------------------------- flow

export interface SendOptions {
  gcode: string;
  name: string;
  /** Address the person saved (Remote Mode IP:port). Empty: try this computer. */
  address?: string;
  transport?: Transport;
  /** Hosted web app (https): another computer is unreachable and errors suggest the desktop app. */
  browser?: boolean;
  /** Page protocol (http: / https:), to warn about mixed content. */
  pageProtocol?: string;
}

export interface SendResult {
  address: string;
  /** Serial port / IP of the machine the file was loaded on; "" with no machine connected. */
  port: string;
  fileName: string;
}

const REMOTE_FIX = "In gSender, turn on Remote Mode and type the address it shows (like 192.168.1.50:8000) in CarvCAM's gSender address.";

/** Finds gSender, checks the machine is idle and loads the G-code. */
export async function sendToGsender(opts: SendOptions): Promise<SendResult> {
  const transport = opts.transport ?? defaultTransport();
  const browser = opts.browser ?? hostedPage();
  const pageProtocol = opts.pageProtocol ?? (typeof location !== "undefined" ? location.protocol : undefined);
  if (opts.address?.trim() && !normalizeAddress(opts.address)) throw new GsenderError("bad-address", `"${opts.address}" isn't an address.`, "Type it like 192.168.1.50:8000.");
  const candidates = candidateAddresses(opts.address);

  // 1. Find gSender
  let base = "";
  let controllers: GsenderController[] = [];
  let lastErr: GsenderError | undefined;
  for (const c of candidates) {
    if (browser && pageProtocol === "https:" && !isLoopback(c)) {
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

  // 2. Never replace the file of a running job (gSender would stop it).
  if (controllers.some(isBusy)) throw new GsenderError("busy", "A job is running in gSender.", "Let it finish or stop it in gSender, then send again.");
  const port = pickPort(controllers);

  // 3. Token (optional today; see app.js "Secure API Access"). Skipped on the hosted page: JSON and
  //    Authorization force a CORS preflight, while GET and multipart with no extra headers don't.
  const headers: Record<string, string> = {};
  if (!browser) {
    try {
      const r = await transport(`${base}/api/signin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", timeoutMs: 3000 });
      const token = parseSignin(r);
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch {
      // no token: gSender's API accepts the file anyway
    }
  }

  // 4. Send
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
