ROLE
You are a senior Product Designer specializing in software for beginners in digital fabrication (references: Bambu Studio, Glowforge, Cricut Design Space, Linear, Teenage Engineering). You will design a new interface for gSender, an open-source program that controls CNC routers (machines that carve wood, MDF, acrylic and aluminum from G-code files).

GOAL
Design an interface that is minimalist, beautiful and unlike anything else on the CNC market. A person with no experience needs to go from zero to their first cut in under 10 minutes, without getting in the way of the advanced user. The big new feature is an AI assistant that creates models from text ("a plate with the name Casa da Ana in relief") and prepares them for cutting. In the first version, it creates plates and signs (see "Initial scope").

Deliver the design and a clickable prototype with simulated data. It does not need to connect to a real machine.

---

WHAT GSENDER DOES TODAY (no function may be lost; it can be reorganized or hidden)

Current navigation: sidebar with 4 items.
1. Carve (main screen): top bar with connection, machine state, status icons and spindle/laser. 3D visualizer of the bit's toolpath. Column with the current axis position (X, Y, Z), zero and "go to" buttons. Area with file control, job control and tabs: Jog (move the machine), Probe (measure height with a touch plate), Macros, Spindle, Coolant, Rotary (4th axis), Console and automatic tool change. Macro bar in portrait mode.
2. Tools: 8 tools (Surfacing to flatten the spoilboard, Rotary Surfacing, Movement Tuning to calibrate axes, XY Squaring to align, keyboard shortcuts, Gamepad, SD card manager, accessory installation).
3. Stats: overview, alarms, job history, maintenance, about.
4. Config: 16 sections and about 155 fields (Basics, Customize UI, Motors, Probe, Action Buttons, Homing/Limits, Spindle/Laser, Accessory Outputs, Rotary, Automations, Tool Changing, Ethernet, Status Lights, Advanced Motors, More Settings, Accessibility).

Existing step-by-step wizards: manual, semi-automatic and automatic tool change; first tool change; measure tool length.

Other functions: recent files, watched folder, G-code editor, live overrides (feed rate, spindle speed, rapid moves), pause/resume, laser mode, remote mode from phone/tablet, notifications and maintenance alerts, end-of-job modal.

CURRENT JOURNEY OF A CUT
1. Connect (choose USB port or IP)
2. Clear the alarm and find the machine's zero (homing)
3. Load a G-code file made in another program
4. Move the bit to the material and set the zero point (manually or with the probe)
5. Check (outline, limits, estimated time)
6. Run, adjusting speeds and changing tools when asked
7. Finish and see the summary

PROBLEMS THE NEW INTERFACE MUST SOLVE
1. The main screen shows everything at once: position, jog, probe, macros, spindle, coolant, rotary and console.
2. The configuration has about 155 fields without separating what is safe from what is dangerous.
3. The connect → zero → cut order is implicit; the user has to know it by heart.
4. Lots of jargon: GRBL, $-settings, MDI, WCS, override, homing.
5. The program creates nothing; anyone who wants to cut needs other software to generate the file.
6. Alarms appear as numeric codes, without saying what to do.

---

UX PRINCIPLES (mandatory)
- Linear flow with 4 fixed, always-visible steps: Create → Prepare → Position → Cut. Each step has a single primary button. Advanced users can skip steps.
- Progressive disclosure: Simple mode by default; Pro mode shows detailed position, console, manual commands, macros and fine overrides. Nothing is removed, only hidden.
- Human language: "Find the machine's zero" instead of "Homing"; "Tool height" instead of "Z0". The technical term appears smaller, for those who want to learn.
- Prevention before correction: automatic checklist before cutting (file fits on the bed, bit defined, zero defined, spindle ok), with ✓ or ⚠ and a one-click fix.
- Alarms become instructions: what happened (one sentence), why it matters and a "Resolve" button with step-by-step guidance. The code sits in an expandable detail.
- Constant physical feedback: a mini 3D view with the real bit position, always visible. Machine state in a single "pill" with color + icon + text (never color alone).
- Safety: Stop button always visible, large, in the same position, with the Space/Esc shortcut. Confirmations describe the result ("The bit will move down 5 mm"), never "Are you sure?".
- Nielsen heuristics, WCAG 2.2 AA, touch targets ≥ 44 px, keyboard navigation, visible focus, light and dark theme, respect for prefers-reduced-motion.
- Same design on desktop, tablet and phone.

INFORMATION ARCHITECTURE
- Fixed top: logo · Create · Prepare · Position · Cut · machine status pill · Stop button
- Center: 3D viewport taking about 70% of the screen (it is the stage)
- Right: one contextual panel with only what the current step needs
- Always available: AI assistant bar (⌘K shortcut)
- Secondary menu: Library (projects, bits, materials) · Machine (configuration) · History · Tools

THE 4 STEPS
1. Create: AI prompt, import a file (STL, SVG, DXF, G-code) or pick a model from the gallery.
2. Prepare: material, stock size, bit (visual library) and strategy with "Fast / Balanced / Detailed" presets. Estimated time and an animated toolpath preview.
3. Position: connect (automatic detection), find the machine's zero and set the origin with visual jogging (drag in the 3D preview or a large D-pad with 0.1 / 1 / 10 mm steps). Guided probing with illustrations.
4. Cut: pre-flight checklist → Start. During the job: progress, time remaining, real-time bit, Pause/Stop, simple speed sliders with safe limits. At the end: summary and "Cut again".

CONFIGURATION
Organized by intent, not by parameter: My machine, Tools, Connection, Safety, Accessibility, Advanced. First-setup wizard with ready-made profiles (Sienci LongMill, AltMill, Shapeoko, generic). Firmware parameters only under Advanced, with a warning, the default value and a restore button. The current 8 tools (Surfacing, Squaring etc.) become wizards reachable from the Tools menu.

INITIAL SCOPE OF THE ASSISTANT (v1): PLATES AND SIGNS
In the first version, the AI creates only 2D/2.5D plates and signs. All examples, suggested prompts, the gallery and the assistant screens should revolve around this:
- Plates with a name or number (house, door, table, pet), in relief (raised letters) or engraved (recessed letters)
- Cut-out signs (separate letters or a continuous word cut from the material)
- Plates with a border (straight, rounded, chamfered) and simple icons (leaf, heart, star, house)
- Plates with mounting holes or a hanging slot
- Main parameters: width, height, thickness, text, font, letter size and depth, border type, icon, holes
- Suggested materials: MDF, solid wood, plywood, acrylic
Out of scope for v1 (show as "coming soon" in the gallery, without dedicated screens): artistic 3D reliefs, boxes with joinery, mechanical parts. If the user asks for something out of scope, the AI explains in one sentence and offers an in-scope alternative (e.g. "a lion in relief" → "plate with an engraved lion silhouette").
Importing STL/SVG/DXF and ready-made G-code remains available in the Create step.

AI ASSISTANT (design all of these screens and states)
- Fixed prompt bar, short-conversation style, with example prompts and history.
- "Generating" state: an elegant animation, no generic spinner.
- The AI replies with 3 variations as 3D thumbnails; the user picks one and refines it by chatting ("thicker letters", "add a leaf in the corner").
- Editable parameters as chips and sliders (width, depth, font, border radius) that update the model instantly.
- Manufacturability warning in plain language: "This detail is smaller than the 3 mm bit. I'll thicken it to 3.2 mm. OK?"
- Automatic suggestion of material, bit and depth, which fills in the Prepare step.
- "Out of scope" state: a friendly reply with an alternative within plates and signs.
- Gallery with "remix" of ready-made plates and signs, and a "coming soon" section for reliefs and boxes.
- Clear visual rule: the AI only creates files; starting the cut is always an explicit user action.

VISUAL DIRECTION — "Calm Precision"
Stay away from the gray industrial panel full of buttons. The reference is a serene precision instrument.
- Dark stage, light interface: 3D viewport with soft studio lighting, contact shadow and material with a real texture (wood grain, translucent acrylic). Subtle floating glass panels (20 px blur, 1 px border at 8% opacity).
- Palette: graphite #111214, surface #1A1B1E, paper #F5F3EF in the light theme. A single accent, signal orange #FF5B1F, only for the primary action and for the bit. States: Ready mint green, Running electric blue, Paused amber, Alarm red, always with icon + text.
- Typography: Inter Tight or Geist in the interface; tabular mono (Geist Mono or JetBrains Mono) for coordinates and numbers. Scale 12/14/16/20/28/40.
- 8 pt grid, 14 px radius on panels and 10 px on controls, lots of free space, at most one primary action per screen.
- Motion: 180–240 ms transitions with ease-out, a 3D camera that flies smoothly between steps, jog buttons that sink when touched.
- Lucide icons with a 1.5 px stroke; step-by-step illustrations in thin line, monochrome with the accent.
- Signature details: the status pill pulses slowly during the cut, like breathing; the bit coordinate appears as a label attached to the tool tip in 3D; the step bar fills in like a toolpath being cut; when finished, the camera does a 360° orbit around the finished part.

DELIVERABLES
1. Flow map of the 4 steps, the onboarding (first connection and machine profile) and the error and alarm states.
2. High-fidelity screens, desktop (1440×900) and phone, for: onboarding; Create (empty, generating, 3 variations, refining); Prepare; Position (connect, machine zero, jog, probe); Cut (checklist, running, paused, alarm with guided resolution, finished); Configuration (Simple and Advanced); Tools menu; History.
3. Simple mode vs. Pro mode on the Cut screen, side by side.
4. Light and dark theme for at least one screen.
5. Design system: tokens (color, typography, spacing, radius, shadow, motion) and components (Button, IconButton, Segmented, Slider, Stepper, Panel, Toast, Dialog, StatusPill, JogPad, CoordinateReadout, PromptBar, ModelCard, ChecklistItem, AlarmCard).
6. Clickable prototype with simulated data covering the complete path: prompt → model → prepare → position → cut → finished.
7. Microcopy in English, including 5 common alarms rewritten as instructions (e.g. travel limit reached, probe failed, emergency stop, position lost, door open).

ACCEPTANCE CRITERIA
- A lay person understands what to do on each screen without reading documentation.
- In Simple mode, each screen has at most one primary action and at most 7 visible controls.
- The Stop button is visible on every screen with a connected machine.
- Every alarm has a human explanation and guided resolution.
- AA contrast on text and states; no state communicated by color alone.
- Every function listed in "What gSender does today" has a place in the new design.

Start with the flow map and the wireframes of the 4 steps. Show them before moving on to high fidelity.

---

CHANGES AFTER THE CAM ENGINE (update the design with this)

The engine that turns the plate into G-code already exists. It changed some assumptions of the flow. Adjust the design as follows:

1. MATERIAL, THICKNESS AND BIT MOVE UP TO THE CREATE STEP
Whether a part can be cut depends on the bit and the material: a thin letter may be possible with a 1/16" bit and impossible with a 1/8" one; a 3 mm depth does not work on a 3 mm plate. Therefore:
- Show material, thickness and bit as chips at the top of the Create panel, with defaults already set (MDF 15 mm, 1/8" straight bit), editable right there.
- Changing any chip revalidates the model instantly.

2. CREATE BECOMES CONVERSATION + PARAMETER EDITOR
The AI does not draw freely: it fills in fields. The user refines by chatting or by adjusting the same controls:
- Plate: width, height, border (straight, rounded, chamfered) and radius, frame
- Texts (up to 6): content, font, letter size, mode (relief, engraved, cut-through), depth, position (automatic or by dragging in the preview)
- Icons: heart, star, house, leaf (size, position, mode)
- Holes and hanging slot
- Type: plate or cut-out sign
Available fonts: Archivo Black (bold, the easiest to cut), Pacifico (script, connected letters) and Bebas Neue (condensed). The font picker is visual and indicates which one is easiest to cut.

3. WARNINGS BECOME A CENTRAL COMPONENT
Every change returns warnings in plain English, with a suggestion. Design two levels:
- Error: blocks the "Continue" button. Has an "Apply suggestion" button. Examples: "The text does not fit on the plate → reduce to 18 mm"; "The strokes of 'since 2024' are thinner than the 3.17 mm bit → enlarge the text or use a 1/16" bit"; "The 2 mm hole is smaller than the bit".
- Warning: lets the user continue and highlights in the preview where material will be left. Examples: "About 4% of the leaf will not be cut"; "The centers of the 'o' will come loose in the cut-through"; "Small parts without tabs: hold them down with double-sided tape".
Also design how the AI comments on these warnings in the conversation ("I'll reduce the text to 18 mm. OK?").

4. THE PREVIEW SHOWS THE REAL CUT
The preview is the simulation of what the bit will do, not an idealized model: recessed floor, holes going through, holding tabs, inside corners rounded by the bit radius and areas the bit cannot reach. Design:
- Top view with a depth legend (untouched face, recessed, cut through)
- 3D view of the simulated part
- Highlighting of the areas with warnings

5. PREPARE GETS LEANER
What remains:
- Speed preset: Fast / Balanced / Detailed (shows RPM and feed only in Pro mode)
- Holding tabs: count and height
- Optional second bit (e.g. engrave with 1/16", cut out with 1/8")
- Summary: estimated time, list of operations (pocket, holes, cutout), required stock size and a "G-code verified ✓" badge

6. POSITION: ZERO ALWAYS IN THE SAME PLACE
The work zero is the bottom-left corner of the stock, on the top face. Illustrate this clearly. Show the minimum stock size (the plate plus 10 mm of margin on each side when there is a cutout).

7. CUT: BIT CHANGE AND TABS
- If the project uses two bits, the cut pauses halfway: design the "Switch to the 1/8" bit" screen with an illustration and a "Done, continue" button (with a new bit-height zero).
- At the end, a "Part finished: cut the tabs and sand the edges" state with an illustration.

8. NEW STATES FOR THE PROTOTYPE
Include in the clickable prototype:
- Create with a blocking error, then "Apply suggestion" resolving it
- Bit change in the middle of the cut
- Cut-out sign ("sign" type) with connected script letters

---

SIENCI LABS MACHINES AND BITS (update the design with this)

The tool is now made for Sienci Labs machines. The machine, router/spindle and real bits enter the flow, with default settings for each machine and ready-made projects for the first cuts. The engine already has this data; the design needs to show it.

Data the interface will receive:
- Machines: LongMill MK2 (12×30, 30×30, 48×30), LongMill MK3 (30×30, 48×30), AltMill (2×4, 4×4, 4×8). Each one has its real work area, maximum speed and possible heads.
- Heads: Makita RT0701 (speed set on the dial, by hand, positions 1 to 6), AutoSpin T1 (speed set automatically by the program) and 1.5 kW / 2.2 kW Spindle (automatic speed).
- Sienci bits: 1/16″, 1/8″ and 1/4″ straight bits (upcut, downcut, single flute, compression), 30°, 60° and 90° V-bits, a 22 mm surfacing bit and a ball nose. Each one has a diameter, shank, cutting length, intended use and a store link.
- Compatibility: each bit is "fits", "needs an accessory" (e.g. a 1/8″ shank on the Makita needs the 1/8″ collet) or "does not fit".
- Speeds: Sienci's official table (Reduced, Regular, Maximum) per bit and material.
- 7 first-cut projects, each with a level, bits, material, what the person learns and which machines it fits.

1. "MY WORKSHOP" ONBOARDING (first time the app opens)
Three short steps, with illustrations (do not use Sienci's logo or product photos without authorization):
- What is your machine? Cards by family (LongMill MK2, LongMill MK3, AltMill), then the size. Show the work area in cm. If gSender already has a machine profile configured, open with it suggested ("We found a LongMill MK3 30×30. Is this the one?").
- What spins the bit? Makita RT0701, AutoSpin T1 or Spindle, with the machine's default already selected (MK2 = Makita, MK3 = AutoSpin, AltMill = 2.2 kW Spindle).
- Which bits do you have? A grid of Sienci bit cards. The "I have the Starter End Mill Set (Beginner's Kit)" shortcut selects the kit's 5 bits at once.
At the end: "First step: surface the spoilboard" (opens gSender's Surfacing tool with the 22 mm bit).

2. MACHINE CHIP ALWAYS VISIBLE
At the top, next to the status: "LongMill MK3 30×30 · AutoSpin". Tapping it opens the machine switcher (some people have more than one). Switching machines revalidates the project instantly: area, bits and speeds.

3. THE REAL BED ON THE 3D STAGE
The viewport shows the bed at the size of the chosen machine's work area, with the stock placed on it. If the part does not fit, the part outside the area appears in red, and the warning says which machine it would fit on.

4. BIT LIBRARY (My bits + Sienci Store)
- Bit card: a drawn silhouette of the profile (straight, V, ball, compression), diameter in mm and inches, shank, cutting length and a one-line use ("Relief and engraving without chipping the top face").
- Compatibility badges with the current head: "Fits your AutoSpin ✓", "Needs the 1/8″ collet · see in store", "Not for plates (yet)".
- Filter by intent: Engrave, Relief, Cut out, Plastic, Surface.
- Two tabs: "My bits" (the ones the person selected) and "All Sienci bits" (with a "See in store" button).

5. CREATE AND PREPARE USE THE REAL BITS
- The bit chip in Create only offers bits from "My bits" that fit the head.
- If the AI suggests a bit the person does not have: "For this detail the ideal is the 1/16″ downcut, which you don't have yet. Use the 1/8″ (some details disappear) or see it in the store?"
- Projects with two bits show both, in order of use.

6. SPEED = OFFICIAL SIENCI TABLE
The Prepare preset now maps to Sienci's table: Detailed = Reduced, Balanced = Regular, Fast = Maximum. The default depends on the machine (LongMill = Balanced, AltMill = Fast). Show the source discreetly: "Values from the official Sienci Labs table". In Pro mode, show RPM, feed, plunge and step down.

7. MAKITA: DIAL BY HAND
With the Makita, the speed is not automatic. Design:
- In the pre-cut checklist: an illustration of the dial with the position highlighted ("Turn the dial to 3 · 17,000 RPM").
- At a bit change in the middle of the cut: the new dial value, if it changes.
With AutoSpin or Spindle, show only "Automatic speed ✓".

8. FIRST CUTS (gallery and "Start here" track)
A "First cuts" area on the home screen and in the empty state of Create, with cards. Each card has:
- A simulation preview
- Level (First cut, Easy, Intermediate)
- Estimated time on the person's machine
- Required bits, with ✓ for the ones they have and ✗ for the missing ones
- What they learn
- A "Make this project" button (opens already configured, can be edited)
If it does not fit the machine, the card appears dimmed with "Needs a 48×30 or AltMill".
Projects:
- Depth test: 1, 2 and 3 engraved at 1, 2 and 3 mm on an MDF offcut, no cutout (first cut)
- Coaster with initial: a 10 cm disc cut out with tabs (first cut)
- Raised door sign: "Casa da Ana", frame and holes (easy)
- Pet tag: two bits, changed halfway (intermediate)
- "Welcome" sign: script cut out of plywood with a compression bit (intermediate)
- Acrylic keychain: V engraving and a hole (intermediate)
- Large address sign: 90 × 30 cm, large machines only (intermediate)
The "Start here" track is: Surface the spoilboard → Depth test → Coaster → Door sign. Show progress with completion marks, without overdoing the gamification.

9. NEW WARNINGS
- "Needs an accessory": yellow warning with a "See in store" button.
- "Bit not suitable for plates": error, suggesting another bit the person has.
- "Compression bit: step down increased to 3.5 mm": informational warning.
- "Part larger than your machine": error, showing which machines it would fit on.

10. CONFIGURATION > MY MACHINE
Show the machine data read-only (work area, maximum speed, head, controller). A "Change machine" button reruns the onboarding. At the end of the machine list, leave a discreet "Other machine (generic GRBL)" option.

Start with the "My workshop" onboarding and the "First cuts" gallery; then update Create (bit chip), Prepare (speed) and Cut (Makita dial).
