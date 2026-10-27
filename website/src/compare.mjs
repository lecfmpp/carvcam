// Páginas "CarvCAM vs X". Os fatos dos concorrentes (preços, limites, relatos de usuários, FAQ, fontes)
// vêm de research/competitors.json, conferido em 2026-10-27 nas páginas oficiais e fóruns citados.
// Aqui fica só o texto editorial de cada página e o lado CarvCAM da comparação.
// Células da tabela: "yes" / "no" / "part" viram ícones; o resto é texto.
import { readFileSync } from "node:fs";

const research = JSON.parse(readFileSync(new URL("./research/competitors.json", import.meta.url), "utf8"));
export const researchChecked = research.checked;
export const sienciRecs = research.sienci_recommendations;
const R = Object.fromEntries(research.competitors.map((c) => [c.slug, c]));

const pages = [
  {
    slug: "easel",
    name: "Easel",
    title: "CarvCAM vs Easel (2026): Offline Desktop App vs Browser CNC Software",
    description: "Easel Basic now allows one carve a week and V-carving is Pro-only. See how CarvCAM compares for LongMill and AltMill: offline use, SuperLongBoard support, Ethernet, feeds and pricing.",
    kicker: "Looking for an Easel alternative for your LongMill?",
    summary: "Easel is Inventables' browser app for design, toolpaths and carving. CarvCAM does the same three jobs as a Windows desktop app built around Sienci machines, and it works with no internet at all.",
    glance: [
      ["Starts at", "Pricing at launch", "Free: 1 carve a week · Pro $24/mo"],
      ["Works offline", "Yes", "No, needs internet"],
      ["SuperLongBoard / SLB-EXT", "USB and Ethernet", "Beta, USB only"],
      ["V-carving", "Included", "Pro plan only"],
    ],
    rows: [
      ["Design, toolpaths and carving in one app", "yes", "yes"],
      ["Runs without internet", "yes", "no"],
      ["Carve limit on the free plan", "—", "1 carve or export per week"],
      ["V-carving", "yes", "Pro"],
      ["Connects to grblHAL (SuperLongBoard, SLB-LITE, SLB-EXT)", "yes", "Opt-in beta, USB only"],
      ["Ethernet connection", "yes", "no"],
      ["Feeds and speeds", "Sienci's speed tables for your machine, router and bit", "Easel's bit library and community cut settings"],
      ["Guided wiring and connection test", "yes", "Setup wizard with wiring test"],
      ["Touch plate zero and homing", "yes", "yes"],
      ["Account required", "no", "yes"],
      ["Machines supported", "LongMill MK2, MK3, AltMill", "Many GRBL brands"],
      ["Platforms", "Windows (Mac, Linux in development)", "Any modern browser"],
    ],
    workflow: { them: ["Sign in to Easel online", "Design and set toolpaths", "Carve over USB (grblHAL: beta)"], note: "One app, but it needs a connection to work and the free plan stops at one carve a week." },
    clips: [["design", "Design: add text, pick a carving font, size it to the board."], ["connect", "Connect: cable by cable over USB or Ethernet, then a real test."]],
    chooseThem: ["You move between several computers and like cloud storage", "You own a non-Sienci machine, or several brands", "You want Easel's large project and design library"],
    chooseUs: ["Your shop has weak or no internet", "You run a SuperLongBoard or SLB-EXT over Ethernet", "You want V-carving without a subscription tier", "You want speeds taken from Sienci's own tables"],
    switching: [["Bring your designs", "Export your artwork from Easel as SVG and import it in CarvCAM (SVG and DXF supported)."], ["Pick your machine", "Choose your LongMill or AltMill, router or spindle and bits once."], ["Re-apply styles", "Set Engrave, V-carve or Cutout on each item; CarvCAM fills in the speeds."], ["Connect and carve", "Follow the connect wizard, then home, zero and carve in the same window."]],
  },
  {
    slug: "gsender",
    name: "gSender",
    title: "CarvCAM vs gSender: Do You Still Need a Separate CAM Program?",
    description: "gSender is Sienci's free G-code sender; it runs files but doesn't design or make toolpaths. Compare it with CarvCAM, which does design, CAM and machine control in one app.",
    kicker: "gSender runs the file. Who makes the file?",
    summary: "gSender is Sienci Labs' free, open-source sender: it runs G-code made in another program. CarvCAM covers the whole path, design, toolpaths and machine control, so a sign doesn't need two or three programs.",
    glance: [
      ["Price", "Pricing at launch", "Free, open source"],
      ["Designs and makes toolpaths", "Yes", "No"],
      ["Runs LongMill and AltMill", "Yes", "Yes"],
      ["Platforms", "Windows (Mac, Linux soon)", "Windows, Mac, Linux, Pi"],
    ],
    rows: [
      ["Design signs, text and shapes", "yes", "no"],
      ["Create toolpaths with feeds and speeds (CAM)", "yes", "no"],
      ["Run G-code on LongMill and AltMill", "yes", "yes"],
      ["USB and Ethernet", "yes", "yes"],
      ["Touch plate zero and homing", "yes", "yes"],
      ["Guided wiring map and connection test", "yes", "no"],
      ["Guided bit change mid-job", "yes", "Tool change handling (M6)"],
      ["Firmware settings, squaring, macros", "no", "yes"],
      ["Open source", "no", "yes"],
      ["Platforms", "Windows (Mac, Linux in development)", "Windows, Mac, Linux, Raspberry Pi"],
    ],
    workflow: { them: ["Design in another app", "Make toolpaths in CAM", "Export G-code", "Open in gSender and run"], note: "gSender is excellent at the last step; the first three happen elsewhere." },
    clips: [["prepare", "Prepare: CarvCAM makes and checks the toolpath, no export needed."], ["carve", "Carve: start, watch the live preview, finish."]],
    chooseThem: ["You already design and make toolpaths in VCarve, Carveco or Fusion", "You need firmware settings, squaring or macros", "You work on Mac or Linux today"],
    chooseUs: ["You want to make signs without learning a separate CAM program", "You want the toolpath, the checks and the carve in one window", "You want the app to walk you through wiring and zero"],
    switching: [["Keep gSender", "You don't have to remove it. Close it before connecting CarvCAM; only one program can use the port."], ["Design in CarvCAM", "Type the sign or import SVG or DXF."], ["Prepare and carve", "Pick a speed, connect and carve in the same app."]],
  },
  {
    slug: "carbide-create",
    name: "Carbide Create",
    title: "CarvCAM vs Carbide Create for LongMill (2026): Free G-code Export Is Gone",
    description: "Free Carbide Create Core is made for Carbide 3D machines; saving G-code for a LongMill or AltMill needs Pro ($120/yr). How CarvCAM compares for Sienci owners.",
    kicker: "Carbide Create Core won't save G-code for a LongMill.",
    summary: "Carbide Create is Carbide 3D's design and toolpath software. The free Core edition is made for Shapeoko and Nomad: standard G-code for other machines is a Pro feature. CarvCAM is made around Sienci machines and also runs them.",
    glance: [
      ["For a LongMill you need", "CarvCAM", "Create Pro ($120/yr) + a sender"],
      ["Runs the machine", "Yes", "No, Carbide Motion is Carbide-only"],
      ["Works offline", "Yes", "Yes"],
      ["Platforms", "Windows (Mac, Linux soon)", "Windows, Mac"],
    ],
    rows: [
      ["Design and V-carving", "yes", "yes"],
      ["Save G-code for a LongMill or AltMill", "yes", "Pro only"],
      ["Runs the machine (sender)", "yes", "no"],
      ["Built around", "Sienci LongMill and AltMill", "Carbide 3D Shapeoko and Nomad"],
      ["Feeds and speeds", "Sienci's tables for your machine and bit", "Tool library focused on Carbide 3D tooling"],
      ["Guided wiring and connection test", "yes", "no"],
      ["Image to vector", "yes", "yes"],
      ["3D modeling and 3D toolpaths", "no", "Pro"],
      ["Tiling large jobs", "Full bed, no tiling needed", "Pro"],
      ["Platforms", "Windows (Mac, Linux in development)", "Windows, Mac"],
    ],
    workflow: { them: ["Design in Carbide Create", "Buy Pro to export G-code", "Export with the grbl post", "Run it in gSender"], note: "Two programs and a Pro license, for the same sign." },
    clips: [["design", "Design: text, fonts and size, with warnings when a detail is too fine."], ["prepare", "Prepare: speeds from Sienci's tables, toolpath and 3D preview."]],
    chooseThem: ["You own a Shapeoko or Nomad", "You want 3D modeling and heightmaps (Pro)", "You need Mac support today"],
    chooseUs: ["You own a LongMill or AltMill and don't want a Pro license just to export", "You want design, toolpaths and the carve in one app", "You want speeds tuned to your Sienci setup"],
    switching: [["Export your art", "Save your vectors as SVG or DXF from Carbide Create."], ["Import in CarvCAM", "They land on the board; pick a style for each."], ["Carve", "Prepare, connect and carve without a separate sender."]],
  },
  {
    slug: "vcarve",
    name: "VCarve",
    title: "CarvCAM vs VCarve Desktop and Pro for LongMill and AltMill Sign Making",
    description: "VCarve Desktop ($349) is limited to 24 × 24 in, smaller than every LongMill bed; Pro is $699. Compare with CarvCAM: full bed, machine control built in, Sienci-tuned speeds.",
    kicker: "VCarve Desktop stops at 24 × 24 in. Your LongMill doesn't.",
    summary: "Vectric VCarve is the classic sign-making CAM, sold as a perpetual license, with a separate sender needed to run the machine. CarvCAM is simpler and guided, uses your whole bed, and runs the LongMill or AltMill itself.",
    glance: [
      ["Price", "Pricing at launch", "Desktop ~$349 · Pro ~$699 (one-time)"],
      ["Job size", "Your full bed", "Desktop 24 × 24 in · Pro unlimited"],
      ["Runs the machine", "Yes", "No, export to gSender"],
      ["Platforms", "Windows (Mac, Linux soon)", "Windows only"],
    ],
    rows: [
      ["V-carving and sign design", "yes", "yes"],
      ["Job size on a 30 × 30 or 48 × 30 bed", "Full bed", "Desktop: 24 × 24 in, then tiling"],
      ["Runs the machine (sender)", "yes", "no"],
      ["Guided setup for LongMill and AltMill", "yes", "Machine configuration by hand"],
      ["Feeds and speeds", "Sienci's tables for your machine and bit", "Tool database you set up"],
      ["Inlays", "no", "Auto-inlays; VCarve Inlays on Pro"],
      ["Nesting, moulding, 3D finishing", "no", "Pro and Aspire"],
      ["Platforms", "Windows (Mac, Linux in development)", "Windows only"],
    ],
    workflow: { them: ["Design in VCarve", "Set up the LongMill machine config", "Export with the grbl (mm) post", "Run it in gSender"], note: "The most capable CAM here, and still two programs to carve." },
    clips: [["prepare", "Prepare: no machine configuration to set up, speeds come from your setup."], ["carve", "Carve: from the checklist to the finished piece in the same app."]],
    chooseThem: ["You need inlays, nesting, moulding or 3D finishing", "You buy project files that ship with VCarve instructions", "You want a one-time license and a deep tutorial library"],
    chooseUs: ["You want to use your whole LongMill bed without paying for Pro", "You want one app from layout to the last pass", "You're new and want a guided setup"],
    switching: [["Bring your vectors", "Export from VCarve as DXF or SVG and import in CarvCAM."], ["Re-pick styles", "Engrave, V-carve or Cutout per item; speeds fill in from your setup."], ["Run it", "Connect, home, zero and carve without exporting."]],
  },
  {
    slug: "fusion-360",
    name: "Fusion 360",
    title: "CarvCAM vs Fusion 360 for LongMill: Is Fusion Overkill for Signs?",
    description: "Free Fusion for personal use removes rapid moves, multi-tool posts and caps you at 10 documents. Compare with CarvCAM for LongMill and AltMill sign making: simpler, offline, machine control built in.",
    kicker: "Fusion is a full engineering suite. Do your signs need one?",
    summary: "Autodesk Fusion is professional parametric 3D CAD and CAM, free for personal use with limits. It's unmatched for furniture parts and mechanical design. For signs, text and V-carving on a LongMill, CarvCAM is a much shorter path.",
    glance: [
      ["Price", "Pricing at launch", "Free personal use · $57/mo commercial"],
      ["Rapid moves (free plan)", "Yes", "No, capped at cut feed"],
      ["Several bits in one job", "Yes, guided bit change", "One file per tool (free plan)"],
      ["Runs the machine", "Yes", "No, export to gSender"],
    ],
    rows: [
      ["Made for signs, text and V-carving", "yes", "part"],
      ["Parametric 3D CAD and assemblies", "no", "yes"],
      ["Rapid moves between cuts", "yes", "Not on personal use"],
      ["Several bits in one job", "yes", "Personal use: one file per tool"],
      ["Runs the machine (sender)", "yes", "no"],
      ["LongMill post-processor setup", "Not needed", "grbl post with Sienci's tweaks"],
      ["Feeds and speeds", "Sienci's tables for your machine and bit", "You enter them"],
      ["Works offline", "yes", "Limited, cloud-connected"],
      ["Account required", "no", "yes"],
      ["Selling what you make", "—", "Over $1,000/yr needs a paid plan"],
    ],
    workflow: { them: ["Model in Fusion", "Set up CAM and the grbl post", "Post one file per bit", "Run each file in gSender"], note: "Powerful, with a steep learning curve and personal-use limits on CAM." },
    clips: [["design", "Design: a sign in a minute, no sketches or constraints."], ["carve", "Carve: guided bit change and live preview in one app."]],
    chooseThem: ["You design furniture parts, jigs or mechanical pieces", "You need 3D adaptive clearing or aluminum strategies", "You want skills that carry into professional CAD"],
    chooseUs: ["You mostly make signs, plaques and engravings", "You want full-speed rapids and multi-bit jobs without a paid plan", "You want to start carving the same evening"],
    switching: [["Keep Fusion for 3D parts", "Many owners use both: Fusion for parts, CarvCAM for signs."], ["Export 2D shapes", "Save sketches as DXF and import them in CarvCAM."], ["Carve", "Prepare, connect and carve; bit changes are guided."]],
  },
  {
    slug: "carveco-maker",
    name: "Carveco Maker",
    title: "CarvCAM vs Carveco Maker for LongMill and AltMill",
    description: "Carveco Maker is $17.50/month, subscription only, and must check its license every 21 days. Compare with CarvCAM for LongMill and AltMill: offline, machine control built in, Sienci-tuned speeds.",
    kicker: "Strong 3D relief tools, on a subscription that checks in every 21 days.",
    summary: "Carveco Maker comes from the team behind ArtCAM and shines at 3D relief work. It's subscription-only and needs a separate sender. CarvCAM focuses on signs, engraving, V-carving and cutouts, and runs the machine itself, fully offline.",
    glance: [
      ["Price", "Pricing at launch", "$17.50/mo or $180/yr"],
      ["Offline", "Always", "Up to 21 days between license checks"],
      ["Runs the machine", "Yes", "No, export to gSender"],
      ["Platforms", "Windows (Mac, Linux soon)", "Windows"],
    ],
    rows: [
      ["Sign design and V-carving", "yes", "yes"],
      ["3D relief modeling", "no", "Maker Plus"],
      ["Runs the machine (sender)", "yes", "no"],
      ["Works offline", "yes", "Up to 21 days"],
      ["License", "Pricing announced at launch", "Subscription only (Maker)"],
      ["Feeds and speeds", "Sienci's tables for your machine and bit", "Tool database you set up"],
      ["Guided wiring and connection test", "yes", "no"],
      ["Tiling large jobs", "Full bed, no tiling needed", "Maker Plus"],
      ["Platforms", "Windows (Mac, Linux in development)", "Windows"],
    ],
    workflow: { them: ["Design in Carveco", "Export with the GRBL post", "Run it in gSender", "Reconnect to renew the license"], note: "Great 3D tools; two programs and a recurring license for 2D signs." },
    clips: [["design", "Design: carving fonts, frames and icons sized for your bit."], ["connect", "Connect: the wiring map for your exact controller."]],
    chooseThem: ["You carve 3D reliefs and textures", "You want AI image-to-relief", "You like a low monthly entry price you can pause"],
    chooseUs: ["Your shop computer is offline", "You want one app from design to carve", "You make 2D signs and plaques and don't need 3D relief"],
    switching: [["Export vectors", "Save your artwork as DXF or SVG from Carveco."], ["Import in CarvCAM", "Pick a style per item; speeds fill in."], ["Carve", "Connect and carve without a separate sender."]],
  },
];

// Junta o texto editorial com os fatos pesquisados.
export const comparisons = pages.map((p) => {
  const r = R[p.slug];
  const platformsShort = { easel: "Browser", gsender: "Windows, Mac, Linux, Pi", "carbide-create": "Windows, Mac", vcarve: "Windows only", "fusion-360": "Windows, Mac", "carveco-maker": "Windows" }[p.slug];
  return { ...p, platformsShort, maker: r.maker, type: r.type, pricing: r.pricing, limits: r.limits, painPoints: r.pain_points, stronger: r.stronger, faq: r.faq.map((f) => [f.q, f.a]), sources: r.sources, keywords: r.keywords };
});

// Outras opções, citadas no guia "melhor software" (uma linha cada).
export const others = ["ugs", "kiri-moto", "estlcam"].map((s) => ({ slug: s, name: R[s].name, type: R[s].type, price: R[s].pricing.map((x) => x.price).join(" · "), platforms: R[s].platforms, source: R[s].sources[0] }));
