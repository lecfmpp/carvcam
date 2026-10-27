// Pricing page: Free, Pro (yearly with a 14-day trial, or lifetime) and School / Makerspace.
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
      "SVG and DXF import, tracing and image to vector",
      "Sienci catalog: machines, heads and 15 bits",
      "Feeds and speeds from the official Sienci table",
      "Manufacturability checks, verifier and 2D/3D simulation",
      "G-code download with no limit on cuts",
      "Works offline, panel mode for gController",
      "AI assistant with your own API key",
    ],
  },
  pro: {
    name: "Pro",
    price: "$69",
    per: "per year",
    alt: "or $179 once for lifetime",
    lead: "For makers who cut often, sell what they make, or want to go beyond 2.5D.",
    points: [
      "Batch production: a list of names becomes 50 signs (CSV)",
      "Cost and selling price calculator",
      "Inlays (two-part V-carve fit)",
      "Several parts on one board, with material nesting",
      "Cloud projects and sync with the web and gController",
      "Hosted AI assistant (no key needed)",
      "Tiling for parts larger than your machine",
      "3D and STL, when available",
    ],
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
  ["Is CarvCAM really free?", "Yes. Design, V-carve, the Sienci catalog, the verifier, simulation and G-code export are free with no limit on cuts. Pro adds production tools for people who sell what they make."],
  ["How does the 14-day trial work?", "Start Pro yearly and every Pro feature is unlocked for 14 days. You add a card at checkout, you are charged $69 only when the trial ends, and you can cancel any time before that from your account page."],
  ["What does lifetime mean?", "One payment of $179 unlocks Pro for as long as CarvCAM exists, including future Pro updates. No renewal."],
  ["Are all Pro tools ready today?", "Not yet. CarvCAM is new and the Pro tools ship one by one, starting with batch production and the cost calculator. Your trial and subscription include each one as it lands, and you can cancel any time if what you need isn't there yet."],
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
    description: "CarvCAM is free for design, V-carving, simulation and G-code with no limit on cuts. Pro adds batch production, cost calculator, inlays and nesting for $69 a year or $179 lifetime, with a 14-day free trial.",
    crumbs: [["Home", "/"], ["Pricing", "/pricing/"]],
    schema: [offers, faqLd],
    body: `<section class="pricing" data-account="pricing">
<div class="wrap">
<div class="sec-head" style="text-align:center"><span class="eyebrow">Pricing</span><h1>Design, check and carve for free.</h1><p class="lede">Pay only when CarvCAM starts making you money: batch orders, pricing your jobs, inlays and nesting.</p></div>
<div class="plans">
<article class="plan"><h2>${free.name}</h2><p class="plan__price"><b>${free.price}</b> <span>${free.per}</span></p><p class="plan__lead">${esc(free.lead)}</p>
<a class="btn btn--block plan__second" href="${href("/download/")}">Download free</a>${list(free.points)}</article>
<article class="plan plan--pro"><span class="plan__badge">14-day free trial</span><h2>${pro.name}</h2><p class="plan__price"><b>${pro.price}</b> <span>${pro.per}</span></p><p class="plan__alt">${esc(pro.alt)}</p><p class="plan__lead">${esc(pro.lead)}</p>
<button type="button" class="btn btn--primary btn--block" data-plan="pro_yearly">Start free trial</button>
<button type="button" class="btn btn--block plan__second" data-plan="pro_lifetime">Buy lifetime · $179</button>${list(["Everything in Free, plus:", ...pro.points])}</article>
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
