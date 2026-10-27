# gSender — Reverse Engineering Report

**Target:** [Sienci-Labs/gsender](https://github.com/Sienci-Labs/gsender) v1.6.4 (code in `src/`)
**Tool:** [REA – Reverse Engineer Anything](https://github.com/morluto/rea) (`rea-agents analyze-javascript-application`)
**Evidence:** `ev_c017619b…` · target SHA-256 `9adc212f…` · summary in [`rea-evidence-summary.json`](./rea-evidence-summary.json)

> REA performed the static analysis (module graph, Electron IPC, endpoints, windows, preload). Where REA marks a relationship as "candidate"/"inferred", I confirmed it by reading the source code. Anything that was not executed at runtime is marked as such.

---

## 1. Analysis figures

| Metric | Value |
|---|---|
| Relevant files / JS files parsed | 836 / 816 (0 failures) |
| AST nodes visited | 412,156 |
| Nodes in the application graph | 5,318 (3,332 JS modules, 813 assets) |
| Nodes in the semantic graph | ~45 thousand (1,327 functions, 2,818 call sites, 43 listeners) |
| Front-end lines of code (TS/JS) | ~109 thousand |
| `BrowserWindow` windows | 2 |
| IPC channels (main) | 17 |
| HTTP `/api/*` endpoints | 39 path+method combinations |
| Settings items in the Config menu | 16 sections, ~155 fields |

---

## 2. Architecture (what gSender really is)

```
┌─────────────────────────── Electron (main) ───────────────────────────┐
│ main.js · WindowManager.js · 17 ipcMain handlers                       │
│   └─ starts an embedded Node/Express server (server-cli.js)            │
└───────────────┬───────────────────────────────────────────────────────┘
                │ HTTP REST (/api/*)  +  Socket.IO (real time)
┌───────────────▼──────────────── Server (Node) ────────────────────────┐
│ server/api/*        → REST: gcode, macros, state, prefs, jobstats…     │
│ server/services/cncengine → Socket.IO, serial port / Ethernet          │
│ server/controllers/Grbl, Grblhal → line parsers, runner, feeder        │
│ server/lib/SerialConnection, Firmware/Flashing, ToolChanger, Toolpath │
└───────────────┬───────────────────────────────────────────────────────┘
                │ serial (serialport 13) or TCP
          ┌─────▼─────┐
          │ CNC GRBL / │
          │  grblHAL   │
          └───────────┘
┌──────────────────────── Renderer (React 18 + Vite) ───────────────────┐
│ Redux Toolkit (9 slices) · Tailwind 3 · Radix UI · Three.js (WebGL)   │
│ Web Workers for G-code parsing/visualization                           │
└───────────────────────────────────────────────────────────────────────┘
```

Key point: **the UI does not talk to the machine directly.** Every action becomes `controller.command(...)` → Socket.IO → Node server → firmware. That is why the interface can be replaced entirely without touching the engine (cncengine + controllers), and the same server already serves **Remote Mode** (phone/tablet through the browser, `/api/remote`).

### 2.1 Electron layer (confirmed by REA)

- **Preload** (`electron-app/preload.js`) exposes `ipcRenderer`, `fs.readFileSync`, `fs.writeFileSync` and `path.join` directly on `window`.
- `WindowManager.js`: `nodeIntegration: true`, `contextIsolation: false`. REA found no `contextBridge` API.
- **IPC channels:** `check-remote-status`, `copy-to-clipboard`, `get-windows-registry`, `grblLog:fetch`, `save-display-scale`, `assignPromptExit`, `change-power-saving`, `file-association-ready`, `get-data`, `receive-data`, `load-recent-file`, `logError:electron`, `open-new-window` (detachable console), `open-upload-dialog`, `reconnect-main`, `remoteMode-restart`.

> ⚠️ **Security note:** with `nodeIntegration` on, `contextIsolation` off and `fs` exposed, any XSS in the renderer becomes file system access. REA found no sender validation in the IPC handlers (`sender_validation_observations: 0`). A new UI should use `contextIsolation: true` and a `contextBridge` bridge with a closed list of functions.

### 2.2 REST API (endpoints found by REA)

| Domain | Endpoints |
|---|---|
| File/job | `POST /api/gcode`, `GET /api/gcode`, `POST /api/file`, `POST /api/watch/files`, `POST /api/watch/file` |
| Control | `GET/POST /api/commands`, `GET/POST /api/mdi`, `GET /api/controllers`, `GET/POST /api/state` |
| Macros | `GET/POST /api/macros` |
| Machine | `GET/POST /api/machines`, `GET/PUT /api/maintenance` |
| History | `GET/PUT /api/jobstats`, `GET /api/alarmList/recent`, `PUT/DELETE /api/alarmList` |
| Preferences | `GET /api/preferences`, `PUT /api/preferences/` |
| Session | `POST /api/signin`, `GET/POST /api/users`, `GET/POST/DELETE /api/events` |
| Remote | `GET/PUT /api/remote` |
| App | `GET /api/version/latest`, `GET /api/version/appUpdateSupport`, `GET /api/releasenotes` |
| Telemetry | `POST /api/metrics/sendData`, `POST /api/metrics/sendUsageData`, `GET/POST /api/metrics/collectUserData` |

### 2.3 Real-time protocol (Socket.IO)

The most-used commands, counted by call sites in the renderer code:

| Command | Uses | What it does |
|---|---|---|
| `gcode` | 82 | sends ad-hoc G-code (jog, zero, move) |
| `homing` / `unlock` / `reset` | 7 / 4 / 5 | homing cycle, clear alarm, reset |
| `gcode:start` / `pause` / `resume` / `stop` | 5 / 3 / 4 / 3 | job lifecycle |
| `gcode:safe` | 7 | moves at safe height |
| `jog:cancel` / `jog:stop` | 4 / 2 | stops continuous jog |
| `feedOverride` / `spindleOverride` / `rapidOverride` | 2 / 2 / 1 | live overrides |
| `macro:run` | 3 | runs a macro |
| `sdcard:*`, `ymodem:*` | several | SD card manager (grblHAL) |
| `toolchange:*`, `wizard:start` | — | tool change (manual / semi-auto / ATC) |
| `lasertest:on`, `feeder:start/stop` | — | laser mode, line feeder |

Connection events: `serialport:list`, `serialport:openController`, `serialport:close`, `networkScan`, `ip:list`, `file:load`, `file:unload`, `flash:*` (firmware flashing).

### 2.4 State (Redux)

`connection`, `controller` (GRBL/grblHAL state, position, alarms), `fileInfo` (loaded G-code, bbox, estimated time), `visualizer`, `preferences`, `shortcuts`, `console`, `helper`, `gSenderInfo`. Persistent preferences live in a separate store, with keys such as `workspace.units`, `workspace.machineProfile`, `widgets.spindle.*`, `widgets.connection.*`, `widgets.atc.*`, `workspace.accessibility.*` (full list in the evidence JSON).

---

## 3. Map of the current UI

### 3.1 Navigation (sidebar with 4 items)

| Route | Screen | Content |
|---|---|---|
| `/` **Carve** | Main workspace | TopBar + 3D Visualizer + controls column + ToolArea + macros bar |
| `/tools` | Grid of 8 tools | Surfacing, Rotary Surfacing, Movement Tuning, XY Squaring, Keyboard Shortcuts, Gamepad, SD Card, Accessory Installation |
| `/stats` | Statistics | Overview, Alarms, Jobs, Maintenance, About |
| `/configuration` | Config | 16 sections and ~155 fields: Basics, Customize UI, Motors, Probe, Action Buttons, Homing/Limits, Spindle/Laser, Accessory Outputs, Rotary, Automations, Tool Changing, Ethernet, Status Lights, Advanced Motors, More Settings, Accessibility |

### 3.2 Layout of the Carve screen

```
┌ TopBar: Connection │ CenterArea (machine state) │ StatusIcons │ Spindle/Laser │ Remote ┐
├──────────────────────────────────────────────┬────────────────────────────────────────────┤
│ Visualizer (Three.js)                        │ Column → Location (DRO, zero, go to)         │
│  · toolpath, grid, axes, tool (STL)          │ ToolArea → FileControl / JobControl / Tools  │
│  · ATC ToolTimeline                          │   Tools = tabs: Jogging, Probe, Macros,      │
│  · recent files, watch directory, editor     │   Spindle, Coolant, Rotary, Console, ATC…   │
├──────────────────────────────────────────────┴────────────────────────────────────────────┤
│ PortraitMacroBar (in portrait mode)                                                        │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Feature modules (`app/src/features`, 40 folders)

ATC, AccessoryInstaller, Axes, Config, Connection, Console, Coolant, DRO, DataCollection, FileControl, Gamepad, Helper, IconUpdater, JobControl, Jogging, Keyboard, Location, MachineInfo, MachineStatus, Macros, MovementTuning, NotificationsArea, Preferences, Probe, RemoteMode, Rotary, SDCard, Spindle, Squaring, Stats, StatusIcons, Surfacing, Tools, UnlockButton, Visualizer, WidgetConfig, WorkspaceSelector, navbar.

Wizards: `manualToolchange`, `semiautoToolchange`, `automaticToolchange`, `firstToolchangePrompt`, `probeToolLength`.

---

## 4. The user flow today (the journey of one cut)

1. **Connect**: choose port/baud or IP → `serialport:openController`
2. **Unlock/Home**: `unlock` / `homing` (alarms appear as banners)
3. **Load file**: `.nc/.gcode` → `POST /api/gcode` → worker parses it → visualizer
4. **Position and zero**: jog (buttons, keyboard, gamepad) → zero XYZ or **Probe** (touch plate)
5. **Check**: outline, "check file", time estimate, limits (SoftLimitsWarning)
6. **Run**: `gcode:start` → feed/spindle overrides → pause/resume → tool change (wizards)
7. **Finish**: JobEndModal → jobstats/maintenance

### 4.1 Pain points (findings for the new UX)

| # | Problem | Evidence |
|---|---|---|
| 1 | **Too much at once.** Carve shows connection, DRO, jog, probe, macros, spindle, coolant, rotary and console together | Layout of ToolArea + Column |
| 2 | **Huge Config with no risk hierarchy.** ~155 fields, with "Advanced Motors" next to "Customize UI" | `SettingsMenu.ts` |
| 3 | **The flow has no order.** Connect → home → zero → run depends on the user already knowing the sequence | no global stepper; only isolated wizards |
| 4 | **Expert vocabulary**: GRBL, $-settings, MDI, WCS, feed override | labels and Console |
| 5 | **It creates nothing.** The app only sends G-code. The user needs an external CAM (Easel, Carbide Create, Fusion), except for Surfacing, which generates G-code internally | `features/Surfacing` generates G-code; everything else only loads files |
| 6 | **Unreadable alarms**: numeric codes with little guidance on "what to do now" | `alarmList`, UnlockAlarmButton |
| 7 | **The technical foundation is already there**: Three.js with STLLoader, workers and Remote Mode over the web. A new UI can reuse all of it | `lib/three/STLLoader.ts`, `workers/`, `api.remote.js` |

---

## 5. What can be reused in a new interface

- **Keep:** the Node server (cncengine + Grbl/grblHAL controllers), the REST API and the Socket.IO protocol. They are stable and independent of the UI.
- **Replace:** the entire renderer. A new React/Vite app can connect to the same server, the same way Remote Mode already does.
- **Add:** a "Create" layer (AI → 3D model → CAM → G-code) before the sending flow. It is the missing piece for a beginner.

## 6. Limitations of this analysis

- Static analysis of the source code. Nothing was executed against a real machine.
- REA marks dynamic relationships (runtime registration, dynamically built channels) as unproven. The absence of a finding does not prove that the thing does not exist.
- The "candidate" endpoints come from `authrequest.get/post` calls with a literal path. Some `store.get(...)` entries that REA classified as "network" are actually local preference keys, and were separated out in the JSON.
