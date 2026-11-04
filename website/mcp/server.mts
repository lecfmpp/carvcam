// CarvCAM MCP server v2 (Streamable HTTP, JSON responses) at https://carvcam.com/mcp.
// Read tools (docs, downloads, pricing) plus design tools that run the real CAM engine:
// list the options, build and check a project, export verified G-code, and a link that opens the
// project in the CarvCAM app. Nothing here moves a machine: carving always happens in the app,
// after the person's checklist. No auth yet, nothing is stored server side.
import { deflateRawSync } from "node:zlib";
import { generatePlate, loadFonts, PlateSpecSchema, sienci, FONT_IDS, ICON_IDS, type PlateSpecInput } from "../../cam-engine/src/index.ts";

const VERSION = "2.0.0";
const PROTOCOL = "2025-06-18";
const APP = "https://app.carvcam.com";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, accept, authorization, mcp-protocol-version, mcp-session-id",
};
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", ...extra } });

/** Materials as the app names them, with the engine material and the usual thicknesses (mm). */
const MATERIALS: Record<string, { engine: "mdf" | "softwood" | "hardwood" | "plywood" | "acrylic"; thick: number[] }> = {
  MDF: { engine: "mdf", thick: [6, 12, 15, 18] },
  Pine: { engine: "softwood", thick: [12, 19] },
  Oak: { engine: "hardwood", thick: [12, 19] },
  Walnut: { engine: "hardwood", thick: [12, 19] },
  "Birch plywood": { engine: "plywood", thick: [6, 12, 18] },
  Acrylic: { engine: "acrylic", thick: [3, 6] },
};
const PRESETS = { fast: "maximum", balanced: "regular", detailed: "reduced" } as const;
type Preset = keyof typeof PRESETS;

// ---------------------------------------------------------------- fonts (served by the site)
let fontsP: ReturnType<typeof loadFonts> | null = null;
const fonts = (origin: string) =>
  (fontsP ??= loadFonts(async (file) => {
    const r = await fetch(`${origin}/assets/cam-fonts/${file}`);
    if (!r.ok) throw new Error(`Font missing: ${file}`);
    return r.arrayBuffer();
  }).catch((e) => {
    fontsP = null;
    throw e;
  }));

// ---------------------------------------------------------------- read tools
type Page = { title: string; url: string; description: string };
async function pages(origin: string): Promise<Page[]> {
  const t = await (await fetch(`${origin}/llms.txt`)).text();
  return [...t.matchAll(/^- \[([^\]]+)\]\(([^)]+)\): (.*)$/gm)].map((m) => ({ title: m[1], url: m[2].replace(/index\.md$/, ""), description: m[3] }));
}
async function readPage(origin: string, path: string) {
  let p = "/" + String(path || "/").replace(/^https?:\/\/[^/]+/, "").replace(/^\/+/, "").replace(/index\.(html|md)$/, "");
  if (!p.endsWith("/")) p += "/";
  if (p.includes("..")) return null;
  const r = await fetch(`${origin}${p}index.md`);
  return r.ok && (r.headers.get("content-type") ?? "").includes("markdown") ? r.text() : null;
}
const DOWNLOADS: Record<string, string> = {
  windows: "/download/windows",
  "mac-apple-silicon": "/download/mac-apple-silicon",
  "mac-intel": "/download/mac-intel",
  "linux-appimage": "/download/linux-appimage",
  "linux-deb": "/download/linux-deb",
  "raspberry-pi-64bit": "/download/raspberry-pi-deb",
  "raspberry-pi-32bit": "/download/raspberry-pi-32bit-deb",
};

// ---------------------------------------------------------------- design tools
const BITS = sienci.BITS.filter((b) => b.supportedInV1);
const options = () => ({
  machines: Object.values(sienci.MACHINES).map((m) => ({ id: m.id, name: m.name, travel_mm: m.travel, heads: m.heads, defaultHead: m.defaultHead })),
  heads: Object.entries(sienci.HEADS).map(([id, h]) => ({ id, name: h.name })),
  bits: BITS.map((b) => ({ id: b.id, name: b.name })),
  materials: Object.entries(MATERIALS).map(([id, m]) => ({ id, usualThicknesses_mm: m.thick })),
  fonts: FONT_IDS,
  icons: ICON_IDS,
  modes: { relief: "element stays up, background lowered", engrave: "element is carved into the wood", cutout: "cuts through inside the outline", part: "cuts the element out with holding tabs" },
  speeds: { fast: "quickest", balanced: "most signs", detailed: "small lettering, cleanest edges" },
  coordinates: "All sizes in mm. Origin (0,0) is the bottom-left corner of the board; x right, y up. Text and shapes are centered on (x, y). Text without x/y is centered on the board.",
  defaults: { bit: "flat-1-8-upcut", vbit: "vbit-60-15mm", speed: "balanced", material: "MDF" },
});

interface DesignArgs {
  name?: string;
  machine: string;
  head?: string;
  material?: string;
  thickness: number;
  width: number;
  height: number;
  type?: "plate" | "lettering";
  texts?: unknown[];
  shapes?: unknown[];
  icons?: unknown[];
  holes?: unknown[];
  frame?: number;
  edge?: unknown;
  outerCutout?: boolean;
  bit?: string;
  cutoutBit?: string;
  speed?: Preset;
}

function toSpec(a: DesignArgs): { spec: PlateSpecInput; material: string } {
  const material = a.material && MATERIALS[a.material] ? a.material : "MDF";
  const spec: PlateSpecInput = {
    type: a.type ?? "plate",
    width: a.width,
    height: a.height,
    thickness: a.thickness,
    material: MATERIALS[material].engine,
    texts: (a.texts ?? []) as never,
    shapes: (a.shapes ?? []) as never,
    icons: (a.icons ?? []) as never,
    holes: (a.holes ?? []) as never,
    ...(a.frame !== undefined ? { frame: a.frame } : {}),
    ...(a.edge ? { edge: a.edge as never } : {}),
    ...(a.outerCutout !== undefined ? { outerCutout: a.outerCutout } : {}),
  };
  return { spec, material };
}

/** Link that opens the project in the CarvCAM app (the design rides in the URL fragment, compressed). */
function appLink(a: DesignArgs, spec: PlateSpecInput, material: string) {
  const bit = a.bit ?? "flat-1-8-upcut";
  const design = {
    v: 1,
    name: a.name?.trim() || "Project from Claude",
    material,
    spec,
    bit,
    bit2: a.cutoutBit,
    useBit2: !!a.cutoutBit && a.cutoutBit !== bit,
    preset: a.speed ?? "balanced",
    machine: a.machine,
  };
  return `${APP}/#/import?d=${deflateRawSync(Buffer.from(JSON.stringify(design))).toString("base64url")}`;
}

async function runDesign(origin: string, a: DesignArgs, withGcode: boolean) {
  if (!sienci.MACHINES[a.machine as never]) return { error: `Unknown machine "${a.machine}". Call list_design_options for the ids.` };
  const { spec, material } = toSpec(a);
  const parsed = PlateSpecSchema.safeParse(spec);
  if (!parsed.success) return { error: "The design doesn't match the format: " + parsed.error.issues.slice(0, 6).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const res = generatePlate(spec, {
    fonts: await fonts(origin),
    sienci: { machine: a.machine as never, head: a.head as never, bit: a.bit ?? "flat-1-8-upcut", cutoutBit: a.cutoutBit, speed: PRESETS[a.speed ?? "balanced"] },
    title: a.name,
  });
  const errors = res.warnings.filter((w) => w.severity === "error");
  const st = res.verification?.stats;
  const summary = {
    name: a.name ?? "Project from Claude",
    status: res.ok ? "Ready to carve" : errors.length ? "Needs changes" : "G-code failed verification",
    ok: res.ok,
    warnings: res.warnings.map((w) => ({ severity: w.severity, message: w.message, ...(w.suggestion ? { fix: w.suggestion } : {}) })),
    verification: res.verification ? { ok: res.verification.ok, problems: res.verification.problems.slice(0, 10).map((p) => `${p.severity} line ${p.line}: ${p.message}`) } : null,
    estimate: st ? { minutes: Math.ceil(st.estimatedTimeSec / 60), lines: st.lines, cutLength_m: +(st.cutLength / 1000).toFixed(1) } : null,
    operations: res.operations.map((o) => `${o.name} (T${o.tool}, ${o.depth} mm)`),
    feeds: res.params,
    manualSteps: res.manualAdjustments?.map((m) => m.message) ?? [],
    openInCarvCAM: appLink(a, spec, material),
    safety: "Open the project in CarvCAM to see the 3D preview, set zero and carve. The first carve on a machine should be an air cut.",
  };
  return { summary, gcode: withGcode && res.ok ? res.gcode : undefined };
}

// ---------------------------------------------------------------- tool list
const designSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "Project name, e.g. 'The Millers door sign'" },
    machine: { type: "string", description: "Machine id from list_design_options, e.g. longmill-mk3-30x30" },
    head: { type: "string", description: "Router or spindle id (default: the machine's usual one)" },
    material: { type: "string", enum: Object.keys(MATERIALS), description: "Wood or plastic" },
    thickness: { type: "number", description: "Board thickness, mm" },
    width: { type: "number", description: "Sign width, mm" },
    height: { type: "number", description: "Sign height, mm" },
    type: { type: "string", enum: ["plate", "lettering"], description: "plate = a sign on a board; lettering = cut-out letters" },
    texts: { type: "array", description: "Up to 6: { content, font (archivo-black|pacifico|bebas-neue), size (cap height mm), mode (relief|engrave|cutout|part), depth mm, x?, y?, arc? (radius mm, + curves up) }", items: { type: "object" } },
    shapes: { type: "array", description: "Up to 40: { type: rectangle|circle|polygon|star|line, x, y, width/height or diameter, mode, depth }", items: { type: "object" } },
    icons: { type: "array", description: "Up to 12: { id (heart|star|house|leaf), x, y, size, mode, depth }", items: { type: "object" } },
    holes: { type: "array", description: "Mounting holes: { x, y, diameter }", items: { type: "object" } },
    frame: { type: "number", description: "Raised frame width around a relief sign, mm (0 = none, default 6)" },
    outerCutout: { type: "boolean", description: "Cut the sign out of a bigger board with tabs (default true)" },
    bit: { type: "string", description: "Main bit id (default flat-1-8-upcut; use a V-bit like vbit-60-15mm for V-carve)" },
    cutoutBit: { type: "string", description: "Optional second bit for the outline and holes" },
    speed: { type: "string", enum: ["fast", "balanced", "detailed"] },
  },
  required: ["machine", "thickness", "width", "height"],
};
const RO = { readOnlyHint: true, openWorldHint: false };
const TOOLS = [
  { name: "search_docs", description: "Search the CarvCAM website and docs (CNC design, CAM and carving software for Sienci Labs LongMill and AltMill).", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }, annotations: RO },
  { name: "read_page", description: "Read a CarvCAM page as Markdown, e.g. /docs/quickstart/ or /pricing/.", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] }, annotations: RO },
  { name: "get_download_links", description: "Links to the latest CarvCAM desktop installers.", inputSchema: { type: "object", properties: {} }, annotations: RO },
  { name: "get_pricing", description: "CarvCAM plans and prices.", inputSchema: { type: "object", properties: {} }, annotations: RO },
  { name: "list_design_options", description: "Machines, routers/spindles, bits, materials, fonts, icons and cut modes you can use in a CarvCAM design, with the coordinate system. Call this before designing.", inputSchema: { type: "object", properties: {} }, annotations: RO },
  { name: "design_project", description: "Build a CarvCAM sign or lettering project and check it with the real CAM engine: status (Ready to carve or what to fix), warnings with fixes, time estimate, operations and Sienci feeds and speeds, plus a link that opens the project in the CarvCAM app. Iterate until status is 'Ready to carve'.", inputSchema: designSchema, annotations: RO },
  { name: "export_gcode", description: "Generate the verified G-code (.nc) for a CarvCAM project (same input as design_project). Only returns G-code when the project is ready to carve. The person must still set zero and run it from CarvCAM or their sender, after an air cut on a new machine.", inputSchema: designSchema, annotations: RO },
];
const text = (t: string) => ({ type: "text", text: t });

async function callTool(origin: string, name: string, args: Record<string, unknown>) {
  switch (name) {
    case "search_docs": {
      const words = String(args.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
      const hits = (await pages(origin))
        .map((p) => ({ p, s: words.filter((w) => `${p.title} ${p.description}`.toLowerCase().includes(w)).length }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 8);
      return { content: [text(hits.length ? hits.map(({ p }) => `- ${p.title}: ${p.url}\n  ${p.description}`).join("\n") : "No matching page. Index: https://carvcam.com/llms.txt")] };
    }
    case "read_page": {
      const md = await readPage(origin, String(args.path ?? "/"));
      return md ? { content: [text(md)] } : { content: [text(`No page at ${args.path}`)], isError: true };
    }
    case "get_download_links":
      return { content: [text(Object.entries(DOWNLOADS).map(([k, v]) => `- ${k}: ${origin}${v}`).join("\n") + `\n\nSign in with a free account after installing (${origin}/signup/); new accounts get 7 days of Pro, no card.`)] };
    case "get_pricing":
      return { content: [text((await readPage(origin, "/pricing/")) ?? "https://carvcam.com/pricing/")] };
    case "list_design_options":
      return { content: [text(JSON.stringify(options(), null, 2))] };
    case "design_project":
    case "export_gcode": {
      const out = await runDesign(origin, args as unknown as DesignArgs, name === "export_gcode");
      if ("error" in out) return { content: [text(out.error!)], isError: true };
      const content: unknown[] = [text(JSON.stringify(out.summary, null, 2))];
      if (name === "export_gcode") {
        if (out.gcode) content.push({ type: "resource", resource: { uri: `carvcam://gcode/${encodeURIComponent(out.summary.name)}.nc`, mimeType: "text/x-gcode", text: out.gcode } });
        else content.push(text("No G-code: the project isn't ready to carve yet. Fix the errors listed above and try again."));
      }
      return { content };
    }
  }
  return null;
}

// ---------------------------------------------------------------- JSON-RPC
export default async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "This MCP server answers POST requests (Streamable HTTP, JSON responses)." }, 405, { Allow: "POST, OPTIONS" });
  const origin = new URL(req.url).origin;
  let msg: { id?: string | number | null; method?: string; params?: Record<string, unknown> };
  try {
    msg = await req.json();
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }
  if (Array.isArray(msg)) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Batches are not supported" } }, 400);
  const { id, method, params = {} } = msg;
  if (id === undefined || id === null) return new Response(null, { status: 202, headers: CORS });
  const ok = (result: unknown) => json({ jsonrpc: "2.0", id, result });
  const fail = (code: number, message: string) => json({ jsonrpc: "2.0", id, error: { code, message } });
  try {
    switch (method) {
      case "initialize":
        return ok({
          protocolVersion: typeof params.protocolVersion === "string" ? params.protocolVersion : PROTOCOL,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "carvcam", title: "CarvCAM", version: VERSION },
          instructions:
            "CarvCAM designs and carves signs on Sienci Labs LongMill and AltMill CNC routers. To make a project: call list_design_options, then design_project and fix what it reports until the status is 'Ready to carve'; give the person the openInCarvCAM link (they review the 3D preview, set zero and carve in the app). Use export_gcode only when they want the .nc file. Never claim the machine will move: carving always starts from the CarvCAM app.",
        });
      case "ping":
        return ok({});
      case "tools/list":
        return ok({ tools: TOOLS });
      case "tools/call": {
        const r = await callTool(origin, String(params.name ?? ""), (params.arguments as Record<string, unknown>) ?? {});
        return r ? ok(r) : fail(-32602, `Unknown tool: ${params.name}`);
      }
      default:
        return fail(-32601, `Method not found: ${method}`);
    }
  } catch (err) {
    console.error("[mcp]", err);
    return ok({ content: [text(`Something went wrong: ${err instanceof Error ? err.message : String(err)}`)], isError: true });
  }
};

// Reached at /mcp through a rewrite in netlify.toml (the bundled file is netlify/functions/mcp.mjs).
