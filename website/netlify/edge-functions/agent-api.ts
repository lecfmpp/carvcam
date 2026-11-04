// Public, read-only REST API for carvcam.com (no auth, nothing stored). The MCP server lives in
// netlify/functions/mcp.mts (it runs the CAM engine).
//   GET  /api/search?q=  pages matching a query (from llms.txt)
//   GET  /api/page?path= a page as Markdown
//   GET  /api/downloads  installer links
//   GET  /api/health     status
//   GET  /api/openapi.json
// All data comes from the static site itself (llms.txt and the index.md next to every page).
import type { Context } from "https://edge.netlify.com";

const VERSION = "1.0.0";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, accept, mcp-protocol-version, mcp-session-id",
};
const DOWNLOADS: Record<string, string> = {
  windows: "/download/windows",
  "mac-apple-silicon": "/download/mac-apple-silicon",
  "mac-intel": "/download/mac-intel",
  "linux-appimage": "/download/linux-appimage",
  "linux-deb": "/download/linux-deb",
  "raspberry-pi-64bit": "/download/raspberry-pi-deb",
  "raspberry-pi-32bit": "/download/raspberry-pi-32bit-deb",
};

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", ...extra } });

type Page = { title: string; url: string; description: string };
async function pages(origin: string): Promise<Page[]> {
  const t = await (await fetch(`${origin}/llms.txt`)).text();
  return [...t.matchAll(/^- \[([^\]]+)\]\(([^)]+)\): (.*)$/gm)].map((m) => ({ title: m[1], url: m[2].replace(/index\.md$/, ""), description: m[3] }));
}
async function search(origin: string, q: string, limit = 8) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return (await pages(origin))
    .map((p) => ({ p, score: words.filter((w) => `${p.title} ${p.description}`.toLowerCase().includes(w)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.p);
}
async function page(origin: string, path: string): Promise<string | null> {
  let p = "/" + String(path || "/").replace(/^https?:\/\/[^/]+/, "").replace(/^\/+/, "").replace(/index\.(html|md)$/, "");
  if (!p.endsWith("/")) p += "/";
  if (p.includes("..")) return null;
  const r = await fetch(`${origin}${p}index.md`);
  return r.ok && (r.headers.get("content-type") ?? "").includes("markdown") ? await r.text() : null;
}
const downloads = (origin: string) => Object.fromEntries(Object.entries(DOWNLOADS).map(([k, v]) => [k, origin + v]));

// ---------------------------------------------------------------- REST
function openapi(origin: string) {
  const get = (summary: string, params: unknown[] = []) => ({ get: { summary, parameters: params, responses: { "200": { description: "OK" } } } });
  const q = (name: string, description: string) => ({ name, in: "query", required: true, description, schema: { type: "string" } });
  return {
    openapi: "3.1.0",
    info: { title: "CarvCAM public API", version: VERSION, description: "Read-only access to the CarvCAM website and docs. No authentication." },
    servers: [{ url: `${origin}/api` }],
    paths: {
      "/search": get("Search pages and docs", [q("q", "Search words")]),
      "/page": get("A page as Markdown", [q("path", "Path on carvcam.com, e.g. /docs/connect/")]),
      "/downloads": get("Installer links for every platform"),
      "/health": get("Service status"),
    },
  };
}

async function api(req: Request, url: URL) {
  const origin = url.origin;
  const route = url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
  if (req.method !== "GET") return json({ error: "Use GET" }, 405, { Allow: "GET, OPTIONS" });
  if (route === "health") return json({ status: "ok", version: VERSION, time: new Date().toISOString() });
  if (route === "openapi.json") return json(openapi(origin));
  if (route === "downloads") return json(downloads(origin));
  if (route === "search") return json({ results: await search(origin, url.searchParams.get("q") ?? "", 20) });
  if (route === "page") {
    const md = await page(origin, url.searchParams.get("path") ?? "/");
    return md ? new Response(md, { headers: { ...CORS, "Content-Type": "text/markdown; charset=utf-8" } }) : json({ error: "Not found" }, 404);
  }
  if (route === "") return json({ openapi: `${origin}/api/openapi.json`, docs: `${origin}/docs/`, health: `${origin}/api/health`, mcp: `${origin}/mcp` });
  return json({ error: "Not found" }, 404);
}

export default async (req: Request, _context: Context) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  try {
    return await api(req, url);
  } catch (err) {
    console.error("[agent-api]", err);
    return json({ error: "Something went wrong" }, 500);
  }
};

export const config = { path: ["/api", "/api/*"] };
