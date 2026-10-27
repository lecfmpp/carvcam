# gControl, online version and positioning

Sources consulted in Oct 2026:
- [gControl Panel Computer](https://sienci.com/product/gcontrol/)
- [Choosing Software – Sienci Resources](https://resources.sienci.com/view/lmk2-choosing-software/)

---

## 1. gControl: what changes in the interface

**The device.** Windows 11 IoT, 15.6″ touchscreen at 1920×1080, Intel N150 processor (modest), 8 GB of RAM. It ships with gSender preinstalled and is mounted on the machine. Two complaints in the reviews: "it would be better if it opened gSender by itself" and "I wish it had a faster processor".

**Consequences for the design:**

| Fact | Impact | What to do |
|---|---|---|
| Touch, used standing next to the machine, with dirty or gloved hands | 44 px targets are too small; there is no hover | "Panel" mode: targets ≥ 56 px, nothing that depends on hover, dragging with greater tolerance, large jog pad |
| 15.6″ at ~1 m away | 12–13 px text becomes unreadable | Type scale +2 px, larger coordinate numbers |
| Windows uses 125–150% scaling on this screen | The usable window drops to **1536×864 or 1280×720** | The layout must work at 1280×720 (today the minimum is 1280×760) |
| N150 | 3D preview and high-resolution simulation are heavy | Lower-resolution simulation, 3D on demand, engine worker at low priority during the cut |
| The keyboard is the Windows on-screen keyboard | Typing is painful | In Create, prioritize chips, sliders and the assistant; numeric fields with ± |
| It stays on the machine | It is the place for Position and Cut | Open straight into Position/Cut when gControl is detected; Create remains available |
| "It would be nice if it opened by itself" | Friction every time it is turned on | Kiosk mode: open full screen when Windows starts |

**Detection:** `pointer: coarse` with width ≤ 1920 (or the `?panel=1` parameter / an option in Settings) turns on Panel mode. The switch is done with CSS variables (`--control-h`, `--font-scale`, `--panel-w`), without duplicating screens.

---

## 2. Online version: is it worth it?

The CAM engine already runs entirely in the browser (Web Worker). A web version costs little technically. The question is **what** goes online.

### For
- **No installation:** opens on Mac, Chromebook, tablet and phone. You can design on the couch and cut in the workshop.
- **Instant updates** for everyone, without downloading an installer.
- **AI assistant without asking for a key:** the server holds the Claude API key, so the cost and control stay with Sienci (or with you).
- **Cloud projects:** save, share, a "remix" gallery, and open on gControl what was designed at home.
- **Acquisition:** people who don't own a machine yet can try the whole flow and see how long it would take on a LongMill. That becomes a sales funnel.
- **Precedents:** Easel (online) and Sienci's own CAMLab (online, based on Kiri:Moto).

### Against
- **Controlling the machine from the browser is fragile:**
  - Web Serial only exists in Chrome and Edge (not in Safari or Firefox).
  - Background tabs get throttled by the browser, and the computer can go to sleep in the middle of a 40-minute cut.
  - The AltMill and the SLB-EXT over Ethernet are not reachable directly from the browser.
  - gSender uses a local Node server precisely for this reason.
- **Workshop without internet:** an app that only works online stops in the worst possible place.
- **Recurring costs:** hosting, AI, support, user accounts, LGPD/GDPR.
- **Security:** G-code coming from the cloud needs the same local verifier before it goes to the machine (it already exists in the engine).

### Recommendation: hybrid, a single codebase
1. **Web ("Studio"):** Create + Prepare + export or send the G-code to the workshop. No machine movement at all.
2. **Desktop and gControl (Electron with the gSender server):** the complete flow, working offline.
3. **Bridge:** project saved in the cloud → shows up in "Recent" on gControl. The machine is only commanded by the local app.

---

## 3. Positioning

### What gSender says today
> "No. gSender is strictly a CNC control software and has no features currently for g-code generation […] You'll need to use gSender in combination with some other CAM, or design + CAM, software."

Sienci's own software page shows an example with three programs (Illustrator → Carbide Create → gSender) and a wizard that picks among more than 80 tools. For beginners, this is the biggest barrier between "the machine arrived" and "my first cut".

### Are we replacing the tools they suggest?

| Suggested tool | What for | Do we replace it? |
|---|---|---|
| **Vectr** (online 2D design) | Simple signs | **Yes**, for signs and lettering |
| **Easel** (design + CAM + interface, online) | Signs, simple cutouts | **Largely:** text, shapes, icons, relief, engraving, cutout with tabs, holes. SVG and image import are missing |
| **Carbide Create** (2D/2.5D design + CAM) | Signs, V-carve, SVG/DXF | **Partially:** signs yes; real V-carve and SVG/DXF import not yet |
| **Inkscape** (vectors + CNC plugins) | Vector art | **No:** we don't do freehand art; the path is SVG import |
| **F-Engrave** (engraving and V-carve) | V-carved text | **Partially:** we engrave with a V-bit following the outline, without variable depth |
| **Halftoner** (photo halftone) | Photos | **No** |
| **Kiri:Moto / CAMLab** (3D CAM in the browser) | 3D reliefs from STL | **No.** CAMLab belongs to Sienci: the path is to integrate it, not rebuild it |
| **Carveco, VCarve, Onshape, Fusion** | Advanced use | **No**, and we shouldn't: it is a different audience |

**Conclusion:** we solve the problem for the **first cut and for the most common beginner project**: sign, lettering, name plaque, coaster, keychain, simple cutout. That is the range where today a person has to learn two or three programs. We do not replace the whole toolkit, and the messaging needs to make that clear.

### Gaps, in order of impact
1. **SVG/DXF import** (logos, art from the internet, Inkscape/Illustrator). Unlocks most of the "Easel/Carbide Create" cases. The engine already works with 2D regions; only the SVG reader is missing.
2. **Real V-carve** (variable depth with a V-bit): it is the "professional sign look" that draws people to Carbide Create and VCarve.
3. **Image → engraving** (silhouette or halftone).
4. **3D relief:** integrate CAMLab (Sienci) into the same flow, instead of sending the person to another site.

### Proposed messaging

**One sentence:**
> **gSender now designs, too: go from idea to your first cut without leaving gSender.**

**For the FAQ (replacing the current text):**
> **Can gSender make the g-code for me?**
> Yes, for the projects most people start with. gSender's **Create** step lets you design signs, name plaques, coasters, cut-out lettering and simple shapes, by typing what you want or editing it directly. It already knows your machine, your router and the Sienci bits you own, picks safe speeds from our official table and checks the job before you carve. For artwork-heavy work (V-carved art, photos, 3D reliefs), keep using your favourite design + CAM software. gSender still opens their files, just like before.

**Pillars:**
1. **From zero to first cut in one place:** no toolchain to assemble.
2. **Made for your machine:** Sienci work area, router, bits and speeds already configured.
3. **Safe by default:** every file is verified and simulated before cutting.
4. **Grows with you:** when you want more, import from any CAM. gSender is still the best sender.

**Who it is for (and who it is not for):**
- **For:** people who just received a LongMill or AltMill, people who make signs and gifts, schools and makerspaces.
- **Does not replace:** VCarve or Fusion for people who have already mastered them and make complex art or mechanical parts.

**Positioning risks:**
- **Don't promise to replace the whole CAM.** Anyone who tries to do an artistic V-carve will be frustrated. Show the limits in the interface itself: in the gallery, a "Coming soon: SVG import, V-carve".
- **Partners:** Sienci recommends Carbide Create, Vectric and Carveco, and sells VCarve Pro in its store. The message should be "start here, grow with them", not "you don't need them".
