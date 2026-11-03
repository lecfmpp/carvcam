/**
 * Bridge to the CarvCAM desktop app (Electron, see ../../../desktop). The preload script exposes
 * `window.carvcamDesktop`; in a plain browser (vite preview, panel mode in gSender) it is undefined
 * and callers fall back to browser APIs.
 */
export interface DesktopResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface CarvcamDesktop {
  platform: "darwin" | "win32" | "linux";
  /** Desktop app version (package.json of desktop/). */
  version: string;
  /**
   * HTTP request made by the main process, so it is not subject to CORS. Only loopback and
   * private-network hosts are allowed (gSender on this computer or on the shop network).
   */
  request(url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number }): Promise<DesktopResponse>;
  /** Opens a URL in the system browser. */
  openExternal(url: string): Promise<void>;
}

declare global {
  interface Window {
    carvcamDesktop?: CarvcamDesktop;
  }
}

export const desktop = (): CarvcamDesktop | undefined => (typeof window === "undefined" ? undefined : window.carvcamDesktop);
export const isDesktop = () => !!desktop();
