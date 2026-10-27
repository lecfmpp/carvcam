# Prompt — New UI/UX for gSender with a 3D AI assistant

> Copy everything below the line and paste it into your agent (Claude Code, Lovable, v0, Cursor…). The prompt is self-contained and builds on the [reverse engineering report](./01-reverse-engineering-report.md).

---

## ROLE

You are a senior Product Designer and front-end engineer. You have designed industrial software for beginners (in the style of Bambu Studio, Glowforge, Cricut Design Space) and you know the CNC ecosystem well (GRBL, grblHAL, G-code, CAM). You will design and implement a **new interface** for gSender, an open-source G-code sender for CNC routers.

## GOAL

Create an interface that is **minimalist, beautiful and unlike anything else on the CNC market**, which a person with no experience can use from zero to their first cut in under 10 minutes. At the same time, it must not get in the way of advanced users. The big new feature is an **AI assistant that creates 3D models from prompts** and turns them into ready-to-cut G-code.

## TECHNICAL CONTEXT (comes from the reverse engineering; do not reinvent it)

- gSender has an **embedded Node server**, separate from the UI:
  - REST at `/api/*`: `gcode`, `file`, `macros`, `state`, `preferences`, `machines`, `maintenance`, `jobstats`, `alarmList`, `remote`, `version`
  - **Socket.IO** for real time
- Main commands via `controller.command(...)`: `gcode`, `gcode:start|pause|resume|stop`, `gcode:safe`, `homing`, `unlock`, `reset`, `jog:cancel`, `feedOverride`, `spindleOverride`, `rapidOverride`, `macro:run`, `toolchange:*`, `sdcard:*`
- Events: `serialport:list`, `serialport:openController`, `networkScan`, `file:load`
- Machine state (position, Idle/Run/Hold/Alarm status, alarms, overrides) arrives over the socket. Today it is kept in Redux in the `controller`, `connection`, `fileInfo` and `visualizer` slices.
- **The new UI replaces only the renderer.** It connects to the same server, as Remote Mode already does from the browser. Do not touch `server/controllers` or `cncengine`.
- Suggested stack: React 18 + TypeScript + Vite, Tailwind, Radix UI (accessible primitives), Zustand or Redux Toolkit, Three.js / React Three Fiber for 3D, Framer Motion for motion.
- Electron security: `contextIsolation: true`, `nodeIntegration: false` and a `contextBridge` bridge with a closed list of functions. The current version exposes `fs` on `window`; do not repeat that.

## PROBLEMS IN THE CURRENT UI THAT YOU MUST SOLVE

1. The main screen shows everything at once: DRO, jog, probe, macros, spindle, coolant, rotary and console.
2. Config has 16 sections and ~155 fields without separating "safe" from "dangerous".
3. The connect → home → zero → run sequence is implicit; the user has to know it by heart.
4. Lots of jargon: GRBL, $-settings, MDI, WCS, override.
5. The app creates nothing; anyone who wants to cut something needs an external CAM.
6. Alarms appear as codes, without saying what to do.

## UX PRINCIPLES (mandatory)

- **A linear flow with 4 fixed steps, always visible:** `Create → Prepare → Position → Cut`. Each step has a single primary button. The next step only unlocks when the previous one is ready, but an advanced user can skip steps.
- **Progressive disclosure.** Simple mode is the default. Pro mode (shortcut or toggle) shows the full DRO, console, MDI, macros and fine overrides. Nothing is removed, only hidden.
- **Human language.** Write "Find the machine's zero", not "Homing". Write "Tool height", not "Z0 / TLO". The technical term appears in smaller text for those who want to learn.
- **Prevention before correction.** Before cutting, run an automatic checklist: file fits on the bed, bit defined, zero defined, spindle ok. Show ✓ or ⚠ with the fix one click away.
- **Alarms become instructions:** what happened (1 sentence), why it matters, and a "Resolve" button that guides step by step. The alarm code sits in an expandable detail.
- **Constant physical feedback.** A mini 3D view of the machine with the real bit position, always visible. Machine state uses color and shape (never color alone) and appears in a single status "pill".
- **Safety first.** The **Stop** button is always visible, large, in the same position, with the `Space`/`Esc` shortcut. Dangerous actions ask for confirmation describing the result ("The bit will move down 5 mm"), never a generic "Are you sure?".
- **Nielsen heuristics, WCAG 2.2 AA, touch targets ≥ 44 px.** Full keyboard navigation, screen reader support (job progress announcements), `prefers-reduced-motion`, light/dark theme.
- **Works on desktop, tablet and phone** (Remote Mode), with the same design.

## INFORMATION ARCHITECTURE

```
Fixed top:  [logo]  Create · Prepare · Position · Cut   [machine status ●]  [Stop ■]
Canvas:     3D viewport taking ~70% of the screen (it is the "stage")
Panel:      one contextual panel on the right, with only what the current step needs
Dock:       AI assistant (⌘K / prompt bar) available at any step
Hidden:     Library (projects, bits, materials) · Machine (config) · History
```

### Steps

1. **Create.** AI prompt, import a file (STL, SVG, DXF, G-code) or pick a model from the gallery.
2. **Prepare.** Material (wood, MDF, acrylic, aluminum), stock size, bit (visual library) and strategy (roughing + finishing) with "Fast / Balanced / Detailed" presets. Show the estimated time and an animated toolpath preview.
3. **Position.** Connect (automatic port detection), find the machine's zero and set the origin with visual jogging: drag in the 3D preview or use a large joystick/D-pad with 0.1 / 1 / 10 mm steps. Guided probing with illustrations.
4. **Cut.** Pre-flight checklist, then Start. During the job: progress bar, time remaining, current line, real-time bit preview, Pause/Stop and simple speed sliders (overrides) with safe limits. At the end: summary, photo (if there is a camera) and "Cut again".

### Configuration (Machine)

Organize by **intent**, not by parameter: "My machine", "Tools", "Connection", "Safety", "Accessibility", "Advanced". Use a first-setup wizard with ready-made profiles (Sienci LongMill, AltMill, Shapeoko, generic GRBL). Firmware fields (`$`) live only under Advanced, with a warning, the default value and "restore".

## AI ASSISTANT — CREATING 3D MODELS FROM PROMPTS

### Initial scope (v1): 2D/2.5D plates and signs

Implement only this scope first. It covers most of what a beginner cuts on a 3-axis CNC and avoids full 3D CAM.

> **The CAM engine for this v1 already exists:** the `cam-engine/` folder (TypeScript, 35 passing tests) generates verified GRBL G-code from the JSON below. **Use that package; do not rewrite the CAM.** The UI's job is to call `generatePlate(spec, options)`, show the `warnings`, draw the preview from `layout` and the simulation, and send the `gcode` when `ok` is true. Details in `cam-engine/README.md`.

- **Part types:** plate with raised, engraved or cut-through text; cut-out sign (separate letters or a continuous word); plate with a border (straight, rounded, chamfered) and simple icons (heart, star, house, leaf); mounting holes and a hanging slot.
- **Libraries (all in the browser, no server):**
  - **opentype.js** (MIT): text → vector outlines from TTF/OTF fonts. Bundled fonts: Archivo Black, Pacifico, Bebas Neue (SIL OFL).
  - **Clipper2 via `clipper2-ts`** (BSL-1.0): union and difference of regions and bit offsets (ring pocketing, outside and inside cutouts, checking for details smaller than the bit). The `clipper2-js` package was rejected: its negative offset is broken.
  - **Zod** (MIT): validates the JSON the AI fills in before any computation.
  - **Three.js / React Three Fiber**: 3D preview, fed by the heightmap from the `cam-engine` simulation.
  - We do not use a 3D CAD kernel (Replicad/OpenCascade/manifold) in v1.
- **Taken from rudra496/cnc (MIT):** only ideas, no files copied. The heightmap-based material-removal simulation (rewritten in `cam-engine/src/sim/heightmap.ts`, without Three.js and at 0.25 mm resolution) and the calculator's feed formula (feed per tooth × flutes × RPM, in `cam-engine/src/materials.ts`). Its material presets (metals) are not suitable; we use MDF, plywood, softwood/hardwood and acrylic.
- **AI schema:** the AI fills in a closed JSON, with no free-form code: `PlateSpecSchema` in `cam-engine/src/schema.ts` (`type`, `width`, `height`, `thickness`, `material`, `texts[]` with `content/font/size/mode/depth/x/y`, `edge`, `frame`, `icons[]`, `holes[]`, `slots[]`, `outerCutout`, `margin`). Use the Zod schema itself as the tool definition (tool use) for the Claude API.
- **CAM operations (ready):** engraving and relief via concentric-ring pocketing, cut-through (stencil), holes (peck or pocket), slots, outer cutout with tabs and switching between two bits (`T# M6`). Bits: straight and V-bit (the V-bit only engraves along the outline). Variable-depth V-carving and ramp entry are left for v1.1.
- **Output and safety:** GRBL G-code with a header (G21 G90 G17 G94), safe height and passes per material and bit. The verifier re-reads the final text and blocks `$`, G20/G91, G0 inside the material, cutting with the spindle off, feed above the maximum and leaving the work area. It must also run on imported G-code.
- **Manufacturability warnings:** they already come out with a stable code and human-readable text (`TEXT_DOES_NOT_FIT` with a suggested size, `DETAIL_SMALLER_THAN_BIT` with the % not cut, `ELEMENT_NOT_MACHINABLE`, `LOOSE_ISLANDS`…). The AI should read these codes and propose the fix ("I'll reduce the text to 16 mm. OK?").
- **Sienci Labs machines:** the product is made for Sienci's machines. Use the `cam-engine/src/catalog/sienci/` catalog (LongMill MK2/MK3 and AltMill machines, Makita/AutoSpin/spindle heads, 15 bits from the store with a compatibility rule, the official feeds and speeds table, 7 first-cut projects). Pass `sienci: { machine, head, bit, cutoutBit, speed }` to `generatePlate`. Preselect the machine from the profile already chosen in gSender and show `manualAdjustments` (Makita dial) in the pre-cut checklist.
- **gSender integration:** check the catalog limits against the real firmware parameters ($110–$112, $130–$132), because the user may have changed them, and send the G-code via `POST /api/gcode`.
- **Out of scope for v1:** artistic relief (heightmap), STL meshes converted into 3D toolpaths, boxes with joinery, 4th axis. Requests like these get a friendly reply with an in-scope alternative (e.g. an engraved silhouette). Importing ready-made G-code keeps working.
- **Done when:** "20×10 cm plate, 15 mm MDF, 'Casa da Ana' raised 3 mm, rounded border, 2 holes" generates G-code that passes the verifier and is simulated correctly in the visualizer.

### Experience

- A fixed prompt bar, like a short conversation: "A 20×10 cm plate with the name *Casa da Ana* raised and a rounded border".
- The AI replies with **3 variations** as 3D thumbnails. The user picks one and refines it by chatting ("thicker letters", "add a leaf in the corner").
- Editable parameters appear as AI-generated chips/sliders (width, depth, font, border radius). Changing a slider updates the model instantly, without a new AI call.
- The AI always checks whether the model can be manufactured and warns in plain language: "detail smaller than the 3 mm bit, I'll thicken it to 3.2 mm. OK?"
- It also suggests material, bit and depth, filling in the Prepare step.
- Example prompts, history and "remix" of gallery projects.

### Technical pipeline (CNC needs precise geometry, not an "artistic" mesh)

1. **LLM → parametric specification.** The AI (Claude API, latest model with tool use) does not generate meshes or code. In v1 it fills in the `cam-engine`'s `PlateSpecSchema`, which becomes 2.5D geometry with opentype.js + Clipper2. For future phases (boxes, parts), evaluate an in-browser CAD kernel (Replicad/OpenCascade.js or manifold-3d).
2. **Organic reliefs (2.5D).** For artistic requests ("a lion in relief"), generate an image → depth map (heightmap) → 2.5D surface. It is the kind of model a 3-axis router cuts well.
3. **Mesh-based text-to-3D** (optional, for importing STL) comes in only as an "experimental" mode, with a warning that the mesh will be converted to 2.5D.
4. **Manufacturability validation:** fits the material/bed; no undercuts on 3 axes; minimum thickness ≥ bit diameter; depth ≤ usable cutting length.
5. **CAM in the browser:** in v1 it is the `cam-engine` (pocket, profile with tabs, holes → GRBL G-code). Run it in a Web Worker and show the material-removal simulation. 3D roughing (waterline/raster) is for artistic reliefs, outside v1.
6. **Sending:** `POST /api/gcode` and then the normal flow (Position → Cut) through the gSender server.
7. **Guardrails:**
   - The AI **never sends commands to the machine.** It only produces files. Every run requires an explicit user action.
   - The generated G-code goes through a verifier: bed limits, profile maximum feeds, no `$` settings, no commands outside the allowed list.

## VISUAL DIRECTION — "Calm Precision"

Stay away from the "gray industrial panel full of buttons" look. The reference is a **serene precision instrument**: photo studio, Swiss watch, Teenage Engineering, Linear, Arc.

- **Dark stage, light interface.** The 3D viewport is the center, with soft studio lighting, contact shadow and the material with a real texture (wood grain, translucent acrylic). The UI floats in subtle glass panels (20 px blur, 1 px border at 8% opacity).
- **Palette:**
  - Warm neutrals: graphite `#111214`, surface `#1A1B1E`, paper `#F5F3EF` in the light theme
  - **One** vivid accent: signal orange `#FF5B1F`, used only for the primary action and for the bit
  - States: Ready = mint green, Running = electric blue, Paused = amber, Alarm = red, always with icon + text
- **Typography:** Inter Tight or Geist for the UI, and **tabular mono** (Geist Mono / JetBrains Mono) for coordinates and numbers, which never "jump". Scale 12/14/16/20/28/40.
- **8 pt grid**, 14 px radius on panels and 10 px on controls, lots of white space, at most 1 primary action per screen.
- **Purposeful motion:** 180–240 ms transitions with ease-out, a 3D camera that "flies" smoothly between steps, tactile micro-interactions on the jog (the button sinks and the position glides). Everything respects `prefers-reduced-motion`.
- **Icons:** Lucide with a 1.5 px stroke. Step-by-step illustrations in thin line, monochrome with the accent.
- **Signature details (the "different" part):**
  - The status "pill" pulses slowly while cutting, like breathing
  - The bit coordinate appears as a floating label attached to the tool tip in 3D
  - The step bar at the top is a continuous line that "fills in" like a toolpath being cut
  - When the job finishes, the camera does a 360° orbit around the finished part

## DELIVERABLES

1. **Flows and wireframes** for the 4 steps, onboarding, configuration and the error and alarm states (desktop + phone).
2. **Design system:** tokens (color, type, spacing, radius, shadow, motion) as CSS variables / Tailwind config, and styled Radix components (Button, IconButton, Segmented, Slider, Stepper, Panel, Toast, Dialog, StatusPill, JogPad, CoordinateReadout, PromptBar, ModelCard).
3. **Working prototype** in React + TS connected to the gSender server (REST + Socket.IO), with a **simulator mode** (fake machine) for testing without a CNC.
4. **AI module:** PromptBar + Claude API call with tool use → parametric code → 3D render → validation → CAM → G-code. Include the assistant's system prompt and the JSON schemas.
5. **Complete microcopy** in English, structured for i18n, including all GRBL alarms rewritten as instructions.
6. **Usability test plan:** 5 lay users, task "from prompt to first cut". Metrics: time, errors, SUS ≥ 80.

## ACCEPTANCE CRITERIA

- [ ] A lay person does "prompt → model → G-code → position → cut" without reading documentation, in under 10 minutes.
- [ ] The home screen shows at most 1 primary action and at most 7 visible controls in Simple mode.
- [ ] The Stop button is always visible and responds to the keyboard in under 100 ms.
- [ ] Every alarm has a human explanation and a guided-resolution button.
- [ ] WCAG 2.2 AA (contrast, visible focus, keyboard, screen reader) verified with axe.
- [ ] The AI never moves the machine; all generated G-code goes through the verifier.
- [ ] Works at 1280×800, 1920×1080, tablet and phone (Remote Mode).
- [ ] No changes to gSender's `server/`. The new UI talks to it only via REST and Socket.IO.

Start with the flows and the design system. Show the wireframes for the 4 steps and wait for my approval before implementing.
