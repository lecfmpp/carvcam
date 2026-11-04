// Pricing page: Free, Pro (yearly or lifetime; every new account gets 7 days of Pro, no card) and School / Makerspace.
// Buttons start Stripe Checkout through assets/js/account.js; prices live in Stripe (lookup keys).
import { supabase } from "./data.mjs";

export const plans = {
  free: {
    name: "Free",
    price: "$0",
    per: "forever",
    lead: "Everything you need to go from an idea to a safe first cut.",
    points: [
      "Full 2.5D design: text (straight and on an arc), shapes, pen, offset, booleans",
      "V-carve and hatch fill",
      "The complete Sienci library: every LongMill and AltMill, router and spindle, and all 38 Sienci bits with photos and the set each comes in (21 of them cut 2.5D toolpaths today)",
      "Feeds and speeds from Sienci's official tables, marked Official or Estimated",
      "Manufacturability checks, verifier and 2D/3D simulation",
      "Runs your machine over USB or Ethernet, no post-processor to pick",
      "Or download the G-code for any other sender, with no limit on cuts",
      "Clamp keep-out zones and a printable setup sheet",
      "Up to 3 saved projects",
      "Windows, Mac, Linux and Raspberry Pi; works offline; touch panel mode for the gControl",
    ],
  },
  pro: {
    name: "Pro",
    price: "$69",
    per: "per year",
    alt: "or $179 once for lifetime",
    lead: "For makers who cut often and sell what they make.",
    points: [
      "Import SVG and DXF, and turn photos and logos into carvable shapes",
      "Make copies: a grid of parts, a different name on each",
      "Batch from CSV: a list of names becomes 50 G-code files",
      "Cost and selling price calculator: wood, bit wear, machine time, your rate, fees",
      "Guided V-carve inlays: pocket, plug and glue gap worked out for your V-bit",
      "Unlimited saved projects",
    ],
    coming: ["Cloud projects and sync with the web and the gControl", "Tiling for parts larger than your machine", "3D and STL"],
  },
  school: {
    name: "School / Makerspace",
    price: "$299",
    per: "per year",
    lead: "Pro for one classroom or shared shop, up to 10 seats.",
    points: ["Everything in Pro, for up to 10 people", "One license, no per-student billing", "Pay by card, or by invoice and purchase order"],
  },
};

const rules = [
  ["Safety is never paid", "The verifier, simulation and warnings stay free forever."],
  ["No limit on how often you carve", "No weekly cut cap, unlike Easel's free plan."],
  ["No machine-brand lock", "G-code for your machine, free, unlike Carbide Create Free."],
];

const faq = [
  ["Is CarvCAM really free?", "Yes. Design with text and shapes, V-carve, the full Sienci library, the verifier, simulation, running your machine and G-code export are free with no limit on cuts, and you can keep 3 projects. Pro adds importing artwork, copies, batch, costs, inlays and unlimited projects."],
  ["How does the free trial work?", "Create a free account and every Pro feature is unlocked for 7 days. No card, nothing to cancel: after 7 days you're back on Free and keep your projects. Upgrade any time from your account page."],
  ["What does lifetime mean?", "One payment of $179 unlocks Pro for as long as CarvCAM exists, including future Pro updates. No renewal."],
  ["Are all Pro tools ready today?", "Importing and tracing artwork, copies, batch from CSV, the cost and price calculator, guided inlays and unlimited projects are in the app today. Cloud sync, tiling and 3D are not built yet; your subscription includes each one when it lands, and you can cancel any time if what you need isn't there yet."],
  ["Can I cancel?", "Yes, any time, from Account › Manage billing. Pro stays on until the end of the period you paid for, then your projects stay and you go back to Free."],
  ["Do prices include tax?", "Prices are in US dollars. Sales tax or VAT is added at checkout where it applies."],
  ["Can a school pay by invoice?", "Yes. Write to us with the name of the school and how many seats you need, and we'll send an invoice you can pay by card or bank transfer, net 30."],
];

export function pricingPage({ layout, at, href, asset, esc }) {
  const list = (pts) => `<ul class="ticks">${pts.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`;
  const offers = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "CarvCAM",
    description: "CNC design and carving software for Sienci Labs LongMill and AltMill.",
    brand: { "@type": "Brand", name: "CarvCAM" },
    offers: [
      { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
      { "@type": "Offer", name: "Pro (yearly)", price: "69", priceCurrency: "USD", priceSpecification: { "@type": "UnitPriceSpecification", price: "69", priceCurrency: "USD", billingDuration: "P1Y" } },
      { "@type": "Offer", name: "Pro (lifetime)", price: "179", priceCurrency: "USD" },
      { "@type": "Offer", name: "School / Makerspace (yearly)", price: "299", priceCurrency: "USD" },
    ],
  };
  const faqLd = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) };
  const { free, pro, school } = plans;

  layout({
    path: at("/pricing/"),
    title: "CarvCAM Pricing: Free, Pro $69/year or $179 lifetime",
    description: "CarvCAM is free for design, V-carving, simulation and G-code with no limit on cuts. Pro adds artwork import, copies, batch from CSV, job prices, inlays and unlimited projects for $69 a year or $179 lifetime. Try it free for 7 days, no card.",
    crumbs: [["Home", "/"], ["Pricing", "/pricing/"]],
    schema: [offers, faqLd],
    body: `<section class="pricing" data-account="pricing">
<div class="wrap">
<div class="sec-head" style="text-align:center"><span class="eyebrow">Pricing</span><h1>Design, check and carve for free.</h1><p class="lede">Pay when you need more: your own artwork, copies and batches, job prices, inlays and unlimited projects. Try Pro free for 7 days, no card.</p></div>
<div class="plans">
<article class="plan"><h2>${free.name}</h2><p class="plan__price"><b>${free.price}</b> <span>${free.per}</span></p><p class="plan__lead">${esc(free.lead)}</p>
<a class="btn btn--block plan__second" href="${href("/download/")}">Download free</a>${list(free.points)}</article>
<article class="plan plan--pro"><span class="plan__badge">7 days free · no card</span><h2>${pro.name}</h2><p class="plan__price"><b>${pro.price}</b> <span>${pro.per}</span></p><p class="plan__alt">${esc(pro.alt)}</p><p class="plan__lead">${esc(pro.lead)}</p>
<a class="btn btn--primary btn--block" href="${href("/signup/")}" data-trial>Start 7-day free trial</a>
<button type="button" class="btn btn--block plan__second" data-plan="pro_yearly">Buy yearly · $69</button>
<button type="button" class="btn btn--block plan__second" data-plan="pro_lifetime">Buy lifetime · $179</button>${list(["Everything in Free, plus:", ...pro.points])}<p class="plan__lead" style="margin-top:14px">Coming to Pro, included when they ship:</p>${list(pro.coming)}</article>
<article class="plan"><h2>${esc(school.name)}</h2><p class="plan__price"><b>${school.price}</b> <span>${school.per}</span></p><p class="plan__lead">${esc(school.lead)}</p>
<button type="button" class="btn btn--block" data-plan="school_yearly">Buy for my school</button>
<a class="plan__link" href="mailto:hello@carvcam.com?subject=CarvCAM%20school%20invoice">Need an invoice or PO? Write to us</a>${list(school.points)}</article>
</div>
<p class="auth__msg plans__msg" role="alert" hidden></p>
<div class="rules">${rules.map(([t, d]) => `<div><b>${esc(t)}</b><span>${esc(d)}</span></div>`).join("")}</div>
</div></section>
<section class="faq rule"><div class="narrow"><h2>Questions</h2>${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</div></section>
<script type="application/json" id="sb-config">${JSON.stringify({ url: supabase.url, key: supabase.key, base: href("/") })}</script>
<script type="module" src="${asset("/assets/js/account.js")}"></script>`,
  });
}
