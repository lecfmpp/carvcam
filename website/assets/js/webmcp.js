// WebMCP: exposes a few read-only site tools to AI agents running in the browser
// (https://webmachinelearning.github.io/webmcp/). Does nothing in browsers without the API.
(() => {
  const mc = document.modelContext || navigator.modelContext;
  if (!mc || typeof mc.registerTool !== "function") return;

  const text = (t) => ({ content: [{ type: "text", text: t }] });
  const page = async (path) => {
    const clean = ("/" + String(path || "/").replace(/^https?:\/\/[^/]+/, "").replace(/^\/+/, "")).replace(/index\.(html|md)$/, "");
    const url = (clean.endsWith("/") ? clean : clean + "/") + "index.md";
    const r = await fetch(url);
    if (!r.ok) throw new Error(`No page at ${clean}`);
    return r.text();
  };
  let index = null;
  const pages = async () => {
    index ??= fetch("/llms.txt")
      .then((r) => r.text())
      .then((t) => [...t.matchAll(/^- \[([^\]]+)\]\(([^)]+)\): (.*)$/gm)].map((m) => ({ title: m[1], url: m[2].replace(/index\.md$/, ""), description: m[3] })));
    return index;
  };
  const DOWNLOADS = {
    windows: "/download/windows",
    "mac-apple-silicon": "/download/mac-apple-silicon",
    "mac-intel": "/download/mac-intel",
    "linux-appimage": "/download/linux-appimage",
    "linux-deb": "/download/linux-deb",
    "raspberry-pi-64bit": "/download/raspberry-pi-deb",
    "raspberry-pi-32bit": "/download/raspberry-pi-32bit-deb",
  };

  const tools = [
    {
      name: "search_carvcam_docs",
      description: "Search the CarvCAM website and documentation (CNC software for Sienci Labs LongMill and AltMill). Returns matching pages with their URLs and summaries.",
      inputSchema: { type: "object", properties: { query: { type: "string", description: "What to look for, e.g. 'touch plate', 'connect over Ethernet', 'V-carve'" } }, required: ["query"] },
      async execute({ query }) {
        const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
        const hits = (await pages())
          .map((p) => ({ p, score: words.filter((w) => (p.title + " " + p.description).toLowerCase().includes(w)).length }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 8)
          .map(({ p }) => `- ${p.title}: ${p.url}\n  ${p.description}`);
        return text(hits.length ? hits.join("\n") : "No matching page. The full index is at /llms.txt.");
      },
    },
    {
      name: "read_carvcam_page",
      description: "Read any CarvCAM page as Markdown, for example /docs/quickstart/, /pricing/ or /machines/longmill-mk3/.",
      inputSchema: { type: "object", properties: { path: { type: "string", description: "Page path on carvcam.com, e.g. /docs/connect/" } }, required: ["path"] },
      async execute({ path }) {
        return text(await page(path));
      },
    },
    {
      name: "get_carvcam_download",
      description: "Get the download link for the latest CarvCAM desktop installer for an operating system.",
      inputSchema: { type: "object", properties: { platform: { type: "string", enum: Object.keys(DOWNLOADS), description: "Operating system and chip" } }, required: ["platform"] },
      async execute({ platform }) {
        const p = DOWNLOADS[platform];
        if (!p) return text(`Unknown platform. Use one of: ${Object.keys(DOWNLOADS).join(", ")}.`);
        return text(`${location.origin}${p}\nAfter installing, sign in with a free CarvCAM account (${location.origin}/signup/). New accounts get 7 days of Pro, no card.`);
      },
    },
    {
      name: "get_carvcam_pricing",
      description: "Get CarvCAM plans and prices (Free, Pro, School / Makerspace) and what each includes.",
      inputSchema: { type: "object", properties: {} },
      async execute() {
        return text(await page("/pricing/"));
      },
    },
  ];

  const controller = new AbortController();
  for (const t of tools) {
    try {
      const out = mc.registerTool(t, { signal: controller.signal });
      if (out && typeof out.catch === "function") out.catch(() => {});
    } catch {
      /* the page keeps working without agent tools */
    }
  }
  addEventListener("pagehide", () => controller.abort(), { once: true });
})();
