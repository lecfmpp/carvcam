// Gera o site estático em dist/: página inicial, download, hubs e páginas por máquina, recurso,
// comparação e guia, mais sitemap.xml, robots.txt e dados estruturados (JSON-LD).
//   node build.mjs            → links limpos (/features/v-carve/) para publicar
//   node build.mjs --preview  → links para index.html, para abrir sem servidor
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { faq, features, howtos, machines, nav, site } from "./src/data.mjs";
import { comparisons, others, sienciRecs } from "./src/compare.mjs";
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
const ICON_LINUX = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2c-2.2 0-3.6 1.9-3.6 4.5 0 1.3.3 2.3-.6 3.6C6.4 12 5 14 5 16.6c0 .7.1 1.3.4 1.9-.9.4-1.9.9-1.9 1.8 0 1.2 2.2 1.2 3.6 1.4 1 .1 1.8.3 2.6.3.9 0 1.5-.4 2.3-.4s1.4.4 2.3.4c.8 0 1.6-.2 2.6-.3 1.4-.2 3.6-.2 3.6-1.4 0-.9-1-1.4-1.9-1.8.3-.6.4-1.2.4-1.9 0-2.6-1.4-4.6-2.8-6.5-.9-1.3-.6-2.3-.6-3.6C15.6 3.9 14.2 2 12 2Zm-1.6 4.2c.4 0 .7.5.7 1.1s-.3 1.1-.7 1.1-.7-.5-.7-1.1.3-1.1.7-1.1Zm3.2 0c.4 0 .7.5.7 1.1s-.3 1.1-.7 1.1-.7-.5-.7-1.1.3-1.1.7-1.1ZM12 9.4c.9 0 2 .5 2 .9s-1.1 1.1-2 1.1-2-.7-2-1.1.9-.9 2-.9Z"/></svg>`;
const ICON_WIN = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 5.5 10.5 4.5v7H3zM11.5 4.4 21 3v8.5h-9.5zM3 12.5h7.5v7L3 18.5zM11.5 12.5H21V21l-9.5-1.4z"/></svg>`;
const cell = (v) => (v === "yes" ? '<span class="yes">✓ Yes</span>' : v === "no" ? '<span class="no">— No</span>' : v === "part" ? '<span class="part">Partly</span>' : esc(v));

function layout({ path, title, description, body, schema = [], crumbs = null, head = "" }) {
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
<link rel="stylesheet" href="${asset("/assets/site.css")}">${head}
${path.endsWith(".html") ? "" : `<link rel="alternate" type="text/markdown" href="${site.url}${path}index.md" title="Markdown version">`}
${ld.map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join("\n")}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="hdr"><div class="wrap">
<a class="logo" href="${href("/")}" aria-label="CarvCAM home"><img src="${asset("/assets/carvcam-icon.svg")}" alt="" width="28" height="28"><span class="wordmark">Carv<span>CAM</span></span></a>
<nav class="nav" aria-label="Main">${navHtml}</nav>
<a class="btn btn--primary" data-dl="short" href="${site.downloads.windows}">${ICON_WIN}<span>Download</span></a>
</div></header>
<main id="main">
${crumbs ? `<div class="wrap" style="padding-top:28px">${crumbHtml}</div>` : ""}
${body}
</main>
${footer()}
<script>(() => {
  // Botões de download: Windows por padrão; no Linux vira o AppImage; no Mac leva à página de downloads.
  const ua = navigator.userAgent, linux = /Linux/.test(ua) && !/Android|CrOS/.test(ua), mac = /Macintosh|Mac OS X/.test(ua) && !/iPhone|iPad/.test(ua);
  if (!linux && !mac) return;
  const icon = ${JSON.stringify(ICON_LINUX)};
  document.querySelectorAll("a[data-dl]").forEach((a) => {
    const long = a.dataset.dl === "long";
    if (linux) { a.href = ${JSON.stringify(site.downloads.appimage)}; a.querySelector("svg").outerHTML = icon; a.querySelector("span").textContent = long ? "Download for Linux" : "Download"; }
    else { a.href = ${JSON.stringify(href(site.download))}; a.querySelector("span").textContent = long ? "Mac version in development" : "Downloads"; }
  });
})();</script>
</body>
</html>`;
  pages.push({ path, html, title, description, body });
}

/* ---------------- Agent-ready: Markdown de cada página, llms.txt e llms-full.txt ---------------- */
// Converte o corpo (HTML gerado acima, sem cabeçalho/rodapé) em Markdown simples para agentes e LLMs.
function htmlToMd(html, path) {
  const abs = (u) => (/^(https?:|mailto:)/.test(u) ? u : site.url + new URL(u.replace(/index\.html$/, ""), site.url + path).pathname);
  let t = html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<div class="dcall dcall--(\w+)"[^>]*><span[^>]*>[^<]*<\/span><div><b>([\s\S]*?)<\/b><p>([\s\S]*?)<\/p><\/div><\/div>/g, (_, k, a, b) => `\n> **${CALLOUT_LABEL[k]}: ${a}.** ${b}\n`)
    .replace(/<ol class="dsteps">([\s\S]*?)<\/ol>/g, (_, x) => { let n = 0; return x.replace(/<li><h3[^>]*>([\s\S]*?)<\/h3>/g, (_, t) => `\n### ${++n}. ${t}\n`).replace(/<\/?li>/g, ""); })
    .replace(/<(nav|aside) class="(dside|dtoc|dpn)[\s\S]*?<\/\1>/g, "")
    .replace(/<div class="dhelp">[\s\S]*?<\/div>/g, "")
    .replace(/<div class="dsearch">[\s\S]*?<\/div>/g, "")
    .replace(/<video[^>]*aria-label="([^"]*)"[^>]*>[\s\S]*?<\/video>/g, "\n[Video: $1]\n")
    .replace(/<img [^>]*alt="([^"]+)"[^>]*>/g, "\n[Image: $1]\n")
    .replace(/<img [^>]*>/g, "")
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/g, "\n# $1\n")
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/g, "\n## $1\n")
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/g, "\n### $1\n")
    .replace(/<summary>([\s\S]*?)<\/summary>/g, "\n### $1\n")
    .replace(/<tr>([\s\S]*?)<\/tr>/g, (_, r) => "\n| " + [...r.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => c[1].replace(/\|/g, "/").trim() || " ").join(" | ") + " |")
    .replace(/<\/thead>/g, "\n|---|")
    .replace(/<li[^>]*>/g, "\n- ")
    .replace(/<(b|strong)>([\s\S]*?)<\/\1>/g, "**$2**")
    .replace(/<code>([\s\S]*?)<\/code>/g, "`$1`")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, (_, u, x) => (u.startsWith("#") ? x : `[${x.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}](${abs(u)})`))
    .replace(/<\/(p|div|section|figure|figcaption|ul|ol|table|details)>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  // a linha de cabeçalho da tabela vem antes do |---| com o número certo de colunas
  t = t.replace(/(\n\|[^\n]*\|)\s*\n\|---\|/g, (_, h) => `${h}\n|${" --- |".repeat((h.match(/\|/g).length - 1))}`);
  return t.split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function footer() {
  const col = (t, items) => `<div><h4>${t}</h4><ul>${items.map(([n, u]) => `<li><a href="${href(u)}">${esc(n)}</a></li>`).join("")}</ul></div>`;
  return `<footer class="ftr"><div class="wrap">
<div class="ftr__top">
<div class="ftr__brand"><a class="logo" href="${href("/")}"><img src="${asset("/assets/carvcam-icon.svg")}" alt="" width="28" height="28"><span class="wordmark">Carv<span>CAM</span></span></a><p>Design, prepare and carve on your LongMill or AltMill. One app, start to finished piece.</p></div>
${col("Product", [["How it works", "/#how"], ["Features", "/features/"], ["Download", "/download/"], ["Docs", "/docs/"], ["Quickstart", "/docs/quickstart/"], ["Best software for LongMill", "/best-cnc-software-for-longmill/"]])}
${col("Machines", machines.map((m) => [m.name, `/machines/${m.slug}/`]))}
${col("Compare", comparisons.map((c) => [`CarvCAM vs ${c.name}`, `/compare/carvcam-vs-${c.slug}/`]))}
${col("Learn", howtos.slice(0, 4).map((h) => [h.short, `/learn/${h.slug}/`]))}
</div>
<div class="ftr__legal"><span>© 2026 CarvCAM</span><span>LongMill, AltMill, SuperLongBoard, AutoSpin and gSender are trademarks of Sienci Labs. Other names are trademarks of their owners. CarvCAM is an independent product.</span></div>
</div></footer>`;
}

const downloadCta = (center = false) => `<div class="cta"${center ? ' style="justify-content:center"' : ""}>
<a class="btn btn--accent btn--lg" data-dl="long" href="${site.downloads.windows}">${ICON_WIN}<span>Download for Windows</span></a>
<a class="btn btn--ghost btn--lg" href="${href("/#how")}">See how it works</a>
<span class="note"${center ? ' style="text-align:center"' : ""}>Windows 10 and 11 · <a href="${site.downloads.appimage}" data-dl-alt>Linux</a> · Works offline · Mac in development · <a href="${href(site.download)}">All downloads</a></span>
</div>`;

const app = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "CarvCAM",
  applicationCategory: "DesignApplication",
  operatingSystem: "Windows 10, Windows 11, Linux",
  downloadUrl: site.downloads.windows,
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
    head: `\n<link rel="preload" as="image" href="${asset("/assets/video/hero-demo-poster.webp")}" fetchpriority="high">`,
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
<div class="card"><h3>A wiring check that proves it</h3><p>A map of every cable for your exact controller, over USB or Ethernet, then a real test: the Z moves and the spindle spins.</p></div>
<div class="card"><h3>Numbers for your exact setup</h3><p>Feeds and speeds for your Sienci machine, your router or spindle and your bit, not a generic preset.</p></div>
</div>
<p style="margin-top:28px"><a href="${href("/compare/")}" style="font-weight:600">See how CarvCAM compares to Easel, gSender, Carbide Create, VCarve, Fusion 360 and Carveco →</a></p>
</div></section>

<section class="soft"><div class="wrap">
<div class="sec-head"><span class="eyebrow">Download</span><h2>Available for Windows and Linux</h2></div>
<div class="plat plat--4">
<div class="on"><b>${ICON_WIN} Windows</b>Windows 10 and 11. <a href="${site.downloads.windows}" style="font-weight:600">Download .exe →</a></div>
<div class="on"><b>${ICON_LINUX} Linux</b>Ubuntu, Debian, Mint and others. <a href="${site.downloads.appimage}" style="font-weight:600">AppImage →</a> <a href="${site.downloads.deb}" style="font-weight:600">.deb →</a></div>
<div><b>macOS</b>In development.</div>
<div><b>Raspberry Pi</b>In development.</div>
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
  const btn = (url, icon, label) => `<a class="btn btn--accent" href="${url}">${icon}${label}</a>`;
  layout({
    path: at("/download/"),
    title: "Download CarvCAM for Windows and Linux | CNC Software for LongMill & AltMill",
    description: "Download CarvCAM for Windows 10 and 11 or Linux (AppImage and .deb). Design, prepare and carve on Sienci LongMill and AltMill machines. Mac and Raspberry Pi versions are in development.",
    crumbs: [["Home", "/"], ["Download", "/download/"]],
    schema: [app],
    body: `<section class="article"><div class="narrow">
<h1>Download CarvCAM</h1>
<p class="lede">Windows and Linux today. Mac and Raspberry Pi are in development. Every link downloads the latest version.</p>
<div class="dlcards">
<div class="dlcard on" id="windows"><b>${ICON_WIN} Windows</b><p class="note">Windows 10 and 11, 64-bit</p>${btn(site.downloads.windows, ICON_WIN, "Download for Windows")}<p class="note">CarvCAM-Windows-64Bit.exe</p></div>
<div class="dlcard on" id="linux"><b>${ICON_LINUX} Linux</b><p class="note">64-bit PC: Ubuntu, Debian, Mint, Fedora and others</p>${btn(site.downloads.appimage, ICON_LINUX, "AppImage")} ${btn(site.downloads.deb, ICON_LINUX, ".deb")}<p class="note">.deb for Ubuntu, Debian and Mint · AppImage for any distro</p></div>
<div class="dlcard" id="mac"><b>macOS</b><p class="note">Intel and Apple Silicon</p><p>In development.</p></div>
<div class="dlcard" id="pi"><b>Raspberry Pi</b><p class="note">Pi 4 and 5</p><p>In development.</p></div>
</div>
<div class="prose">
<h2>Install on Windows</h2>
<ol class="howto">
<li><h3>Run the installer</h3><p>Open <b>CarvCAM-Windows-64Bit.exe</b> and follow the prompts. If Windows SmartScreen asks, click <b>More info</b>, then <b>Run anyway</b>.</p></li>
<li><h3>Open CarvCAM</h3><p>From the Start menu or the desktop shortcut. After the first start it works without internet.</p></li>
<li><h3>Pick your machine</h3><p>Choose your LongMill or AltMill, what spins the bit and the bits you own. Then follow <a href="${href("/docs/connect/")}">Connect your machine</a>.</p></li>
</ol>
<h2>Install on Linux</h2>
<ol class="howto">
<li><h3>.deb (Ubuntu, Debian, Mint)</h3><p>Double-click the file, or run <code>sudo apt install ./CarvCAM-Linux-amd64.deb</code>. It also lets your user reach the USB controller, no extra setup.</p></li>
<li><h3>AppImage (any distro)</h3><p>Make it executable with <code>chmod +x CarvCAM-Linux-x86_64.AppImage</code> and open it. For USB, add yourself to the dialout group once: <code>sudo usermod -aG dialout $USER</code>, then log out and back in.</p></li>
</ol>
<div class="callout">Close gSender or any other program connected to your machine before connecting CarvCAM. Only one program can use the connection at a time.</div>
<p class="note">All versions and release notes: <a href="${site.downloads.releases}">GitHub releases</a>.</p>
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
const vsUrl = (c) => `/compare/carvcam-vs-${c.slug}/`;
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
// Título legível a partir do endereço de um fórum ou artigo: "forum.sienci.com: Easel connecting to SLB".
const urlTitle = (u) => {
  try {
    const x = new URL(u);
    if (/youtube\.com|youtu\.be/.test(x.hostname)) return "Video review (YouTube)";
    const seg = x.pathname.split("/").filter((p) => p && !/^\d+$/.test(p) && !/^(t|view|hc|en-us|en-gb|articles|community|posts|blog|td-p|t5)$/.test(p)).pop();
    if (!seg) return host(u);
    const words = decodeURIComponent(seg).replace(/^\d+-/, "").replace(/[-_]+/g, " ").replace(/\.html?$/, "").trim();
    return `${host(u)}: ${words.charAt(0).toUpperCase()}${words.slice(1)}`;
  } catch { return u; }
};
// Citação numerada: cada fonte usada na página vira [n], com a lista no fim.
function citer() {
  const list = [];
  const cite = (url, title) => {
    let i = list.findIndex((x) => x.url === url);
    if (i < 0) i = list.push({ url, title: title || urlTitle(url) }) - 1;
    return `<sup class="cite"><a href="#src-${i + 1}" aria-label="Source ${i + 1}">${i + 1}</a></sup>`;
  };
  return { list, cite };
}
const CARV_FLOW = ["Design in CarvCAM", "Pick a speed (toolpaths and checks are automatic)", "Connect, zero and carve in the same window"];
const flowLane = (name, steps, us) => `<div class="vflow__lane${us ? " us" : ""}"><b class="vflow__name">${esc(name)}</b><ol>${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol><span class="vflow__count">${steps.length} steps${us ? " · 1 app" : ""}</span></div>`;

function comparePages() {
  const checked = "October 27, 2026";
  layout({
    path: at("/compare/"),
    title: "CarvCAM vs Easel, gSender, Carbide Create, VCarve, Fusion 360 and Carveco",
    description: "Side-by-side comparisons of CarvCAM with Easel, gSender, Carbide Create, VCarve, Fusion 360 and Carveco Maker for LongMill and AltMill owners, with prices, limits and sources checked October 2026.",
    crumbs: [["Home", "/"], ["Compare", "/compare/"]],
    schema: [{ "@context": "https://schema.org", "@type": "ItemList", name: "CarvCAM comparisons", itemListElement: comparisons.map((c, i) => ({ "@type": "ListItem", position: i + 1, url: site.url + vsUrl(c), name: `CarvCAM vs ${c.name}` })) }],
    body: `<section class="article"><div class="wrap"><span class="eyebrow">Compare · Checked ${checked}</span><h1 style="margin-top:12px">CarvCAM vs the usual LongMill software</h1><p class="lede" style="max-width:720px">Six honest comparisons for LongMill and AltMill owners, each with prices, limits, what owners report and where the other tool is the better pick. Every fact links to its source.</p></div></section>
<section style="padding-top:8px"><div class="wrap">
<div class="tablewrap"><table class="cmp cmp--matrix"><thead><tr><th></th><th class="us">CarvCAM</th>${comparisons.map((c) => `<th><a href="${href(vsUrl(c))}">${esc(c.name)}</a></th>`).join("")}</tr></thead><tbody>
<tr><td>Design + CAM</td><td class="us">${cell("yes")}</td><td>${cell("yes")}</td><td>${cell("no")}</td><td>${cell("yes")}</td><td>${cell("yes")}</td><td>${cell("yes")}</td><td>${cell("yes")}</td></tr>
<tr><td>Runs a LongMill or AltMill</td><td class="us">${cell("yes")}</td><td>Beta on SLB, USB</td><td>${cell("yes")}</td><td>${cell("no")}</td><td>${cell("no")}</td><td>${cell("no")}</td><td>${cell("no")}</td></tr>
<tr><td>Works offline</td><td class="us">${cell("yes")}</td><td>${cell("no")}</td><td>${cell("yes")}</td><td>${cell("yes")}</td><td>${cell("yes")}</td><td>Limited</td><td>21 days</td></tr>
<tr><td>Free option for a LongMill</td><td class="us">At launch</td><td>1 carve/week</td><td>${cell("yes")}</td><td>No export</td><td>Trial</td><td>Personal use</td><td>Trial</td></tr>
<tr><td>Programs to go from idea to carve</td><td class="us"><b>1</b></td><td>1 (online)</td><td>2–3</td><td>2</td><td>2</td><td>2</td><td>2</td></tr>
</tbody></table></div>
<div class="grid grid--3" style="margin-top:40px">${comparisons.map((c) => `<a class="card" href="${href(vsUrl(c))}"><span class="eyebrow">CarvCAM vs ${esc(c.name)}</span><h3>${esc(c.kicker)}</h3><p>${esc(c.summary)}</p><span class="more">Read the comparison</span></a>`).join("")}</div>
<p style="margin-top:28px"><a href="${href("/best-cnc-software-for-longmill/")}" style="font-weight:600">Best CNC software for LongMill and AltMill →</a></p></div></section>${finalCta()}`,
  });

  for (const c of comparisons) {
    const { list, cite } = citer();
    const toc = [["verdict", "The short answer"], ["glance", "At a glance"], ["workflow", "The workflow"], ["features", "Feature by feature"], ["pricing", "Pricing"], ["see-it", "See CarvCAM"], ["reports", "What owners report"], ["stronger", `Where ${c.name} wins`], ["switch", "Switching"], ["faq", "FAQ"]];
    const allFaq = [...c.faq];
    layout({
      path: at(vsUrl(c)),
      title: `${c.title} | CarvCAM`,
      description: c.description,
      crumbs: [["Home", "/"], ["Compare", "/compare/"], [`CarvCAM vs ${c.name}`, vsUrl(c)]],
      schema: [
        { "@context": "https://schema.org", "@type": "Article", headline: c.title, description: c.description, datePublished: "2026-10-27", dateModified: "2026-10-27", author: { "@type": "Organization", name: "CarvCAM", url: site.url }, publisher: { "@type": "Organization", name: "CarvCAM", url: site.url }, mainEntityOfPage: site.url + vsUrl(c), about: [{ "@type": "SoftwareApplication", name: "CarvCAM", operatingSystem: "Windows" }, { "@type": "SoftwareApplication", name: c.name, publisher: c.maker }], citation: c.sources.map((s) => s.url) },
        faqLd(allFaq),
      ],
      body: `<section class="vhero"><div class="wrap">
<span class="eyebrow">Comparison · Checked ${checked} · Sources cited</span>
<h1>CarvCAM vs ${esc(c.name)}</h1>
<p class="vhero__kicker">${esc(c.kicker)}</p>
<p class="lede">${esc(c.summary)}</p>
${downloadCta()}
<nav class="vtoc" aria-label="On this page">${toc.map(([id, t]) => `<a href="#${id}">${esc(t)}</a>`).join("")}</nav>
</div></section>

<section id="verdict" class="vsec"><div class="wrap">
<h2>The short answer</h2>
<div class="vpick">
<div class="vpick__col"><span class="eyebrow">Pick ${esc(c.name)} if</span><ul class="ticks">${c.chooseThem.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
<div class="vpick__col us"><span class="eyebrow">Pick CarvCAM if</span><ul class="ticks">${c.chooseUs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
</div></div></section>

<section id="glance" class="vsec soft"><div class="wrap">
<h2>At a glance</h2>
<div class="vglance">${c.glance.map(([k, us, them]) => `<div class="vglance__card"><span class="vglance__k">${esc(k)}</span><div class="vglance__row us"><span>CarvCAM</span><b>${esc(us)}</b></div><div class="vglance__row"><span>${esc(c.name)}</span><b>${esc(them)}</b></div></div>`).join("")}</div>
</div></section>

<section id="workflow" class="vsec"><div class="wrap">
<h2>From idea to carved sign: the workflow</h2>
<p class="lede" style="max-width:720px">${esc(c.workflow.note)}</p>
<div class="vflow">${flowLane(`With ${c.name}`, c.workflow.them, false)}${flowLane("With CarvCAM", CARV_FLOW, true)}</div>
</div></section>

<section id="features" class="vsec"><div class="wrap narrowish">
<h2>Feature by feature</h2>
<div class="tablewrap"><table class="cmp"><thead><tr><th></th><th class="us">CarvCAM</th><th>${esc(c.name)}</th></tr></thead><tbody>
${c.rows.map(([k, a, b]) => `<tr><td>${esc(k)}</td><td class="us">${cell(a)}</td><td>${cell(b)}</td></tr>`).join("")}
</tbody></table></div>
<p class="note" style="margin-top:12px">${esc(c.name)} details from ${c.sources.slice(0, 3).map((s) => cite(s.url, s.title)).join(" ")}. CarvCAM details from the app itself.</p>
</div></section>

<section id="pricing" class="vsec soft"><div class="wrap narrowish">
<h2>${esc(c.name)} pricing in 2026</h2>
<div class="vprice">${c.pricing.map((p) => `<div class="vprice__card"><span class="vprice__plan">${esc(p.plan)}</span><b class="vprice__amt">${esc(p.price)}</b><p>${esc(p.notes)}</p>${p.source ? `<span class="vprice__src">Source ${cite(p.source)}</span>` : ""}</div>`).join("")}</div>
<p class="note" style="margin-top:16px">List prices in USD as shown by the cited source on ${checked}. CarvCAM pricing will be announced at launch.</p>
${c.limits.length ? `<h3 style="margin-top:36px">Limits to know about</h3><ul class="vlimits">${c.limits.map((l) => `<li>${esc(l.text)} ${cite(l.source)}</li>`).join("")}</ul>` : ""}
</div></section>

<section id="see-it" class="vsec"><div class="wrap">
<h2>See it in CarvCAM</h2>
<div class="vclips">${c.clips.map(([scene, cap]) => `<figure>${clip(scene, cap)}<figcaption>${esc(cap)}</figcaption></figure>`).join("")}</div>
</div></section>

<section id="reports" class="vsec soft"><div class="wrap">
<h2>What ${esc(c.name)} users report</h2>
<p class="lede" style="max-width:720px">Paraphrased from public forum threads and reviews, with links. Every tool has rough edges; these are the ones that come up most for Sienci owners.</p>
<div class="vquotes">${c.painPoints.map((q) => `<blockquote class="vquote"><p>${esc(q.text)}</p><footer>${esc(host(q.source))} ${cite(q.source)}</footer></blockquote>`).join("")}</div>
</div></section>

<section id="stronger" class="vsec"><div class="wrap narrowish">
<h2>Where ${esc(c.name)} is the better pick</h2>
<p>We'd rather you pick the right tool than the wrong one. ${esc(c.name)} is genuinely stronger here:</p>
<ul class="ticks">${c.stronger.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
<h2 style="margin-top:48px">Where CarvCAM is stronger</h2>
<ul class="ticks"><li>Design, toolpaths and machine control in one desktop app that works with no internet.</li><li>A wiring map and a real connection test for your exact LongMill or AltMill, over USB or Ethernet.</li><li>Feeds and speeds from Sienci's published speed tables ${cite("https://resources.sienci.com/view/lm-feeds-and-speeds/", "Sienci feeds and speeds")} for your machine, router or spindle and bit.</li><li>Guided homing, touch plate zero, bit changes and alarm recovery, explained on screen.</li></ul>
</div></section>

<section id="switch" class="vsec soft"><div class="wrap narrowish">
<h2>Switching from ${esc(c.name)}</h2>
<ol class="dsteps">${c.switching.map(([t, x]) => `<li><h3>${esc(t)}</h3><p>${esc(x)}</p></li>`).join("")}</ol>
<p>Step by step in the docs: <a href="${href("/docs/quickstart/")}">Quickstart</a> · <a href="${href("/docs/import-and-trace/")}">Import SVG or DXF</a> · <a href="${href("/docs/connect/")}">Connect your machine</a></p>
</div></section>

<section id="faq" class="vsec"><div class="narrow faq">
<h2>Frequently asked questions</h2>
${allFaq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}
</div></section>

<section class="vsec soft"><div class="wrap narrowish">
<h2 style="font-size:22px">Sources and method</h2>
<p class="note">We checked each product's own pricing and feature pages, Sienci Labs' documentation and public forum threads on ${checked}. Prices and plans change; check the vendor's site before you buy. Spotted something out of date? Tell us and we'll fix it.</p>
<ol class="vsrc">${list.map((s, i) => `<li id="src-${i + 1}"><a href="${s.url}" rel="noopener" target="_blank">${esc(s.title)}</a> <span>${esc(host(s.url))}</span></li>`).join("")}</ol>
<p style="margin-top:32px">More comparisons: ${comparisons.filter((x) => x !== c).map((x) => `<a href="${href(vsUrl(x))}">vs ${esc(x.name)}</a>`).join(" · ")} · <a href="${href("/best-cnc-software-for-longmill/")}">Best software for LongMill</a></p>
</div></section>
${finalCta()}`,
    });
  }

  // Página-hub comercial ("best software for LongMill").
  const { list, cite } = citer();
  const pick = (slug) => comparisons.find((c) => c.slug === slug);
  const rec = sienciRecs.find((r) => /most of our customers/.test(r.text));
  layout({
    path: at("/best-cnc-software-for-longmill/"),
    title: "Best CNC Software for LongMill and AltMill (2026 Guide)",
    description: "What software a LongMill or AltMill needs, explained simply: design, CAM and sender. Prices, limits and the best pick for beginners, sign makers and 3D work, checked October 2026.",
    crumbs: [["Home", "/"], ["Best CNC software for LongMill", "/best-cnc-software-for-longmill/"]],
    schema: [
      { "@context": "https://schema.org", "@type": "Article", headline: "Best CNC Software for LongMill and AltMill (2026)", datePublished: "2026-10-27", dateModified: "2026-10-27", author: { "@type": "Organization", name: "CarvCAM" } },
      { "@context": "https://schema.org", "@type": "ItemList", itemListElement: ["CarvCAM", ...comparisons.map((c) => c.name), ...others.map((o) => o.name)].map((n, i) => ({ "@type": "ListItem", position: i + 1, name: n })) },
    ],
    body: `<section class="vhero"><div class="wrap">
<span class="eyebrow">Guide · Updated ${checked}</span>
<h1>Best CNC software for LongMill and AltMill</h1>
<p class="lede">Every CNC job needs three things: a design, toolpaths (CAM) and a program that runs the machine (a sender). You can use three programs, or one that does all three. Here's how the popular options stack up for Sienci owners.</p>
<nav class="vtoc" aria-label="On this page"><a href="#picks">Quick picks</a><a href="#parts">Design, CAM, sender</a><a href="#options">All options</a><a href="#choose">How to choose</a></nav>
</div></section>
<section id="picks" class="vsec"><div class="wrap">
<h2>Quick picks</h2>
<div class="vglance">
<div class="vglance__card"><span class="vglance__k">One app, idea to carve</span><b class="vbig">CarvCAM</b><p>Design, CAM and machine control for LongMill and AltMill, offline.</p></div>
<div class="vglance__card"><span class="vglance__k">Free sender</span><b class="vbig">gSender</b><p>Sienci's own, open source; pair it with a CAM program. ${cite(pick("gsender").sources[0].url, pick("gsender").sources[0].title)}</p></div>
<div class="vglance__card"><span class="vglance__k">Advanced sign CAM</span><b class="vbig">VCarve Pro</b><p>Inlays, nesting, full bed; ~$699 one-time. ${cite(pick("vcarve").sources[0].url, pick("vcarve").sources[0].title)}</p></div>
<div class="vglance__card"><span class="vglance__k">3D parts</span><b class="vbig">Fusion</b><p>Parametric 3D CAD/CAM; free personal use with CAM limits. ${cite(pick("fusion-360").sources[0].url, pick("fusion-360").sources[0].title)}</p></div>
</div>
${rec ? `<p class="note" style="margin-top:20px">Sienci Labs itself notes that most LongMill customers use VCarve Pro or Carveco for CAM and gSender to run the machine ${cite(rec.source, "Sienci LongMill MK3 product page")}. CarvCAM puts those jobs in one app.</p>` : ""}
</div></section>
<section id="parts" class="vsec soft"><div class="wrap narrowish">
<h2>Design, CAM, sender: what each part does</h2>
<div class="vflow">${flowLane("The usual toolchain", ["Design (CAD): draw the shapes and letters", "CAM: turn them into toolpaths with depths and speeds, then export G-code", "Sender: stream the G-code, home, zero and pause"], false)}${flowLane("CarvCAM", CARV_FLOW, true)}</div>
<p style="margin-top:24px">When those are three programs, every change means exporting and importing again, and mistakes hide between them: a wrong post-processor, a zero that doesn't match, a file in inches instead of millimeters. In one app, change the text and the toolpaths, time and checks update on the spot.</p>
</div></section>
<section id="options" class="vsec"><div class="wrap">
<h2>All the options, compared</h2>
<div class="tablewrap"><table class="cmp"><thead><tr><th>Software</th><th>Does</th><th>Price</th><th>Platforms</th><th>Best for</th></tr></thead><tbody>
<tr><td class="us">CarvCAM</td><td class="us">Design + CAM + sender, offline</td><td class="us">At launch</td><td class="us">Windows, Linux (Mac in development)</td><td class="us">LongMill and AltMill owners who want one app</td></tr>
${comparisons.map((c) => `<tr><td><a href="${href(vsUrl(c))}">${esc(c.name)}</a></td><td>${esc(c.type.split(";")[0].split(" (")[0])}</td><td>${esc(c.pricing[0].price)}${c.pricing[1] ? ` · ${esc(c.pricing[1].price)}` : ""} ${cite(c.pricing[0].source || c.sources[0].url)}</td><td>${esc(c.platformsShort)}</td><td>${esc(c.chooseThem[0])}</td></tr>`).join("")}
${others.map((o) => `<tr><td>${esc(o.name)}</td><td>${esc(o.type.split(" (")[0])}</td><td>${esc(o.price)} ${cite(o.source.url, o.source.title)}</td><td>${esc(o.platforms.split(" (")[0])}</td><td>Free or low-cost option</td></tr>`).join("")}
</tbody></table></div>
</div></section>
<section id="choose" class="vsec soft"><div class="wrap narrowish">
<h2>How to choose</h2>
<ul class="ticks"><li><span><b>Just starting out?</b> Pick the option with the fewest moving parts and a guided setup. Fewer programs means fewer places for a mismatch.</span></li><li><span><b>Already design elsewhere?</b> Keep your design tool and run files with gSender.</span></li><li><span><b>Signs, plaques, engraving?</b> CarvCAM, VCarve or Carveco.</span></li><li><span><b>Need 3D reliefs, inlays or nesting?</b> VCarve Pro, Aspire or Carveco Maker Plus.</span></li><li><span><b>Mechanical parts and furniture?</b> Fusion.</span></li></ul>
<h2 style="margin-top:48px">Comparisons</h2>
<div class="grid grid--3">${comparisons.map((c) => `<a class="card" href="${href(vsUrl(c))}"><span class="eyebrow">Comparison</span><h3>CarvCAM vs ${esc(c.name)}</h3><p>${esc(c.kicker)}</p><span class="more">Read it</span></a>`).join("")}</div>
<h2 style="margin-top:48px">Sources</h2>
<ol class="vsrc">${list.map((s, i) => `<li id="src-${i + 1}"><a href="${s.url}" rel="noopener" target="_blank">${esc(s.title)}</a> <span>${esc(host(s.url))}</span></li>`).join("")}</ol>
<p style="margin-top:24px">Guides for your machine: ${machines.map((m) => `<a href="${href(`/machines/${m.slug}/`)}">${m.name} software</a>`).join(" · ")}</p>
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
// Markdown de cada página + índices para agentes
const mdPages = urls.map((p) => ({ ...p, md: `# ${p.title}\n\n> ${p.description}\n\nSource: ${site.url}${p.path}\n\n${htmlToMd(p.body, p.path)}\n` }));
for (const p of mdPages) await writeFile(join(OUT, p.path, "index.md"), p.md);
const group = (pre) => mdPages.filter((p) => p.path.startsWith(pre));
const line = (p) => `- [${p.title.replace(/ \| CarvCAM( Docs)?$/, "")}](${site.url}${p.path}index.md): ${p.description}`;
await writeFile(
  join(OUT, "llms.txt"),
  `# CarvCAM

> CarvCAM is a desktop app for Windows and Linux, for Sienci Labs LongMill and AltMill CNC routers that does sign design, CAM (toolpaths with feeds and speeds tuned to the machine, router or spindle and bit) and machine control (connects over USB or Ethernet, guided wiring check, homing, touch-plate zero, carving) in one app that works offline. Mac and Raspberry Pi versions are in development.

Every page is also available as Markdown by adding \`index.md\` to its URL. The full documentation in one file: ${site.url}/llms-full.txt

## Docs
${group("/docs/").map(line).join("\n")}

## Product
${[...group("/features/"), ...group("/machines/"), ...group("/download/")].map(line).join("\n")}

## Comparisons
${[...group("/compare/"), ...group("/best-cnc-software")].map(line).join("\n")}

## Guides
${group("/learn/").map(line).join("\n")}

## Optional
- [Home](${site.url}/index.md): ${mdPages.find((p) => p.path === "/").description}
`,
);
await writeFile(join(OUT, "llms-full.txt"), [...group("/docs/"), ...group("/compare/"), ...group("/learn/")].map((p) => p.md).join("\n\n---\n\n"));
// Robôs: tudo liberado, inclusive crawlers de IA e agentes de busca.
const bots = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User", "Claude-SearchBot", "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "CCBot", "Amazonbot", "Bingbot", "DuckAssistBot", "meta-externalagent", "MistralAI-User"];
await writeFile(join(OUT, "robots.txt"), `User-agent: *\nAllow: /\n\n${bots.map((b) => `User-agent: ${b}`).join("\n")}\nAllow: /\n\n# Para agentes e LLMs: ${site.url}/llms.txt\nSitemap: ${site.url}/sitemap.xml\n`);
console.log(`${pages.length} pages → dist/${PREVIEW ? " (preview links)" : ""}`);
