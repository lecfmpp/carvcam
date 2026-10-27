# Parity with CAMLab

CAMLab is Sienci's 3D CAM; it runs in the browser and is **based on Kiri:Moto** (Stewart Allen). Sources: the CAMLab screenshot, the [Choosing Software](https://resources.sienci.com/view/lmk2-choosing-software/) page, the [Kiri:Moto operations documentation](https://docs.grid.space/kiri-moto/CAM/ops/) and the [GridSpace/grid-apps](https://github.com/gridspace/grid-apps) repository (**MIT license**).

## Feature by feature

| CAMLab | What for | Us today | What is missing |
|---|---|---|---|
| **MACHINE** | Choose the machine | ✅ Sienci catalog with real travel and speeds | — |
| **IMPORT +** (STL, multiple parts) | Bring in 3D models | ❌ | STL import (and SVG, already planned) |
| **Material Size** X×Y×Z | Stock | ✅ Stock computed from the part + margin | Free-form stock, larger than the part |
| **Positioning:** origin center / origin top / snap to top / z top offset / z segment | Where zero is | ⚠️ Fixed: bottom-left corner, top face | Origin at center, Z offset at top, "snap to top" for STL |
| **TOOLS** (library) | Choose the bit | ✅ Sienci bits with compatibility | Use ball nose (currently blocked because it is 3D) |
| **ARRANGE** | Multiple parts on the stock | ❌ (one part per project) | Part arrangement/nesting |
| **GENERATE / EXPORT** | Generate and save the G-code | ✅ Generates, **verifies** and downloads the .nc | — |
| **Settings load/save** | Save settings and project | ⚠️ Saved only in the browser | Save/open a project file |
| **Path Alterations:** pocket only / depth first / clockwise | Fine-tuning the toolpath | ⚠️ "Pocket only" ≈ no outer cutout; direction exists in the engine but is not shown on screen; depth first does not exist | Expose in Pro mode |
| **ROUGHING** | 3D roughing | ❌ | 3D CAM |
| **FINISHING** (step down, feed, plunge) | Finishing | ⚠️ 2.5D yes, with values from the Sienci table; Pro shows them but does not allow editing | Editable fields in Pro; 3D finishing |
| **RELIEF** | 3D relief | ❌ (only 2.5D relief of letters and shapes) | 3D finishing with ball nose |
| **DRILLING** | Drilling | ✅ Peck-drilled or pocketed holes | Detect holes in an STL |
| **CUTOUT TABS** | Holding tabs | ✅ Count and height | Place tabs by hand |
| **FEEDS** | Feed and spindle speed | ✅ **Better:** official Sienci table per bit and material | — |
| **?** (help) | Help | ✅ Videos per step (links still to be filled in) | — |
| Preview / animation | See it before cutting | ✅ **Better:** material-removal simulation in 2D/3D | 3D preview of STL |

**Where we are already better:** designing signs and lettering without another program, warnings that tell you what to do, the official speeds table, bit × router compatibility, cut simulation, G-code verifier and the complete flow all the way to cutting.

**Where we are behind:** everything that starts from an **STL** (import, 3D roughing, 3D finishing/relief, arrangement) and part of the fine-tuning (origin, pass order, editable values).

## How to reach parity

### Phase 1: 2.5D adjustments (small, days)
- **Editable Pro mode:** feed, plunge, step down, stepover and RPM (the engine already accepts `cut` as an override).
- **Cut direction** (climb/conventional; the engine already has `direction`) and **depth first** (each element all the way to the bottom before moving on to the next).
- **Origin at center** and Z offset at the top (the post-processor only shifts the coordinates; the verifier follows along).
- **Free-form stock**, larger than the part.
- **Save/open project** (`.gsproj`, JSON of the specification) and export only the G-code.

### Phase 2: STL and 3D with the Kiri:Moto engine (medium, weeks)
- **Why Kiri:Moto:** it is what CAMLab itself uses. It has an MIT license and an **engine API that runs in a Web Worker** (`kiri.newEngine().load(stl).setMode("CAM").setStock().setTools().setProcess({ops}).slice().prepare().export()`), with the Rough, Outline, Contour (X/Y finishing), Level, Drill, Trace and Pocket operations. Rebuilding 3D CAM from scratch would be months of work.
- **Integration:**
  - In Create, a "3D part (STL)" option: import, scale, rotate and "snap to top".
  - Roughing and finishing bits chosen from the Sienci bits; ball nose becomes allowed.
  - Speeds from the Sienci table (which already has ball nose rows for finishing).
- **What stays ours:**
  - Kiri's G-code goes through **our verifier**.
  - The preview uses **our simulation**, which needs to learn the ball nose shape.
  - Prepare, Position and Cut stay the same.
- **Risk:** the Kiri:Moto forum reports bugs in the engine API (roughing that depends on outline, origin requiring extra calls). The plan is to pin a version, cover it with acceptance tests (as we already do with the "Casa da Ana" sign) and report or fix upstream.

### Phase 3: arrangement and extras
- Multiple parts on one stock (manual arrangement first, then automatic) and hand-placed tabs.
- Image → relief (depth map) as an evolution of 3D relief.

## Suggested order, together with what has already been requested
1. gControl mode (in progress)
2. SVG importer
3. Parity phase 1 (2.5D adjustments)
4. Parity phase 2 (STL + 3D via Kiri:Moto)
5. Phase 3
