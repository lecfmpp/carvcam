// Privacy policy and terms of service. Plain-language starting points: have them reviewed before launch.
const UPDATED = "October 27, 2026";
const CONTACT = "hello@carvcam.com";

const privacy = [
  ["What we collect", [
    "Account: your name, e-mail address and password (stored as a secure hash by our login provider, Supabase).",
    "Shop profile: the answers you give in onboarding (what you carve, your machine, the software you use and what you want from CarvCAM).",
    "Billing: your plan and its status. Card details are entered on Stripe's checkout page and never reach our servers; Stripe shares with us only what we need to manage your plan (for example the last four digits and the billing country).",
    "The desktop app works offline. Your designs, projects and machine settings stay on your computer unless you turn on a cloud feature.",
  ]],
  ["How we use it", [
    "To run your account, unlock the plan you paid for, send receipts and account e-mails, and answer support requests.",
    "To decide what to build next. Onboarding answers are read in aggregate; we never sell them.",
    "We don't sell personal data and we don't use it for third-party advertising.",
  ]],
  ["Who processes it for us", [
    "Supabase (accounts and database), Stripe (payments, tax and invoices), Netlify (website hosting) and GitHub (app downloads and updates). Each one handles data only to provide its service to us.",
  ]],
  ["Your choices", [
    "You can edit your shop profile at any time from your account page.",
    `To get a copy of your data or delete your account, write to ${CONTACT}. Deleting your account removes your profile and onboarding answers; billing records we must keep by law stay with Stripe.`,
  ]],
  ["Cookies", ["The website stores your login session in your browser so you stay signed in. We don't use advertising cookies."]],
];

const terms = [
  ["The software", [
    "CarvCAM designs toolpaths and sends G-code to CNC machines. You are responsible for checking every job, securing your material, wearing protective equipment and supervising your machine while it runs.",
    "CarvCAM includes checks, warnings and simulation, but no software can catch every mistake. Use it at your own risk.",
  ]],
  ["Plans and payments", [
    "The Free plan has no time limit. Pro is $69 per year or a one-time $179 for lifetime access; School / Makerspace is $299 per year for up to 10 seats. Prices are in US dollars; tax is added at checkout where it applies.",
    "Pro yearly starts with a 14-day free trial. You are charged when the trial ends unless you cancel before then.",
    "Subscriptions renew automatically. You can cancel at any time from Account › Manage billing; Pro stays active until the end of the period you paid for.",
    `If something isn't right, write to ${CONTACT} within 30 days of a charge and we'll make it right, including a refund.`,
    "Lifetime means for as long as CarvCAM is offered, including future Pro updates. A refunded or charged-back lifetime purchase ends Pro access.",
  ]],
  ["Your account", [
    "Keep your password private and use a real e-mail address. You may not use CarvCAM to break the law or to attack our services.",
    "Your designs are yours. We claim no rights over what you create with CarvCAM.",
  ]],
  ["Changes", ["We may update these terms. If a change affects what you pay or what you get, we'll tell you by e-mail before it takes effect."]],
];

export function legalPages({ layout, at, esc }) {
  const page = (path, title, h1, description, sections) =>
    layout({
      path: at(path),
      title,
      description,
      crumbs: [["Home", "/"], [h1, path]],
      body: `<section class="article"><div class="narrow prose"><h1>${esc(h1)}</h1><p class="note">Last updated ${UPDATED}. Questions: <a href="mailto:${CONTACT}">${CONTACT}</a></p>
${sections.map(([h, ps]) => `<h2>${esc(h)}</h2>${ps.map((p) => `<p>${esc(p)}</p>`).join("")}`).join("\n")}</div></section>`,
    });
  page("/privacy/", "Privacy policy | CarvCAM", "Privacy policy", "What CarvCAM collects, why, and how to get a copy or delete your data.", privacy);
  page("/terms/", "Terms of service | CarvCAM", "Terms of service", "The terms for using CarvCAM, its plans, trials, renewals and refunds.", terms);
}
