// Account pages: sign up, log in, reset password, onboarding wizard and the account home.
// Static HTML here; website/assets/js/account.js does the work in the browser through Supabase.
import { supabase } from "./data.mjs";

const chip = (name, value, label, type = "checkbox") =>
  `<label class="chip"><input type="${type}" name="${name}" value="${value}"><span>${label}</span></label>`;
const chips = (name, items, type) => `<div class="chips">${items.map(([v, l]) => chip(name, v, l, type)).join("")}</div>`;

// What they make, in the words CNC woodworkers use.
const PROJECT_TYPES = [
  ["v_carve_signs", "V-carved signs & lettering"],
  ["3d_relief", "3D relief carving"],
  ["inlays", "Inlays (V-carve or pocket)"],
  ["cabinetry", "Cabinetry & furniture parts (sheet goods)"],
  ["cutting_boards", "Cutting boards, trays & charcuterie"],
  ["engraving", "Engraving & personalized gifts"],
  ["toys_puzzles", "Toys, puzzles & games"],
  ["joinery", "Joinery (dovetails, box joints, mortise & tenon)"],
  ["surfacing", "Slab flattening & surfacing"],
  ["profile_cutouts", "Profile cutouts, templates & jigs"],
  ["plastics", "Acrylic & plastics"],
  ["non_ferrous", "Aluminum & non-ferrous metals"],
  ["prototypes", "Prototypes & product parts"],
  ["pcb", "PCB milling"],
];
const PURPOSES = [
  ["hobby", "For myself", "Personal projects, gifts, learning the craft"],
  ["side_business", "Side business", "I sell some of what I carve"],
  ["full_time_business", "Full-time business", "CNC work is how I make a living"],
  ["education", "School or makerspace", "Teaching, shared shop, club"],
];
const SALES = [
  ["etsy_online", "Etsy or my own online store"],
  ["local_markets", "Craft fairs & local markets"],
  ["commissions", "Custom orders & commissions"],
  ["wholesale", "Wholesale or retail shops"],
  ["contract", "Contract work for other businesses"],
  ["social", "Social media & word of mouth"],
];
const BRANDS = {
  "Sienci Labs": ["LongMill MK2", "LongMill MK2.5", "AltMill", "AltMill Mk2"],
  "Carbide 3D": ["Shapeoko 4", "Shapeoko 5 Pro", "Shapeoko HDM", "Nomad 3"],
  Inventables: ["X-Carve", "X-Carve Pro"],
  Onefinity: ["Woodworker", "Machinist", "Journeyman", "Elite Foreman"],
  "Avid CNC": ["PRO4848", "PRO4896", "Benchtop Pro"],
  "Genmitsu (SainSmart)": ["3018-PROVer", "4040-PRO", "PROVerXL 4030", "PROVerXL 6050"],
  FoxAlien: ["Masuter Pro", "XE-Pro", "4040-XE"],
  BobsCNC: ["E4", "KL744"],
  "Homemade / DIY": ["MPCNC", "LowRider", "Custom build"],
  "No machine yet": [],
  Other: [],
};
const SPINDLES = ["Trim router (Makita, DeWalt…)", "Water- or air-cooled spindle (VFD)", "Laser module", "Not sure yet"];
const DESIGN = [["easel", "Easel"], ["carbide_create", "Carbide Create"], ["vcarve_aspire", "VCarve / Aspire"], ["fusion", "Fusion"], ["inkscape", "Inkscape"], ["illustrator", "Adobe Illustrator"], ["coreldraw", "CorelDRAW"], ["affinity", "Affinity Designer"], ["sketchup", "SketchUp"], ["canva", "Canva"], ["none", "Nothing yet"]];
const CAM = [["vcarve_aspire", "VCarve / Aspire"], ["carbide_create", "Carbide Create"], ["fusion", "Fusion"], ["easel", "Easel"], ["estlcam", "Estlcam"], ["carveco", "CarveCo"], ["kiri_moto", "Kiri:Moto"], ["meshcam", "MeshCAM"], ["none", "Nothing yet"]];
const CONTROL = [["gsender", "gSender"], ["carbide_motion", "Carbide Motion"], ["easel", "Easel"], ["ugs", "Universal Gcode Sender"], ["cncjs", "CNCjs"], ["candle", "Candle"], ["mach", "Mach3 / Mach4"], ["lightburn", "LightBurn"], ["none", "Nothing yet"]];
const EXPECT = [
  ["all_in_one", "One app from design to carve"],
  ["easier", "Easier to learn than what I use now"],
  ["faster_setup", "Faster job setup (zeroing, bits, feeds)"],
  ["feeds_library", "Bit library with safe feeds & speeds"],
  ["better_preview", "A preview I can trust before I cut"],
  ["ai_assistant", "AI help to design and fix files"],
  ["templates", "Ready-made projects & templates"],
  ["batch_production", "Batch production & nesting for orders"],
  ["offline", "Works offline in the shop"],
  ["lower_cost", "Costs less than my current tools"],
];

const field = (label, input, hint = "") => `<label class="field"><span>${label}</span>${input}${hint ? `<small>${hint}</small>` : ""}</label>`;
const msg = `<p class="auth__msg" role="alert" hidden></p>`;
const config = (base) =>
  `<script type="application/json" id="sb-config">${JSON.stringify({ url: supabase.url, key: supabase.key, base })}</script>`;

export function accountPages({ layout, at, href, asset, esc }) {
  const head = () => `<meta name="robots" content="noindex">`;
  const script = (base) => `${config(base)}<script type="module" src="${asset("/assets/js/account.js")}"></script>`;
  const base = () => href("/");
  const card = (inner) => `<section class="auth"><div class="auth__card">${inner}</div></section>`;
  const page = (path, title, description, body) => layout({ path: at(path), title, description, body: body(), head: head(), index: false });

  page("/signup/", "Create your CarvCAM account", "Create a free CarvCAM account.", () =>
    card(`<h1>Create your account</h1><p class="lede">Free. It takes a minute, then we'll ask a few quick questions about your shop.</p>
<form class="auth__form" data-account="signup" novalidate>
${field("Name", `<input name="name" autocomplete="name" required>`)}
${field("E-mail", `<input name="email" type="email" autocomplete="email" required>`)}
${field("Password", `<input name="password" type="password" autocomplete="new-password" minlength="8" required>`, "At least 8 characters.")}
${msg}<button class="btn btn--primary btn--block" type="submit">Create account</button>
<p class="auth__alt">Already have an account? <a href="${href("/login/")}">Log in</a></p>
<p class="auth__legal">By creating an account you agree to receive e-mails about your account. We never sell your data.</p>
</form>
<div class="auth__sent" data-sent hidden><h2>Check your e-mail</h2><p>We sent a confirmation link to <b data-sent-to></b>. Open it to finish creating your account.</p></div>
${script(base())}`));

  page("/login/", "Log in | CarvCAM", "Log in to your CarvCAM account.", () =>
    card(`<h1>Log in</h1>
<form class="auth__form" data-account="login" novalidate>
${field("E-mail", `<input name="email" type="email" autocomplete="email" required>`)}
${field("Password", `<input name="password" type="password" autocomplete="current-password" required>`)}
${msg}<button class="btn btn--primary btn--block" type="submit">Log in</button>
<p class="auth__alt"><button type="button" class="linkbtn" data-forgot>Forgot password?</button> · New here? <a href="${href("/signup/")}">Create an account</a></p>
</form>${script(base())}`));

  page("/reset-password/", "Choose a new password | CarvCAM", "Set a new password for your CarvCAM account.", () =>
    card(`<h1>Choose a new password</h1>
<form class="auth__form" data-account="reset" novalidate>
${field("New password", `<input name="password" type="password" autocomplete="new-password" minlength="8" required>`, "At least 8 characters.")}
${msg}<button class="btn btn--primary btn--block" type="submit">Save password</button>
</form>${script(base())}`));

  const step = (title, lede, inner, require = "", requireMsg = "") =>
    `<fieldset class="wiz__step"${require ? ` data-require="${require}" data-require-msg="${esc(requireMsg)}"` : ""} hidden><legend><h2>${title}</h2></legend><p class="lede">${lede}</p>${inner}</fieldset>`;

  page("/onboarding/", "Welcome to CarvCAM", "Tell us about your shop so CarvCAM fits the way you carve.", () =>
    `<section class="wiz"><div class="narrow">
<p class="eyebrow">Hi <span data-hello>there</span> 👋</p>
<h1>Tell us about your shop</h1>
<p class="lede">Five quick questions. Your answers shape what we build next.</p>
<ol class="wiz__dots" aria-label="Progress">${[1, 2, 3, 4, 5].map((n) => `<li class="wiz__dot">${n}</li>`).join("")}</ol>
<form class="wiz__form" data-account="onboarding" novalidate>
<p class="wiz__count" data-count></p>
${step("What do you carve?", "Pick everything you make, or want to make, on your CNC.", `${chips("project_types", PROJECT_TYPES)}${field("Something else?", `<input name="project_types_other" placeholder="e.g. guitar bodies, signs for weddings">`)}`, "project_types", "Pick at least one kind of project.")}
${step("Who is it for?", "Do you carve for yourself, or does your CNC make you money?", `<div class="choices">${PURPOSES.map(([v, l, d]) => `<label class="choice"><input type="radio" name="purpose" value="${v}"><span><b>${l}</b><small>${d}</small></span></label>`).join("")}</div>
<div data-sales hidden><h3>Where do you sell?</h3>${chips("sales_channels", SALES)}</div>`, "purpose", "Choose the option closest to you.")}
${step("What machine do you have?", "So CarvCAM can set up your work area, controller and bits.", `<div class="choices choices--grid">${Object.keys(BRANDS).map((b) => `<label class="choice choice--sm"><input type="radio" name="machine_brand" value="${esc(b)}"><span><b>${esc(b)}</b></span></label>`).join("")}</div>
<div class="row2">${field("Model", `<input name="machine_model" list="model-list" placeholder="e.g. LongMill MK2.5 30×30"><datalist id="model-list"></datalist>`)}
${field("Work area", `<input name="work_area" placeholder="e.g. 30 × 30 in">`)}</div>
${field("Router or spindle", `<select name="spindle"><option value="">Choose…</option>${SPINDLES.map((s) => `<option>${esc(s)}</option>`).join("")}</select>`)}
<script type="application/json" id="machine-models">${JSON.stringify(BRANDS)}</script>`, "machine_brand", "Pick your machine brand (or “No machine yet”).")}
${step("Which software do you use today?", "For each step of your CNC workflow. Pick all that apply.", `<div class="flowq"><h3><span>1</span> Design (CAD)</h3><p>Drawing the part, sign or artwork.</p>${chips("design_software", DESIGN)}</div>
<div class="flowq"><h3><span>2</span> Toolpaths (CAM)</h3><p>Choosing bits and depths, and making the G-code.</p>${chips("cam_software", CAM)}</div>
<div class="flowq"><h3><span>3</span> Machine control (G-code sender)</h3><p>Jogging, zeroing and running the job.</p>${chips("control_software", CONTROL)}</div>
${field("Anything else?", `<input name="software_other" placeholder="Other software or plugins you rely on">`)}`)}
${step("What should CarvCAM be for you?", "Pick what matters most, then tell us in your own words.", `${chips("expectations", EXPECT)}
${field("Which features would make your work better?", `<textarea name="wanted_features" rows="4" placeholder="e.g. nesting for batch orders, better V-carve inlays, a price calculator per job…"></textarea>`)}
${field("What frustrates you most in your workflow today?", `<textarea name="biggest_frustration" rows="3" placeholder="e.g. switching between three programs, broken bits from wrong feeds…"></textarea>`)}`)}
${msg}
<div class="wiz__nav"><button type="button" class="btn" data-back hidden>Back</button><button class="btn btn--primary" type="submit" data-next>Continue</button></div>
<p class="wiz__skip"><button type="button" class="linkbtn" data-skip>Skip for now</button></p>
</form></div></section>${script(base())}`);

  page("/account/", "Your account | CarvCAM", "Your CarvCAM account.", () =>
    `<section class="acct"><div class="narrow"><div data-account="account" hidden>
<div class="note note--ok" data-welcome hidden><b>You're all set.</b> Thanks for telling us about your shop.</div>
<div class="note note--ok" data-paid hidden><b>Payment received.</b> Pro is active on your account. Thank you!</div>
<p class="eyebrow">Your account</p><h1 data-name></h1>
<p class="lede"><span data-email></span> · <span class="badge" data-role></span></p>
<div class="plancard" data-plan-box hidden><div><span class="eyebrow">Your plan</span><h2 data-plan-name>Free</h2><p data-plan-detail></p></div>
<div class="plancard__actions"><a class="btn btn--primary" href="${href("/pricing/")}" data-upgrade>Upgrade to Pro</a><button type="button" class="btn" data-manage hidden>Manage billing</button></div></div>
<div class="acct__grid">
<a class="card" href="${href("/download/")}"><h3>Download CarvCAM</h3><p>Windows, Linux and Raspberry Pi.</p><span class="more">Get the app</span></a>
<a class="card" href="${href("/onboarding/")}" data-onboarding><h3>Finish your shop profile</h3><p>Five quick questions so CarvCAM fits the way you carve.</p><span class="more">Continue</span></a>
<a class="card" href="${href("/onboarding/")}" data-edit-answers hidden><h3>Your shop profile</h3><p>Change what you carve, your machine or your software.</p><span class="more">Edit answers</span></a>
<a class="card" href="${href("/docs/")}"><h3>Docs</h3><p>Step-by-step guides from first sign to finished carve.</p><span class="more">Read the docs</span></a>
<div class="card" data-admin hidden><h3>Admin</h3><p>You have admin access. Customer data is in the Supabase dashboard for now.</p></div>
</div>
<p><button type="button" class="btn" data-logout>Log out</button></p>
</div></div></section>${script(base())}`);
}
