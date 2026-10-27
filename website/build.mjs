// Gera o site estático em dist/: página inicial, download, hubs e páginas por máquina, recurso,
// comparação e guia, mais sitemap.xml, robots.txt e dados estruturados (JSON-LD).
//   node build.mjs            → links limpos (/features/v-carve/) para publicar
//   node build.mjs --preview  → links para index.html, para abrir sem servidor
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { competitors, faq, features, howtos, machines, nav, site } from "./src/data.mjs";
import { docSections, docs } from "./src/docs.mjs";

const PREVIEW = process.argv.includes("--preview");
const OUT = new URL("./dist/", import.meta.url).pathname;
const pages = [];

/* ---------------- helpers ---------------- */
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
let depth = 0;
/** Define a profundidade da página antes do corpo ser montado (o corpo usa links relativos). */
const at = (p) => ((depth = p.split("/").filter(Boolean).length - (p.endsWith(".html") ? 1 : 0)), p);
/** Caminho do site ("/features/x/") → link relativo à página atual. */
const href = (p) => {
  if (/^(https?:|mailto:|#)/.test(p)) return p;
  const [path, hash] = p.split("#");
  let r = "../".repeat(depth) + path.replace(/^\//, "");
  if (PREVIEW && (r === "" || r.endsWith("/"))) r += "index.html";
  if (r === "") r = "./";
  return r + (hash !== undefined ? `#${hash}` : "");
};
const asset = (p) => "../".repeat(depth) + p.replace(/^\//, "");
const shot = (name, alt, { eager = false, cls = "shot" } = {}) =>
  `<div class="${cls}"><img src="${asset(`/assets/screens/${name}.webp`)}" srcset="${asset(`/assets/screens/${name}-800.webp`)} 800w, ${asset(`/assets/screens/${name}.webp`)} 1440w" sizes="(max-width: 900px) 100vw, 1160px" width="1440" height="900" alt="${esc(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></div>`;
// Clipe em loop (gravação simulada da tela): leve como vídeo, comporta-se como um GIF. Só baixa perto da tela.
const clip = (name, alt) =>
  `<div class="shot shot--video"><video class="lazyclip" muted loop playsinline preload="none" width="1280" height="800" poster="${asset(`/assets/video/feature-${name}-poster.webp`)}" data-src="${asset(`/assets/video/feature-${name}.mp4`)}" aria-label="${esc(alt)}"></video></div>`;
const ICON_WIN = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 5.5 10.5 4.5v7H3zM11.5 4.4 21 3v8.5h-9.5zM3 12.5h7.5v7L3 18.5zM11.5 12.5H21V21l-9.5-1.4z"/></svg>`;
const cell = (v) => (v === "yes" ? '<span class="yes">✓ Yes</span>' : v === "no" ? '<span class="no">— No</span>' : v === "part" ? '<span class="part">Partly</span>' : esc(v));

function layout({ path, title, description, body, schema = [], crumbs = null }) {
  at(path);
  const canonical = site.url + path;
  const ld = [...schema];
  if (crumbs) ld.push({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: crumbs.map(([n, u], i) => ({ "@type": "ListItem", position: i + 1, name: n, item: site.url + u })) });
  const navHtml = nav.map(([n, u]) => `<a href="${href(u)}"${path !== "/" && u.startsWith(path.split("/").slice(0, 2).join("/") + "/") && u !== "/#how" ? ' aria-current="page"' : ""}>${n}</a>`).join("");
  const crumbHtml = crumbs ? `<nav class="crumbs" aria-label="Breadcrumb">${crumbs.map(([n, u], i) => (i < crumbs.length - 1 ? `<a href="${href(u)}">${esc(n)}</a> / ` : `<span aria-current="page">${esc(n)}</span>`)).join("")}</nav>` : "";
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="CarvCAM">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${site.url}/assets/screens/carving.webp">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#ffffff">
<link rel="icon" type="image/svg+xml" href="${asset("/assets/carvcam-icon.svg")}">
<link rel="preload" href="${asset("/assets/fonts/geist-sans-latin-600-normal.woff2")}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${asset("/assets/site.css")}">
${ld.map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join("\n")}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="hdr"><div class="wrap">
<a class="logo" href="${href("/")}" aria-label="CarvCAM home"><img src="${asset("/assets/carvcam-icon.svg")}" alt="" width="28" height="28"><span class="wordmark">Carv<span>CAM</span></span></a>
<nav class="nav" aria-label="Main">${navHtml}</nav>
<a class="btn btn--primary" href="${href(site.download)}">${ICON_WIN}Download</a>
</div></header>
<main id="main">
${crumbs ? `<div class="wrap" style="padding-top:28px">${crumbHtml}</div>` : ""}
${body}
</main>
${footer()}
</body>
</html>`;
  pages.push({ path, html });
}

function footer() {
  const col = (t, items) => `<div><h4>${t}</h4><ul>${items.map(([n, u]) => `<li><a href="${href(u)}">${esc(n)}</a></li>`).join("")}</ul></div>`;
  return `<footer class="ftr"><div class="wrap">
<div class="ftr__top">
<div class="ftr__brand"><a class="logo" href="${href("/")}"><img src="${asset("/assets/carvcam-icon.svg")}" alt="" width="28" height="28"><span class="wordmark">Carv<span>CAM</span></span></a><p>Design, prepare and carve on your LongMill or AltMill. One app, start to finished piece.</p></div>
${col("Product", [["How it works", "/#how"], ["Features", "/features/"], ["Download", "/download/"], ["Docs", "/docs/"], ["Quickstart", "/docs/quickstart/"], ["Best software for LongMill", "/best-cnc-software-for-longmill/"]])}
${col("Machines", machines.map((m) => [m.name, `/machines/${m.slug}/`]))}
${col("Compare", competitors.map((c) => [`CarvCAM vs ${c.name}`, `/compare/carvcam-vs-${c.slug}/`]))}
${col("Learn", howtos.slice(0, 4).map((h) => [h.short, `/learn/${h.slug}/`]))}
</div>
<div class="ftr__legal"><span>© 2026 CarvCAM</span><span>LongMill, AltMill, SuperLongBoard, AutoSpin and gSender are trademarks of Sienci Labs. Other names are trademarks of their owners. CarvCAM is an independent product.</span></div>
</div></footer>`;
}

const downloadCta = (center = false) => `<div class="cta"${center ? ' style="justify-content:center"' : ""}>
<a class="btn btn--accent btn--lg" href="${href(site.download)}">${ICON_WIN}Download for Windows</a>
<a class="btn btn--ghost btn--lg" href="${href("/#how")}">See how it works</a>
<span class="note"${center ? ' style="text-align:center"' : ""}>Windows 10 and 11 · Works offline · Mac and Linux in development</span>
</div>`;

const app = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "CarvCAM",
  applicationCategory: "DesignApplication",
  operatingSystem: "Windows 10, Windows 11",
  description: "Desktop CNC software for Sienci Labs LongMill and AltMill: sign design, V-carving, toolpaths, machine setup and carving in one app.",
  url: site.url,
};
const faqLd = (items) => ({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: items.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) });

/* ---------------- Home ---------------- */
function home() {
  const steps = [
    ["Design", "Type the text, add shapes, frames or your own SVG. The preview shows the wood already carved."],
    ["Prepare", "Pick Fast, Balanced or Detailed. CarvCAM sets every feed and speed and checks the job fits."],
    ["Position", "Connect, find home, clamp the board and set zero with the touch plate, step by step."],
    ["Carve", "Press Start in the same window. Pause, change bits and recover from alarms with the app guiding you."],
  ];
  const rows = [
    ["Design", "Signs your bit can actually cut", "Fonts made for carving, text on an arc, frames and icons sized for a 1/8 in bit, SVG and DXF import, and image tracing. If a detail is too fine for your bit, CarvCAM says so and fixes it in one click.", "design", ["Text, shapes, free curves", "Engrave, V-carve, relief, hatch, cutout with tabs", "Image to vector with live preview"], "/features/sign-design/"],
    ["Prepare", "No feeds-and-speeds spreadsheet", "Choose how fast you want it. CarvCAM fills in feed, plunge, depth per pass and RPM for your machine, router and bit, shows the time, and verifies the G-code before it lets you near the machine.", "prepare", ["Values for your exact Sienci setup", "Animated toolpath and 3D preview", "Makita dial number for every cut"], "/features/feeds-and-speeds/"],
    ["Connect", "Every cable, checked before the first cut", "A wiring map for your controller: power, E-stop, AutoSpin or spindle cable, USB or Ethernet. Then a real test: the controller answers, the Z lifts 2 mm and the spindle spins.", "connect", ["LongBoard, SuperLongBoard, SLB-LITE, SLB-EXT", "USB or Ethernet", "Unlock and test in one place"], "/features/connect-wizard/"],
    ["Position & carve", "From zero to finished, in the same window", "Home, clamp, measure the bit and set zero on a live top view of your bed. Then carve with pause, safe stop, speed overrides, guided bit changes and alarm recovery.", "carve", ["Touch plate probing", "Pause with Space, stop with Esc", "Guided bit change with re-measuring"], "/features/carve-control/"],
  ];
  layout({
    path: at("/"),
    title: "CarvCAM: CNC Software for LongMill & AltMill. Design, Carve, Done.",
    description: "Design signs, get feeds tuned to your machine, wire and connect with a guided check, and carve, all in one Windows app made for Sienci LongMill and AltMill owners.",
    schema: [app, faqLd(faq)],
    body: `
<section class="hero"><div class="wrap">
<span class="eyebrow"><span class="mark">●</span> For LongMill and AltMill owners</span>
<h1>From blank board to finished sign. <span class="mark">One app.</span></h1>
<p class="lede">You bought a CNC to make things, not to learn four programs. CarvCAM designs the sign, works out every feed and speed for your machine, walks you through the cables and carves it. All in one window.</p>
${downloadCta()}
<div class="shot shot--video"><video autoplay muted loop playsinline preload="auto" width="1280" height="800" poster="${asset("/assets/video/hero-demo-poster.webp")}" aria-label="CarvCAM in use: typing a sign, planning the cuts, connecting a LongMill and carving it"><source src="${asset("/assets/video/hero-demo.mp4")}" type="video/mp4"></video></div>
<script>if (matchMedia("(prefers-reduced-motion: reduce)").matches) document.querySelectorAll(".shot--video video").forEach((v) => { v.removeAttribute("autoplay"); v.pause(); v.controls = true; });</script>
</div></section>

<div class="wrap"><div class="strip">
<div><b>Design + CAM + control</b>No exporting between apps</div>
<div><b>Tuned to your machine</b>Feeds for your router and bits</div>
<div><b>Guided setup</b>Wiring, homing, zero, tested</div>
<div><b>Works offline</b>Runs on your computer</div>
</div></div>

<section><div class="wrap">
<div class="sec-head"><span class="eyebrow">The usual way</span><h2>One sign. Four programs. A forum thread.</h2>
<p class="lede">Draw it in one app. Export. Import into CAM. Look up feeds. Export G-code. Open the sender. Hope the zero is right. CarvCAM collapses all of that into four steps that check each other.</p></div>
<div class="tablewrap"><table class="cmp">
<thead><tr><th>What you need</th><th>The usual setup</th><th class="us">CarvCAM</th></tr></thead>
<tbody>
<tr><td>Design the sign</td><td>A design program</td><td class="us"><span class="yes">✓ Built in</span></td></tr>
<tr><td>Make toolpaths</td><td>A CAM program</td><td class="us"><span class="yes">✓ Built in</span></td></tr>
<tr><td>Feeds and speeds</td><td>Charts, forums, trial and error</td><td class="us"><span class="yes">✓ Set for your machine and bit</span></td></tr>
<tr><td>Wire and connect the machine</td><td>The manual and some guessing</td><td class="us"><span class="yes">✓ Guided, then tested</span></td></tr>
<tr><td>Run the job</td><td>A separate sender</td><td class="us"><span class="yes">✓ Same window</span></td></tr>
</tbody></table></div>
</div></section>

<section id="how" class="soft"><div class="wrap">
<div class="sec-head"><span class="eyebrow">How it works</span><h2>Four steps. Always in this order.</h2><p class="lede">Each step unlocks the next only when it's ready, so you can't carve with a missing zero or the wrong bit.</p></div>
<div class="steps">${steps.map(([t, d]) => `<div class="step"><h3>${t}</h3><p>${d}</p></div>`).join("")}</div>
</div></section>

<section><div class="wrap">
${rows.map(([eb, h, p, img, ticks, link], i) => `<div class="frow${i % 2 ? " flip" : ""}">
<div class="frow__copy"><span class="eyebrow">${eb}</span><h3>${h}</h3><p>${p}</p><ul class="ticks">${ticks.map((t) => `<li>${t}</li>`).join("")}</ul><p style="margin-top:18px"><a href="${href(link)}" style="font-weight:600">Learn more →</a></p></div>
${clip(img, `CarvCAM ${eb}: screen recording`)}
</div>`).join("")}
</div></section>
<script>(() => {
  const vids = document.querySelectorAll("video.lazyclip");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    const v = e.target;
    if (e.isIntersecting) { if (!v.src) v.src = v.dataset.src; if (!still) v.play().catch(() => {}); } else v.pause();
  }), { rootMargin: "200px" });
  vids.forEach((v) => io.observe(v));
})();</script>

<section class="soft"><div class="wrap">
<div class="sec-head"><span class="eyebrow">Machines</span><h2>Made for the machine you own</h2><p class="lede">CarvCAM knows your bed size, your controller and what spins the bit, so the numbers are right from the first job.</p></div>
<div class="mach">${machines.map((m) => `<a class="card" href="${href(`/machines/${m.slug}/`)}"><span class="eyebrow">Sienci Labs</span><h3>${m.name}</h3><dl><dt>Sizes</dt><dd>${m.sizes}</dd><dt>Controller</dt><dd>${m.controller}</dd><dt>Connection</dt><dd>${m.link}</dd></dl><span class="${m.status === "Current model" ? "pill" : "pill pill--muted"}" style="align-self:flex-start;margin-bottom:16px">${m.status}</span><span class="more">${m.name} setup</span></a>`).join("")}</div>
</div></section>

<section><div class="wrap">
<div class="sec-head"><span class="eyebrow">Why CarvCAM</span><h2>What you won't find elsewhere</h2></div>
<div class="grid grid--3">
<div class="card"><h3>The whole path, offline</h3><p>Browser tools need the cloud. CAM-only tools need a sender. CarvCAM is design to carve on your own computer.</p></div>
<div class="card"><h3>A wiring check that proves it</h3><p>No other app we looked at walks you through each cable and then tests that the Z moves and the spindle spins.</p></div>
<div class="card"><h3>Numbers for your exact setup</h3><p>Feeds and speeds for your Sienci machine, your router or spindle and your bit, not a generic preset.</p></div>
</div>
<p style="margin-top:28px"><a href="${href("/compare/")}" style="font-weight:600">See how CarvCAM compares to Easel, gSender, Carbide Create and VCarve →</a></p>
</div></section>

<section class="soft"><div class="wrap">
<div class="sec-head"><span class="eyebrow">Download</span><h2>Available for Windows today</h2></div>
<div class="plat">
<div class="on"><b>Windows</b>Windows 10 and 11. <a href="${href(site.download)}" style="font-weight:600">Download →</a></div>
<div><b>macOS</b>In development.</div>
<div><b>Linux</b>In development.</div>
</div></div></section>

<section><div class="narrow faq">
<div class="sec-head"><span class="eyebrow">Questions</span><h2>Before you download</h2></div>
${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}
</div></section>

<section class="final rule"><div class="wrap">
<h2>Your next sign is one app away.</h2>
<p class="lede">Download CarvCAM, pick your machine, and carve your first sign tonight.</p>
${downloadCta(true)}
</div></section>`,
  });
}

/* ---------------- Download ---------------- */
function download() {
  layout({
    path: at("/download/"),
    title: "Download CarvCAM for Windows | CNC Software for LongMill & AltMill",
    description: "Download CarvCAM for Windows 10 and 11. Design, prepare and carve on Sienci LongMill and AltMill machines. Mac and Linux versions are in development.",
    crumbs: [["Home", "/"], ["Download", "/download/"]],
    schema: [app],
    body: `<section class="article"><div class="narrow">
<h1>Download CarvCAM</h1>
<p class="lede">Windows today. Mac and Linux are in development.</p>
<div class="plat" id="windows" style="margin-top:32px">
<div class="on"><b>Windows</b><p class="note" style="margin:6px 0 14px">Windows 10 and 11, 64-bit</p><a class="btn btn--accent" href="${site.installer}">${ICON_WIN}Download for Windows</a></div>
<div><b>macOS</b><p class="note" style="margin:6px 0 0">In development</p></div>
<div><b>Linux</b><p class="note" style="margin:6px 0 0">In development</p></div>
</div>
<div class="prose">
<h2>Install in three steps</h2>
<ol class="howto">
<li><h3>Run the installer</h3><p>Open the downloaded file and follow the prompts.</p></li>
<li><h3>Open CarvCAM</h3><p>It opens with a short loading screen. After the first start it works without internet.</p></li>
<li><h3>Pick your machine</h3><p>Choose your LongMill or AltMill, what spins the bit and the bits you own. Then follow <a href="${href("/learn/connect-a-longmill-or-altmill/")}">Connect your machine</a>.</p></li>
</ol>
<div class="callout">Close gSender or any other program connected to your machine before connecting CarvCAM. Only one program can use the connection at a time.</div>
</div></div></section>`,
  });
}

/* ---------------- Machines ---------------- */
function machinePages() {
  layout({
    path: at("/machines/"),
    title: "CarvCAM Machines: LongMill MK2, LongMill MK3 and AltMill",
    description: "CarvCAM supports Sienci Labs LongMill MK2, LongMill MK3 and AltMill CNC routers, with their controllers, routers and spindle kits.",
    crumbs: [["Home", "/"], ["Machines", "/machines/"]],
    body: `<section class="article"><div class="wrap"><h1>Machines</h1><p class="lede" style="max-width:640px">CarvCAM is made for Sienci Labs CNC routers. Pick yours to see the wiring, the presets and your first project.</p></div></section>
<section style="padding-top:24px"><div class="wrap"><div class="mach">${machines.map((m) => `<a class="card" href="${href(`/machines/${m.slug}/`)}"><div class="card__img"><img src="${asset(`/assets/screens/${m.shot}-800.webp`)}" alt="" loading="lazy" width="800" height="500"></div><span class="eyebrow">${m.status}</span><h3>${m.name}</h3><p>${m.sizes} · ${m.controller}</p><span class="more">${m.name} software</span></a>`).join("")}</div></div></section>`,
  });
  for (const m of machines) {
    const others = machines.filter((x) => x !== m);
    layout({
      path: at(`/machines/${m.slug}/`),
      title: `${m.title} | CarvCAM`,
      description: m.description,
      crumbs: [["Home", "/"], ["Machines", "/machines/"], [m.name, `/machines/${m.slug}/`]],
      schema: [app, faqLd([[`What software do I need for the ${m.name}?`, `CarvCAM covers design, toolpaths and machine control for the ${m.name} in one app on Windows.`], [`Does CarvCAM work with the ${m.controller}?`, `Yes. CarvCAM connects to the ${m.controller} over ${m.link}.`]])],
      body: `<section class="article"><div class="wrap">
<span class="eyebrow">${m.status} · ${m.sizes}</span>
<h1 style="margin-top:12px;max-width:900px">${esc(m.name)} software: design, carve and control in one app</h1>
<p class="lede" style="max-width:680px">${esc(m.intro)}</p>
${downloadCta()}
</div></section>
<section style="padding-top:8px"><div class="wrap">
<div class="tablewrap"><table class="cmp"><tbody>
<tr><td>Work area</td><td>${m.work}</td></tr>
<tr><td>Controller</td><td>${m.controller}</td></tr>
<tr><td>Connection</td><td>${m.link}</td></tr>
<tr><td>Spins the bit</td><td>${m.head}</td></tr>
</tbody></table></div>
</div></section>
<section class="soft"><div class="wrap frow">
<div class="frow__copy"><span class="eyebrow">Wiring</span><h3>Connect your ${m.name} in four checks</h3><ol class="howto" style="margin-top:20px">${m.wiring.map((w) => `<li><p>${esc(w)}</p></li>`).join("")}</ol></div>
${shot(m.shot, `Connect wizard for the ${m.name}`)}
</div></section>
<section><div class="wrap">
<div class="sec-head"><span class="eyebrow">Ready on day one</span><h2>Already set for your ${m.name}</h2></div>
<ul class="ticks" style="max-width:640px">${m.presets.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
</div></section>
<section class="soft"><div class="wrap">
<div class="sec-head"><span class="eyebrow">First projects</span><h2>Step-by-step guides</h2></div>
<div class="grid grid--3">${howtos.slice(0, 3).map(howCard).join("")}</div>
<p style="margin-top:28px">Other machines: ${others.map((o) => `<a href="${href(`/machines/${o.slug}/`)}">${o.name}</a>`).join(" · ")} · <a href="${href("/best-cnc-software-for-longmill/")}">Best CNC software for LongMill</a></p>
</div></section>
${finalCta()}`,
    });
  }
}

const howCard = (h) => `<a class="card" href="${href(`/learn/${h.slug}/`)}"><div class="card__img"><img src="${asset(`/assets/screens/${h.steps[0][2]}-800.webp`)}" alt="" loading="lazy" width="800" height="500"></div><span class="eyebrow">Guide · ${h.steps.length} steps</span><h3>${esc(h.short)}</h3><p>${esc(h.description)}</p><span class="more">Read the guide</span></a>`;
const featCard = (f) => `<a class="card" href="${href(`/features/${f.slug}/`)}"><div class="card__img"><img src="${asset(`/assets/screens/${f.shot}-800.webp`)}" alt="" loading="lazy" width="800" height="500"></div><h3>${esc(f.name)}</h3><p>${esc(f.lead)}</p><span class="more">Learn more</span></a>`;
const finalCta = () => `<section class="final rule"><div class="wrap"><h2>From blank board to finished sign.</h2><p class="lede">One app for your LongMill or AltMill.</p>${downloadCta(true)}</div></section>`;

/* ---------------- Features ---------------- */
function featurePages() {
  layout({
    path: at("/features/"),
    title: "CarvCAM Features: Sign Design, V-Carve, Feeds & Speeds, Machine Control",
    description: "Everything CarvCAM does, from sign design and V-carving to automatic feeds and speeds, guided wiring, touch plate zero, simulation and carving.",
    crumbs: [["Home", "/"], ["Features", "/features/"]],
    body: `<section class="article"><div class="wrap"><h1>Features</h1><p class="lede" style="max-width:640px">Everything between an idea and a carved piece, in one app.</p></div></section>
<section style="padding-top:24px"><div class="wrap"><div class="grid grid--3">${features.map(featCard).join("")}</div></div></section>${finalCta()}`,
  });
  for (const f of features) {
    const related = features.filter((x) => x !== f).slice(0, 3);
    const guides = howtos.filter((h) => h.related.includes(f.slug));
    layout({
      path: at(`/features/${f.slug}/`),
      title: `${f.title} | CarvCAM`,
      description: f.description,
      crumbs: [["Home", "/"], ["Features", "/features/"], [f.name, `/features/${f.slug}/`]],
      schema: [app],
      body: `<section class="article"><div class="wrap">
<span class="eyebrow">Feature</span>
<h1 style="margin-top:12px;max-width:900px">${esc(f.title)}</h1>
<p class="lede" style="max-width:680px">${esc(f.lead)}</p>
${downloadCta()}
${shot(f.shot, `${f.name} in CarvCAM`)}
</div></section>
<section style="padding-top:24px"><div class="wrap frow">
<div class="frow__copy"><span class="eyebrow">What it does</span><h3>${esc(f.name)}, done for you</h3><ul class="ticks">${f.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>
<div class="card"><span class="eyebrow">Works on</span><h3>Your Sienci machine</h3><p>${machines.map((m) => `<a href="${href(`/machines/${m.slug}/`)}">${m.name}</a>`).join(" · ")}</p>${guides.length ? `<span class="eyebrow" style="margin-top:12px">Guides</span><p>${guides.map((g) => `<a href="${href(`/learn/${g.slug}/`)}">${esc(g.short)}</a>`).join("<br>")}</p>` : ""}</div>
</div></section>
<section class="soft"><div class="wrap"><div class="sec-head"><span class="eyebrow">More features</span><h2>Part of one workflow</h2></div><div class="grid grid--3">${related.map(featCard).join("")}</div></div></section>
${finalCta()}`,
    });
  }
}

/* ---------------- Compare ---------------- */
function comparePages() {
  layout({
    path: at("/compare/"),
    title: "CarvCAM vs Easel, gSender, Carbide Create and VCarve",
    description: "Honest comparisons of CarvCAM with Easel, gSender, Carbide Create and VCarve for LongMill and AltMill owners, including where each one is stronger.",
    crumbs: [["Home", "/"], ["Compare", "/compare/"]],
    body: `<section class="article"><div class="wrap"><h1>Compare</h1><p class="lede" style="max-width:680px">Plain comparisons for LongMill and AltMill owners, including where the other tool is the better pick. Facts checked against each product's own site, ${site.checked}.</p></div></section>
<section style="padding-top:24px"><div class="wrap"><div class="grid grid--2">${competitors.map((c) => `<a class="card" href="${href(`/compare/carvcam-vs-${c.slug}/`)}"><span class="eyebrow">Comparison</span><h3>CarvCAM vs ${c.name}</h3><p>${esc(c.summary)}</p><span class="more">Read the comparison</span></a>`).join("")}</div>
<p style="margin-top:28px"><a href="${href("/best-cnc-software-for-longmill/")}" style="font-weight:600">Best CNC software for LongMill and AltMill →</a></p></div></section>`,
  });
  for (const c of competitors) {
    layout({
      path: at(`/compare/carvcam-vs-${c.slug}/`),
      title: `${c.title} | CarvCAM`,
      description: c.description,
      crumbs: [["Home", "/"], ["Compare", "/compare/"], [`CarvCAM vs ${c.name}`, `/compare/carvcam-vs-${c.slug}/`]],
      schema: [{ "@context": "https://schema.org", "@type": "Article", headline: c.title, description: c.description, dateModified: "2026-10-27", author: { "@type": "Organization", name: "CarvCAM" } }],
      body: `<section class="article"><div class="narrow">
<span class="eyebrow">Comparison · Checked ${site.checked}</span>
<h1 style="margin-top:12px">CarvCAM vs ${esc(c.name)}</h1>
<p class="lede">${esc(c.summary)}</p>
</div></section>
<section style="padding-top:8px"><div class="narrow">
<div class="tablewrap"><table class="cmp"><thead><tr><th></th><th class="us">CarvCAM</th><th>${esc(c.name)}</th></tr></thead><tbody>
${c.rows.map(([k, a, b]) => `<tr><td>${esc(k)}</td><td class="us">${cell(a)}</td><td>${cell(b)}</td></tr>`).join("")}
</tbody></table></div>
<div class="prose">
<h2>Where ${esc(c.name)} is stronger</h2><p>${esc(c.strongerThere)}</p>
<h2>Where CarvCAM is stronger</h2><ul><li>Design, toolpaths and machine control in one desktop app that works offline.</li><li>A wiring map and a real connection test for your exact LongMill or AltMill.</li><li>Feeds and speeds set for your Sienci machine, router or spindle and bit.</li><li>Guided homing, touch plate zero, bit changes and alarm recovery.</li></ul>
<h2>Which one should you pick?</h2><p>${esc(c.verdict)}</p>
<p class="note">Sources: ${c.sources.map(([n, u]) => `<a href="${u}" rel="nofollow noopener">${esc(n)}</a>`).join(", ")}. Checked ${site.checked}. Product details change; check the vendor's site for current terms.</p>
</div>
<p style="margin-top:32px">More comparisons: ${competitors.filter((x) => x !== c).map((x) => `<a href="${href(`/compare/carvcam-vs-${x.slug}/`)}">vs ${x.name}</a>`).join(" · ")}</p>
</div></section>
${finalCta()}`,
    });
  }
  // Página-hub comercial ("best software for LongMill").
  layout({
    path: at("/best-cnc-software-for-longmill/"),
    title: "Best CNC Software for LongMill and AltMill (2026 Guide)",
    description: "What software a LongMill or AltMill needs, explained simply: design, CAM and sender, the popular options, and when one app for everything makes sense.",
    crumbs: [["Home", "/"], ["Best CNC software for LongMill", "/best-cnc-software-for-longmill/"]],
    schema: [{ "@context": "https://schema.org", "@type": "Article", headline: "Best CNC Software for LongMill and AltMill", dateModified: "2026-10-27", author: { "@type": "Organization", name: "CarvCAM" } }],
    body: `<section class="article"><div class="narrow">
<span class="eyebrow">Guide · Updated ${site.checked}</span>
<h1 style="margin-top:12px">Best CNC software for LongMill and AltMill</h1>
<p class="lede">Every CNC job needs three things: a design, toolpaths (CAM) and a program that runs the machine (a sender). You can use three programs, or one that does all three.</p>
</div></section>
<section style="padding-top:8px"><div class="narrow prose">
<h2>Quick picks</h2>
<div class="tablewrap"><table class="cmp"><thead><tr><th>Software</th><th>Does</th><th>Best for</th></tr></thead><tbody>
<tr><td class="us">CarvCAM</td><td class="us">Design + CAM + sender, offline</td><td class="us">LongMill and AltMill owners who want one app from idea to carve</td></tr>
<tr><td>gSender</td><td>Sender</td><td>Running G-code you made in another program</td></tr>
<tr><td>Easel</td><td>Design + CAM + sender, in the browser</td><td>Owners of many machine brands who like a browser tool</td></tr>
<tr><td>Carbide Create</td><td>Design + CAM</td><td>Shapeoko owners</td></tr>
<tr><td>VCarve</td><td>Design + CAM</td><td>Advanced sign work, inlays and nesting (Pro)</td></tr>
</tbody></table></div>
<h2>Design, CAM, sender: what each part does</h2>
<p><b>Design</b> is where the shapes and letters are drawn. <b>CAM</b> turns them into the path the bit follows, with depths and speeds. The <b>sender</b> streams that path to the controller and lets you home, zero and pause the machine.</p>
<p>When those are three programs, every change means exporting and importing again, and every mistake hides between them. In CarvCAM they are one: change the text and the toolpaths, time and checks update on the spot.</p>
<h2>How to choose</h2>
<ul><li><b>Just starting out?</b> Pick the option with the fewest moving parts and a guided setup.</li><li><b>Already design elsewhere?</b> Keep your design tool and run files with a sender.</li><li><b>Need 3D or inlays?</b> Look at VCarve Pro or Aspire.</li></ul>
<h2>Comparisons</h2>
<p>${competitors.map((c) => `<a href="${href(`/compare/carvcam-vs-${c.slug}/`)}">CarvCAM vs ${c.name}</a>`).join(" · ")}</p>
<h2>Guides for your machine</h2>
<p>${machines.map((m) => `<a href="${href(`/machines/${m.slug}/`)}">${m.name} software</a>`).join(" · ")}</p>
</div></section>
${finalCta()}`,
  });
}

/* ---------------- Learn ---------------- */
function learnPages() {
  layout({
    path: at("/learn/"),
    title: "Learn CNC with CarvCAM: Step-by-Step Guides for LongMill and AltMill",
    description: "Step-by-step CNC guides with screenshots: make a wooden sign, V-carve a plaque, set work zero with a touch plate, connect your machine and recover from alarms.",
    crumbs: [["Home", "/"], ["Learn", "/learn/"]],
    body: `<section class="article"><div class="wrap"><h1>Learn</h1><p class="lede" style="max-width:640px">Short, step-by-step guides with screenshots. Written for LongMill and AltMill owners.</p></div></section>
<section style="padding-top:24px"><div class="wrap"><div class="grid grid--3">${howtos.map(howCard).join("")}</div></div></section>${finalCta()}`,
  });
  for (const h of howtos) {
    const rel = features.filter((f) => h.related.includes(f.slug));
    layout({
      path: at(`/learn/${h.slug}/`),
      title: `${h.title} | CarvCAM`,
      description: h.description,
      crumbs: [["Home", "/"], ["Learn", "/learn/"], [h.short, `/learn/${h.slug}/`]],
      schema: [{
        "@context": "https://schema.org",
        "@type": "HowTo",
        name: h.title,
        description: h.description,
        totalTime: h.time,
        tool: h.tools.map((t) => ({ "@type": "HowToTool", name: t })),
        step: h.steps.map(([n, t, img], i) => ({ "@type": "HowToStep", position: i + 1, name: n, text: t, image: `${site.url}/assets/screens/${img}.webp` })),
      }],
      body: `<section class="article"><div class="narrow">
<span class="eyebrow">Guide · ${h.steps.length} steps · about ${h.time.replace("PT", "").replace("M", " min")}</span>
<h1 style="margin-top:12px">${esc(h.title)}</h1>
<p class="lede">${esc(h.description)}</p>
</div></section>
<section style="padding-top:8px"><div class="narrow prose">
<div class="callout"><b>You'll need:</b> ${h.tools.map(esc).join(" · ")}</div>
<ol class="howto">${h.steps.map(([n, t, img]) => `<li><h3>${esc(n)}</h3><p>${esc(t)}</p>${shot(img, `${n} in CarvCAM`)}</li>`).join("")}</ol>
<div class="related"><h2>Related</h2><p>${rel.map((f) => `<a href="${href(`/features/${f.slug}/`)}">${esc(f.name)}</a>`).join(" · ")} · ${machines.map((m) => `<a href="${href(`/machines/${m.slug}/`)}">${m.name}</a>`).join(" · ")}</p>
<p>More guides: ${howtos.filter((x) => x !== h).map((x) => `<a href="${href(`/learn/${x.slug}/`)}">${esc(x.short)}</a>`).join(" · ")}</p></div>
</div></section>
${finalCta()}`,
    });
  }
}

/* ---------------- Docs ---------------- */
// Texto dos docs: escapa e depois aplica **negrito**, `código` e [link](/caminho/).
const md = (t) =>
  esc(t)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[(.+?)\]\((.+?)\)/g, (_, a, u) => `<a href="${href(u)}">${a}</a>`);
const slugify = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const docOrder = docSections.flatMap((sec) => sec.pages.map((slug) => ({ slug, section: sec.name, ...docs[slug] })));
const docUrl = (slug) => `/docs/${slug}/`;
const plain = (t) => t.replace(/\*\*|`/g, "").replace(/\[(.+?)\]\(.+?\)/g, "$1");
const CALLOUT_ICON = { tip: "✓", note: "i", warn: "!" };
const CALLOUT_LABEL = { tip: "Tip", note: "Note", warn: "Warning" };

function machineBlocks(m, d) {
  return [
    ["table", ["", m.name], [["Work area", m.work], ["Controller", m.controller], ["Connection", m.link], ["Spins the bit", m.head]]],
    ["h2", "Wire it in this order"],
    ["steps", m.wiring.map((w, i) => [d.wiringTitles[i], w, null])],
    ["shot", ...d.shot],
    ["h2", "Ready on day one"],
    ["list", m.presets],
    ["cards", [["Connect wizard", "Every step of the wizard, explained.", "/docs/connect/"], ["USB or Ethernet", "Which cable to use.", "/docs/usb-or-ethernet/"], [`${m.name} overview`, "Specs, presets and guides.", `/machines/${m.slug}/`]]],
  ];
}

function docBlock(b, d) {
  const [type, ...a] = b;
  switch (type) {
    case "p":
      return `<p>${md(a[0])}</p>`;
    case "h2":
      return `<h2 id="${slugify(a[0])}">${esc(a[0])}</h2>`;
    case "list":
      return `<ul class="ticks">${a[0].map((x) => `<li>${md(x)}</li>`).join("")}</ul>`;
    case "checklist":
      return `<ul class="dchecks">${a[0].map((x) => `<li><label><input type="checkbox"> <span>${md(x)}</span></label></li>`).join("")}</ul>`;
    case "steps":
      return `<ol class="dsteps">${a[0].map(([t, x, img]) => `<li><h3 id="${slugify(t)}">${esc(t)}</h3><p>${md(x)}</p>${img ? shot(img, `${t} in CarvCAM`, { cls: "shot dshot" }) : ""}</li>`).join("")}</ol>`;
    case "callout":
      return `<div class="dcall dcall--${a[0]}" role="note"><span class="dcall__ic" aria-hidden="true">${CALLOUT_ICON[a[0]]}</span><div><b>${esc(a[1])}</b><p>${md(a[2])}</p></div></div>`;
    case "table":
      return `<div class="tablewrap"><table class="dtable"><thead><tr>${a[0].map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${a[1].map((r) => `<tr>${r.map((c) => `<td>${md(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    case "shot":
      return `<figure class="dfig">${shot(a[0], a[1], { cls: "shot dshot" })}<figcaption>${md(a[1])}</figcaption></figure>`;
    case "clip": {
      const name = a[0] === "hero" ? "hero-demo" : `feature-${a[0]}`;
      return `<figure class="dfig"><div class="shot shot--video dshot"><video class="lazyclip" muted loop playsinline preload="none" width="1280" height="800" poster="${asset(`/assets/video/${name}-poster.webp`)}" data-src="${asset(`/assets/video/${name}.mp4`)}" aria-label="${esc(a[1])}"></video></div><figcaption>${md(a[1])}</figcaption></figure>`;
    }
    case "cards":
      return `<div class="dcards">${a[0].map(([t, x, u]) => `<a class="dcard" href="${href(u)}"><b>${esc(t)}</b><span>${md(x).replace(/<\/?a[^>]*>/g, "")}</span></a>`).join("")}</div>`;
    case "qa":
      return `<section class="dqa"><h2 id="${slugify(a[0])}">${esc(a[0])}</h2><p>${md(a[1])}</p></section>`;
    default:
      throw new Error(`docs: unknown block ${type} in ${d.slug}`);
  }
}

const LAZY_CLIPS = `<script>(() => {
  const vids = document.querySelectorAll("video.lazyclip");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    const v = e.target;
    if (e.isIntersecting) { if (!v.src) v.src = v.dataset.src; if (!still) v.play().catch(() => {}); } else v.pause();
  }), { rootMargin: "200px" });
  vids.forEach((v) => io.observe(v));
})();</script>`;

// Busca dos docs: índice pequeno embutido em cada página (funciona sem servidor e offline).
function docSearch(id) {
  const idx = docOrder.map((d) => ({
    t: d.title,
    s: d.section,
    u: href(docUrl(d.slug)),
    x: [d.lead, ...d.blocks.filter((b) => ["h2", "qa", "steps"].includes(b[0])).map((b) => (b[0] === "steps" ? b[1].map((s) => s[0]).join(" ") : b[1]))].map(plain).join(" "),
  }));
  return `<div class="dsearch"><label class="vh" for="${id}">Search the docs</label><input id="${id}" type="search" placeholder="Search the docs" autocomplete="off"><kbd>/</kbd><ul class="dsearch__res" hidden></ul></div>
<script>(() => {
  const idx = ${JSON.stringify(idx)};
  const input = document.getElementById(${JSON.stringify(id)}), res = input.parentNode.querySelector(".dsearch__res");
  const run = () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { res.hidden = true; return; }
    const words = q.split(/\s+/);
    const hits = idx.map((d) => { const t = d.t.toLowerCase(), x = d.x.toLowerCase(); let n = 0; for (const w of words) { if (t.includes(w)) n += 3; else if (x.includes(w)) n += 1; else return null; } return [n, d]; }).filter(Boolean).sort((a, b) => b[0] - a[0]).slice(0, 7);
    res.innerHTML = hits.length ? hits.map(([, d]) => '<li><a href="' + d.u + '"><b>' + d.t + '</b><span>' + d.s + '</span></a></li>').join("") : '<li class="none">No results. Try "zero", "Ethernet" or "alarm".</li>';
    res.hidden = false;
  };
  input.addEventListener("input", run);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { const a = res.querySelector("a"); if (a) location.href = a.href; } if (e.key === "Escape") { input.value = ""; run(); } });
  document.addEventListener("keydown", (e) => { if (e.key === "/" && document.activeElement.tagName !== "INPUT") { e.preventDefault(); input.focus(); } });
})();</script>`;
}

function docSidebar(current) {
  return `<aside class="dside"><details class="dside__menu" open><summary>Docs menu</summary>
${docSearch("dq")}
<nav aria-label="Docs">${docSections.map((sec) => `<div class="dside__sec"><b>${esc(sec.name)}</b><ul>${sec.pages.map((slug) => `<li><a href="${href(docUrl(slug))}"${slug === current ? ' aria-current="page"' : ""}>${esc(docs[slug].nav)}</a></li>`).join("")}</ul></div>`).join("")}</nav>
</details></aside>`;
}

function docPages() {
  // Página inicial dos docs
  layout({
    path: at("/docs/"),
    title: "CarvCAM Docs: Guides for LongMill and AltMill",
    description: "CarvCAM documentation: install, set up your workshop, design, prepare, connect your LongMill or AltMill, set zero and carve. Short step-by-step pages with screenshots.",
    crumbs: [["Home", "/"], ["Docs", "/docs/"]],
    schema: [{ "@context": "https://schema.org", "@type": "CollectionPage", name: "CarvCAM Docs", description: "Step-by-step documentation for CarvCAM.", url: site.url + "/docs/" }],
    body: `<section class="dhome"><div class="wrap">
<span class="eyebrow">Docs</span>
<h1>How can we help?</h1>
<p class="lede">Short, step-by-step pages for every part of CarvCAM, from installing it to the last pass.</p>
${docSearch("dqh")}
<div class="dhome__quick">
<a class="dquick dquick--main" href="${href(docUrl("quickstart"))}"><span class="eyebrow">Start here</span><b>Quickstart: carve your first sign</b><span>Five steps, about 15 minutes of setup.</span></a>
<a class="dquick" href="${href(docUrl("connect"))}"><span class="eyebrow">Most read</span><b>Connect your machine</b><span>Cables, USB or Ethernet, and the real test.</span></a>
<a class="dquick" href="${href(docUrl("troubleshooting"))}"><span class="eyebrow">Fix it</span><b>Troubleshooting</b><span>The most common problems, solved.</span></a>
</div>
</div></section>
<section style="padding-top:16px"><div class="wrap"><div class="dhome__grid">${docSections
      .map(
        (sec) => `<div class="dsec"><h2>${esc(sec.name)}</h2><ul>${sec.pages.map((slug) => `<li><a href="${href(docUrl(slug))}"><b>${esc(docs[slug].title)}</b><span>${esc(docs[slug].lead.length > 110 ? docs[slug].lead.slice(0, docs[slug].lead.lastIndexOf(" ", 107)) + "…" : plain(docs[slug].lead))}</span></a></li>`).join("")}</ul></div>`,
      )
      .join("")}</div>
<p class="note" style="margin-top:36px">Looking for project ideas instead? See the <a href="${href("/learn/")}">guides</a>.</p>
</div></section>${finalCta()}`,
  });

  docOrder.forEach((d, i) => {
    const m = d.machine ? machines.find((x) => x.slug === d.machine) : null;
    const blocks = m ? [...machineBlocks(m, d).slice(0, 4), ...d.blocks, ...machineBlocks(m, d).slice(4)] : d.blocks;
    const dd = { ...d, blocks };
    const content = blocks.map((b) => docBlock(b, dd)).join("\n");
    const toc = blocks.filter((b) => b[0] === "h2" || b[0] === "qa").map((b) => b[1]);
    const steps = blocks.filter((b) => b[0] === "steps").flatMap((b) => b[1]);
    const prev = docOrder[i - 1], next = docOrder[i + 1];
    const path = docUrl(d.slug);
    const schema = [{ "@context": "https://schema.org", "@type": "TechArticle", headline: d.title, description: d.description, dateModified: "2026-10-27", author: { "@type": "Organization", name: "CarvCAM" }, about: { "@type": "SoftwareApplication", name: "CarvCAM" } }];
    if (d.howto) schema.push({ "@context": "https://schema.org", "@type": "HowTo", name: d.title, description: d.description, totalTime: d.time, step: steps.map(([n, t, img], k) => ({ "@type": "HowToStep", position: k + 1, name: n, text: plain(t), ...(img ? { image: `${site.url}/assets/screens/${img}.webp` } : {}) })) });
    if (d.faq) schema.push(faqLd(blocks.filter((b) => b[0] === "qa").map((b) => [b[1], plain(b[2])])));
    layout({
      path: at(path),
      title: `${d.title} | CarvCAM Docs`,
      description: d.description,
      crumbs: [["Home", "/"], ["Docs", "/docs/"], [d.section, docUrl(docSections.find((s) => s.name === d.section).pages[0])], [d.nav, path]],
      schema,
      body: `<div class="wrap docs">
${docSidebar(d.slug)}
<article class="dmain">
<span class="eyebrow">${esc(d.section)}</span>
<h1>${esc(d.title)}</h1>
<p class="lede">${md(d.lead)}</p>
${steps.length ? `<p class="dmeta">${steps.length} steps${d.time ? ` · about ${d.time.replace("PT", "").replace("M", " min")}` : ""}</p>` : ""}
${content}
<div class="dfoot">
<div class="dhelp"><b>Was this page helpful?</b><span><button type="button" data-v="yes">Yes</button><button type="button" data-v="no">No</button></span><span class="dhelp__thanks" hidden>Thanks for the feedback.</span></div>
<nav class="dpn" aria-label="Previous and next">${prev ? `<a class="dpn__prev" href="${href(docUrl(prev.slug))}"><span>Previous</span><b>${esc(prev.nav)}</b></a>` : "<span></span>"}${next ? `<a class="dpn__next" href="${href(docUrl(next.slug))}"><span>Next</span><b>${esc(next.nav)}</b></a>` : ""}</nav>
</div>
</article>
${toc.length ? `<nav class="dtoc" aria-label="On this page"><b>On this page</b><ul>${toc.map((t) => `<li><a href="#${slugify(t)}">${esc(t)}</a></li>`).join("")}</ul></nav>` : '<div class="dtoc"></div>'}
</div>
${LAZY_CLIPS}
<script>document.querySelectorAll(".dhelp button").forEach((b) => b.addEventListener("click", () => { const h = b.closest(".dhelp"); h.querySelector("span").hidden = true; h.querySelector(".dhelp__thanks").hidden = false; }));
(() => { const links = [...document.querySelectorAll(".dtoc a")]; if (!links.length) return; const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) links.forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#" + e.target.id)); }), { rootMargin: "0px 0px -70% 0px" }); links.forEach((a) => { const t = document.getElementById(a.getAttribute("href").slice(1)); if (t) io.observe(t); }); if (matchMedia("(max-width: 1000px)").matches) document.querySelector(".dside__menu").open = false; })();</script>`,
    });
  });
}

function notFound() {
  layout({ path: at("/404.html"), title: "Page not found | CarvCAM", description: "This page does not exist.", body: `<section class="article"><div class="narrow"><h1>Page not found</h1><p class="lede">Try the <a href="${href("/")}">home page</a> or the <a href="${href("/learn/")}">guides</a>.</p></div></section>` });
}

/* ---------------- write ---------------- */
home();
download();
machinePages();
featurePages();
comparePages();
learnPages();
docPages();
notFound();

await rm(OUT, { recursive: true, force: true });
for (const p of pages) {
  const file = p.path.endsWith(".html") ? join(OUT, p.path) : join(OUT, p.path, "index.html");
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, p.html);
}
await mkdir(join(OUT, "assets"), { recursive: true });
await cp(new URL("./assets/", import.meta.url).pathname, join(OUT, "assets"), { recursive: true });
await cp(new URL("./src/styles.css", import.meta.url).pathname, join(OUT, "assets/site.css"));
const urls = pages.filter((p) => !p.path.endsWith(".html"));
await writeFile(join(OUT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((p) => `<url><loc>${site.url}${p.path}</loc><lastmod>2026-10-27</lastmod></url>`).join("\n")}\n</urlset>\n`);
await writeFile(join(OUT, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${site.url}/sitemap.xml\n`);
console.log(`${pages.length} pages → dist/${PREVIEW ? " (preview links)" : ""}`);
