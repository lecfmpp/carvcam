// Markdown for agents: a request with `Accept: text/markdown` gets the page's Markdown version
// (the build writes one next to every page as index.md). Browsers keep getting HTML.
import type { Context } from "https://edge.netlify.com";

export default async (req: Request, context: Context) => {
  const accept = req.headers.get("accept") ?? "";
  const wantsMd = /text\/markdown/i.test(accept) && !/text\/html/i.test(accept.split(",")[0] ?? "");
  if (!wantsMd || (req.method !== "GET" && req.method !== "HEAD")) {
    const res = await context.next();
    res.headers.append("Vary", "Accept");
    return res;
  }
  const url = new URL(req.url);
  const path = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  const md = await fetch(new URL(`${path}index.md`, url));
  if (!md.ok) return context.next();
  const body = await md.text();
  return new Response(req.method === "HEAD" ? null : body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Vary": "Accept",
      "Cache-Control": "public, max-age=3600",
      // Rough token count (about 4 characters per token).
      "x-markdown-tokens": String(Math.ceil(body.length / 4)),
      "Link": `<${url.origin}${path}>; rel="canonical"`,
    },
  });
};

// Only page URLs (no file extension); assets, .md, .txt, .xml and .well-known files are served as they are.
export const config = { path: "/*", excludedPath: ["/assets/*", "/.well-known/*", "/mcp", "/mcp/", "/api", "/api/*", "/*.md", "/*.txt", "/*.xml", "/*.json", "/download/*"] };
