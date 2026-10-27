# Carbide Create Core and Shapeoko machines

Source: https://carbide3d.com/carbidecreate/core-vs-pro/ (read on 10/25/2026), specifications of the Shapeoko 4, the Shapeoko 5.1 Pro and the Carbide Compact Router on the Carbide 3D store, and the Carbide 3D community.

## 1. The point that changes the positioning

**Carbide Create Core** is free, but **it only generates G-code for Carbide 3D machines** (Shapeoko and Nomad). Saving "standard G-code for any CNC" is a **Pro** feature, which costs US$ 120 per year or US$ 360 for a lifetime license.

Two consequences follow:

- **Sienci owners:** cannot use Core. Our product delivers for free what Carbide charges for (G-code for any GRBL machine). This reinforces the positioning in doc 04.
- **Shapeoko owners:** already have Core for free, and it has more design tools than we do. To attract these people, working with their machine is not enough. We need, at a minimum, Core's design features, plus what it lacks: an AI assistant, a guided workflow, pre-cut checks, and browser or gControl support.

All Shapeokos run **GRBL 1.1** (ATmega board, including the 5 Pro). The G-code from our GRBL post-processor already runs on them. Carbide Motion, their control program, loads any `.nc` file. Bit changes with the BitSetter use `M6 Tn`, which we already emit when the project has more than one bit.

## 2. Core features compared with ours

Legend: ✅ we have it · 🟡 partial · ❌ we don't have it.

### Design

| Core feature | Us | Notes and what is missing |
| --- | --- | --- |
| Basic shapes, polygons, polylines | 🟡 | We have rectangle (with radius), circle and line. Regular polygon, star and freehand polyline are missing. |
| Bézier curves | ❌ | For now they only come in through imported SVG. The pen tool with editable nodes is missing. |
| Straight and arched text | 🟡 | Straight text with 3 fonts. Arched text and more fonts are missing (including single-stroke fonts for V engraving). |
| Boolean operations (weld, union, intersection, subtract) | 🟡 | The engine already does all of this (Clipper2), but the interface does not expose it. Today raised elements merge automatically. |
| Vector offset (inward and outward) | ❌ | The engine already has `offset()`. The interface action is missing ("X mm outline", which works as a sign frame). |
| Alignment tools | ❌ | Today you can only drag. Align and distribute, and centering on the plate, are missing. |
| Background image for tracing | ❌ | It is simple: an image as a reference layer that is not cut. |
| Automatic image to vector | ❌ | Requires a vectorizer (potrace in WASM or imagetracer.js), with threshold and smoothing. |
| SVG and DXF import | 🟡 | **SVG done in this round.** DXF is missing (LINE, LWPOLYLINE, ARC, CIRCLE, SPLINE). |
| Design element library | 🟡 | 4 icons. An SVG library (borders, frames, icons) is missing, which can now be fed through the importer. |

### Machining

| Core feature | Us | Notes and what is missing |
| --- | --- | --- |
| Pocket | ✅ | Using concentric rings, with verification and simulation. |
| Inside and outside contour | 🟡 | We do outside (profile with tabs) and inside (cut-throughs). "On the line" and choosing inside/outside per element are missing. |
| **V-carving** | ❌ | **This is the biggest gap.** Today the V-bit only follows the line at a fixed depth. Real V-carving varies the depth with the stroke width (medial axis), which is what makes lettering look good. |
| Basic engraving | ✅ | Engraving with a straight bit and line engraving with a V-bit. |
| Bit library with feeds and speeds | ✅ | Sienci catalog with the official table. The Carbide 3D library is missing (section 3). |
| 3D simulation | ✅ | 3D heightmap and top view. |

### Pro features (for the record)

| Feature | Us | Notes |
| --- | --- | --- |
| Standard G-code for any CNC | ✅ | **Free for us.** This is the main argument. |
| Advanced engraving (outline with hatching) | ❌ | Easy after V-carve: fill with parallel lines. |
| Rest machining | 🟡 | The engine already computes where the bit cannot reach (`unreachable`). Running a second, smaller bit only there is missing. |
| Ramp entry (contour and pocket) | ❌ | Today we plunge straight down and cap the plunge at 300 mm/min. A ramp is better for the bit and is part of phase 1 in doc 05. |
| 3D roughing and finishing, STL, image as relief | ❌ | Phases 2 and 3 of doc 05 (Kiri:Moto engine). |
| Splitting into parts (tiling) | ❌ | Useful for the Shapeoko 4 Standard and the LongMill 12×30. Comes later. |

### Platform

| | Core | Us |
| --- | --- | --- |
| Mac and Windows, works without internet | ✅ | Desktop (Electron, like gSender) and browser. Working offline in the browser requires a PWA, which is missing. |
| Video training | ✅ | Video cards in the interface (the links are still missing). |

## 3. How to include the Shapeokos

### Multi-brand machine catalog

Today the catalog lives in the `sienci` namespace. The proposal is:

- Create `catalog/carbide3d/` with the same data shape (machines, heads, bits, table and projects), behind a common registry `catalog/index.ts` (`brands: sienci | carbide3d | generic`).
- `SienciConfig` becomes `MachineConfig { brand, machine, head, bit, ... }`. The old name stays as an alias so nothing breaks.
- In the interface, the machine picker gets the brand at the top: **Sienci Labs** (first, because it is the focus), **Carbide 3D** and **Other GRBL machine**. The last one asks for X/Y/Z travel and the head type.

### Machines (official Carbide 3D travel)

| Machine | X × Y × Z travel | Motion | Head |
| --- | --- | --- | --- |
| Shapeoko 4 Standard | 17.5″ × 17.5″ × 4″ (445 × 445 × 102 mm) | Belt, V-wheels | 65 mm router |
| Shapeoko 4 XL | 33″ × 17.5″ × 4″ (838 × 445 × 102 mm) | Belt | 65 mm router |
| Shapeoko 4 XXL | 33″ × 33″ × 4″ (838 × 838 × 102 mm) | Belt | 65 mm router |
| Shapeoko Pro (Std/XL/XXL) | Same travel as the 4 | Belt, linear rails | 65 mm router |
| Shapeoko 5.1 Pro 2×2 | 24.53″ × 24.53″ × 6.1″ (623 × 623 × 155 mm) | Ball screws | 65 mm router or VFD spindle |
| Shapeoko 5.1 Pro 4×2 | 48.7″ × 24.53″ × 6.1″ (1237 × 623 × 155 mm) | Ball screws | 65 mm router or VFD spindle |
| Shapeoko 5.1 Pro 4×4 | 48.7″ × 48.7″ × 6.1″ (1237 × 1237 × 155 mm) | Ball screws | 65 mm router or VFD spindle |
| Shapeoko HDM | 690 × 610 × 145 mm | Ball screws | Water-cooled VFD spindle |
| Nomad 3 (desktop) | 8″ × 8″ × 3″ (203 × 203 × 76 mm) | Enclosed | Built-in 130 W spindle |

Before publishing, the maximum speeds ($110–112) need to be confirmed against the Carbide Motion profiles. They are not on the public pages.

### Heads

- **Carbide Compact Router** (manual, dial from 1 to 6). The store's table gives 1 ≈ 11,000, 2 ≈ 13,500, 3 ≈ 18,250, 4 ≈ 24,500, 5 ≈ 29,250 and 6 ≈ 31,000 rpm. The old forum table is different (1 = 10,000 up to 6 = 32,000, with half steps), so it is best to use the store's table and show the dial number as we do today with the Makita.
- **Makita RT0701C**, accepted as an alternative on 65 mm machines. Already in the catalog.
- **Carbide VFD Spindle**: speed set by G-code (S), like the AutoSpin.

### Carbide 3D bits

Bits such as #201 (1/4″ straight, which ships with the machine), #102 (1/8″), #112 (1/16″), #301 (90° V) and #302 (60° V) follow the same shank-and-collet compatibility rule. The numbers and diameters need to be checked on the store before entering the catalog; we do not copy Carbide's feeds table. For Shapeoko we use values computed from chip load and machine rigidity (belt vs ball screw), marked as "calculated values" (the `NO_SIENCI_TABLE` warning already covers this).

### Starter projects

The current 7 projects already adapt to the machine's travel (`projectsForMachine`), so they work for Shapeoko without changes. Only the "first cut" text changes, which should mention the BitSetter when the machine has one.

### Caveats

- **Trademark and images:** saying "Shapeoko compatible" is nominative use. Do not use Carbide 3D's logo or photos.
- **Relationship with Sienci:** if the product is offered to Sienci, including other brands may be unwelcome. It is worth making this configurable at build time (`BRANDS=sienci` or `BRANDS=all`).

## Status (updated after steps 2 and 3)

Done:

- **Shapes:** regular polygon and star, alongside rectangle, circle and line.
- **Arched text:** "Curve" control from −100% to 100% (half turn).
- **Vector offset:** "Thicker / thinner" thickens or thins any element; "Outline ring" adds a ring around it at a chosen distance.
- **Booleans:** automatic union between elements that touch. "Subtract" removes the element's shape from the others (for example, a moon). "Mask" makes the others keep only the part inside.
- **Align and distribute:** Shift+click selects several. You can align to the selection, or to the plate when there is only one element, and distribute when there are 3 or more. Dragging moves the group.
- **DXF import:** together with SVG, through the same button and by dragging the file in. Reads lines, polylines with arcs, circles, arcs, ellipses and splines, with units.
- **Real V-carve:** the depth follows the stroke width. The depth value becomes the limit. Where the stroke would exceed the limit, the bottom stays flat and the `VCARVE_FLAT_BOTTOM` warning appears.
- **Hatching** (a Pro feature): "Outline + lines" instead of clearing out the engraved area, with spacing and angle.

Still missing to match Core: a freehand Bézier curve tool, a background image for tracing, automatic image vectorization and a larger element library. "Subtract" applies to every element the shape covers, not just one.

## 4. Suggested order

Matches doc 05 (parity with CAMLab):

1. **Multi-brand catalog and Shapeoko** (machines, Compact Router, VFD, bits and brand in the picker). It is small and unlocks Shapeoko owners.
2. **Design parity with Core:** offset, booleans in the interface, align and distribute, polygon and star, arched text and DXF.
3. **Real V-carve** (medial axis and variable depth), plus hatching. It is the most visible missing feature.
4. Phase 1 of doc 05: editable parameters in Pro mode, ramping, origin and save/open project.
5. Background image and automatic vectorization.
6. Phases 2 and 3 of doc 05 (3D, STL, image as relief) and splitting into parts.

By the end of step 3, we match Core in everything except image vectorization, and we still generate G-code for any GRBL machine, which in Carbide Create requires Pro.
