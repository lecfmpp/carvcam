# gSender — Relatório de Engenharia Reversa

**Alvo:** [Sienci-Labs/gsender](https://github.com/Sienci-Labs/gsender) v1.6.4 (código em `src/`)
**Ferramenta:** [REA – Reverse Engineer Anything](https://github.com/morluto/rea) (`rea-agents analyze-javascript-application`)
**Evidência:** `ev_c017619b…` · SHA-256 do alvo `9adc212f…` · resumo em [`rea-evidence-summary.json`](./rea-evidence-summary.json)

> O REA fez a análise estática (grafo de módulos, IPC Electron, endpoints, janelas, preload). Onde o REA marca uma relação como "candidate"/"inferred", confirmei lendo o código-fonte. O que não foi executado em runtime está marcado como tal.

---

## 1. Números da análise

| Métrica | Valor |
|---|---|
| Arquivos relevantes / JS parseados | 836 / 816 (0 falhas) |
| Nós AST visitados | 412.156 |
| Nós no grafo de aplicação | 5.318 (3.332 módulos JS, 813 assets) |
| Nós no grafo semântico | ~45 mil (1.327 funções, 2.818 call-sites, 43 listeners) |
| Linhas de código do front (TS/JS) | ~109 mil |
| Janelas `BrowserWindow` | 2 |
| Canais IPC (main) | 17 |
| Endpoints HTTP `/api/*` | 39 combinações caminho+método |
| Itens de configuração no menu Config | 16 seções, ~155 campos |

---

## 2. Arquitetura (o que o gSender realmente é)

```
┌─────────────────────────── Electron (main) ───────────────────────────┐
│ main.js · WindowManager.js · 17 handlers ipcMain                       │
│   └─ sobe um servidor Node/Express embutido (server-cli.js)            │
└───────────────┬───────────────────────────────────────────────────────┘
                │ HTTP REST (/api/*)  +  Socket.IO (tempo real)
┌───────────────▼──────────────── Server (Node) ────────────────────────┐
│ server/api/*        → REST: gcode, macros, state, prefs, jobstats…     │
│ server/services/cncengine → Socket.IO, porta serial / Ethernet         │
│ server/controllers/Grbl, Grblhal → parsers de linha, runner, feeder    │
│ server/lib/SerialConnection, Firmware/Flashing, ToolChanger, Toolpath │
└───────────────┬───────────────────────────────────────────────────────┘
                │ serial (serialport 13) ou TCP
          ┌─────▼─────┐
          │ CNC GRBL / │
          │  grblHAL   │
          └───────────┘
┌──────────────────────── Renderer (React 18 + Vite) ───────────────────┐
│ Redux Toolkit (9 slices) · Tailwind 3 · Radix UI · Three.js (WebGL)   │
│ Web Workers para parse/visualização de G-code                          │
└───────────────────────────────────────────────────────────────────────┘
```

Ponto importante: **a UI não fala com a máquina diretamente.** Toda ação vira `controller.command(...)` → Socket.IO → servidor Node → firmware. Por isso a interface pode ser trocada inteira sem tocar no motor (cncengine + controllers), e o mesmo servidor já atende o **Remote Mode** (celular/tablet pelo navegador, `/api/remote`).

### 2.1 Camada Electron (confirmado pelo REA)

- **Preload** (`electron-app/preload.js`) expõe `ipcRenderer`, `fs.readFileSync`, `fs.writeFileSync` e `path.join` direto no `window`.
- `WindowManager.js`: `nodeIntegration: true`, `contextIsolation: false`. O REA não achou nenhuma API de `contextBridge`.
- **Canais IPC:** `check-remote-status`, `copy-to-clipboard`, `get-windows-registry`, `grblLog:fetch`, `save-display-scale`, `assignPromptExit`, `change-power-saving`, `file-association-ready`, `get-data`, `receive-data`, `load-recent-file`, `logError:electron`, `open-new-window` (console destacável), `open-upload-dialog`, `reconnect-main`, `remoteMode-restart`.

> ⚠️ **Nota de segurança:** com `nodeIntegration` ligado, `contextIsolation` desligado e `fs` exposto, qualquer XSS no renderer vira acesso ao sistema de arquivos. O REA não encontrou validação de remetente nos handlers IPC (`sender_validation_observations: 0`). Numa UI nova vale usar `contextIsolation: true` e uma ponte `contextBridge` com uma lista fechada de funções.

### 2.2 API REST (endpoints achados pelo REA)

| Domínio | Endpoints |
|---|---|
| Arquivo/job | `POST /api/gcode`, `GET /api/gcode`, `POST /api/file`, `POST /api/watch/files`, `POST /api/watch/file` |
| Controle | `GET/POST /api/commands`, `GET/POST /api/mdi`, `GET /api/controllers`, `GET/POST /api/state` |
| Macros | `GET/POST /api/macros` |
| Máquina | `GET/POST /api/machines`, `GET/PUT /api/maintenance` |
| Histórico | `GET/PUT /api/jobstats`, `GET /api/alarmList/recent`, `PUT/DELETE /api/alarmList` |
| Preferências | `GET /api/preferences`, `PUT /api/preferences/` |
| Sessão | `POST /api/signin`, `GET/POST /api/users`, `GET/POST/DELETE /api/events` |
| Remoto | `GET/PUT /api/remote` |
| App | `GET /api/version/latest`, `GET /api/version/appUpdateSupport`, `GET /api/releasenotes` |
| Telemetria | `POST /api/metrics/sendData`, `POST /api/metrics/sendUsageData`, `GET/POST /api/metrics/collectUserData` |

### 2.3 Protocolo em tempo real (Socket.IO)

Os comandos mais usados, contados por chamada no código do renderer:

| Comando | Usos | O que faz |
|---|---|---|
| `gcode` | 82 | envia G-code avulso (jog, zerar, mover) |
| `homing` / `unlock` / `reset` | 7 / 4 / 5 | ciclo de referência, destravar alarme, reset |
| `gcode:start` / `pause` / `resume` / `stop` | 5 / 3 / 4 / 3 | ciclo de vida do job |
| `gcode:safe` | 7 | movimentos com altura segura |
| `jog:cancel` / `jog:stop` | 4 / 2 | interrompe jog contínuo |
| `feedOverride` / `spindleOverride` / `rapidOverride` | 2 / 2 / 1 | overrides ao vivo |
| `macro:run` | 3 | executa macro |
| `sdcard:*`, `ymodem:*` | vários | gerenciador de SD (grblHAL) |
| `toolchange:*`, `wizard:start` | — | troca de ferramenta (manual / semi-auto / ATC) |
| `lasertest:on`, `feeder:start/stop` | — | modo laser, alimentador de linhas |

Eventos de conexão: `serialport:list`, `serialport:openController`, `serialport:close`, `networkScan`, `ip:list`, `file:load`, `file:unload`, `flash:*` (gravação de firmware).

### 2.4 Estado (Redux)

`connection`, `controller` (estado GRBL/grblHAL, posição, alarmes), `fileInfo` (G-code carregado, bbox, tempo estimado), `visualizer`, `preferences`, `shortcuts`, `console`, `helper`, `gSenderInfo`. Preferências persistentes ficam num store separado, com chaves como `workspace.units`, `workspace.machineProfile`, `widgets.spindle.*`, `widgets.connection.*`, `widgets.atc.*`, `workspace.accessibility.*` (lista completa no JSON de evidência).

---

## 3. Mapa da UI atual

### 3.1 Navegação (sidebar com 4 itens)

| Rota | Tela | Conteúdo |
|---|---|---|
| `/` **Carve** | Workspace principal | TopBar + Visualizer 3D + coluna de controles + ToolArea + barra de macros |
| `/tools` | Grade de 8 ferramentas | Surfacing, Rotary Surfacing, Movement Tuning, XY Squaring, Keyboard Shortcuts, Gamepad, SD Card, Accessory Installation |
| `/stats` | Estatísticas | Overview, Alarms, Jobs, Maintenance, About |
| `/configuration` | Config | 16 seções e ~155 campos: Basics, Customize UI, Motors, Probe, Action Buttons, Homing/Limits, Spindle/Laser, Accessory Outputs, Rotary, Automations, Tool Changing, Ethernet, Status Lights, Advanced Motors, More Settings, Accessibility |

### 3.2 Composição da tela Carve

```
┌ TopBar: Connection │ CenterArea (estado da máquina) │ StatusIcons │ Spindle/Laser │ Remote ┐
├──────────────────────────────────────────────┬────────────────────────────────────────────┤
│ Visualizer (Three.js)                        │ Column → Location (DRO, zerar, ir para)      │
│  · toolpath, grid, eixos, ferramenta (STL)   │ ToolArea → FileControl / JobControl / Tools  │
│  · ATC ToolTimeline                          │   Tools = abas: Jogging, Probe, Macros,      │
│  · recent files, watch directory, editor     │   Spindle, Coolant, Rotary, Console, ATC…   │
├──────────────────────────────────────────────┴────────────────────────────────────────────┤
│ PortraitMacroBar (no modo retrato)                                                         │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Módulos de funcionalidade (`app/src/features`, 40 pastas)

ATC, AccessoryInstaller, Axes, Config, Connection, Console, Coolant, DRO, DataCollection, FileControl, Gamepad, Helper, IconUpdater, JobControl, Jogging, Keyboard, Location, MachineInfo, MachineStatus, Macros, MovementTuning, NotificationsArea, Preferences, Probe, RemoteMode, Rotary, SDCard, Spindle, Squaring, Stats, StatusIcons, Surfacing, Tools, UnlockButton, Visualizer, WidgetConfig, WorkspaceSelector, navbar.

Wizards: `manualToolchange`, `semiautoToolchange`, `automaticToolchange`, `firstToolchangePrompt`, `probeToolLength`.

---

## 4. Fluxo do usuário hoje (jornada de um corte)

1. **Conectar**: escolher porta/baud ou IP → `serialport:openController`
2. **Desbloquear/Home**: `unlock` / `homing` (alarmes aparecem como banners)
3. **Carregar arquivo**: `.nc/.gcode` → `POST /api/gcode` → worker faz o parse → visualizador
4. **Posicionar e zerar**: jog (botões, teclado, gamepad) → zerar XYZ ou **Probe** (touch plate)
5. **Conferir**: outline, "check file", estimativa de tempo, limites (SoftLimitsWarning)
6. **Rodar**: `gcode:start` → overrides de feed/spindle → pausa/retomada → troca de ferramenta (wizards)
7. **Finalizar**: JobEndModal → jobstats/manutenção

### 4.1 Onde dói (achados para a nova UX)

| # | Problema | Evidência |
|---|---|---|
| 1 | **Muita coisa ao mesmo tempo.** Carve mostra conexão, DRO, jog, probe, macros, spindle, coolant, rotary e console juntos | Composição da ToolArea + Column |
| 2 | **Config enorme e sem hierarquia de risco.** ~155 campos, com "Advanced Motors" ao lado de "Customize UI" | `SettingsMenu.ts` |
| 3 | **O fluxo não tem ordem.** Conectar → home → zerar → rodar depende do usuário já saber a sequência | sem stepper global; só wizards isolados |
| 4 | **Vocabulário de especialista**: GRBL, $-settings, MDI, WCS, feed override | labels e Console |
| 5 | **Não cria nada.** O app só envia G-code. O usuário precisa de um CAM externo (Easel, Carbide Create, Fusion), exceto Surfacing, que gera G-code internamente | `features/Surfacing` gera G-code; o resto só carrega arquivo |
| 6 | **Alarmes ilegíveis**: códigos numéricos com pouca orientação de "o que fazer agora" | `alarmList`, UnlockAlarmButton |
| 7 | **A base técnica já está pronta**: Three.js com STLLoader, workers e Remote Mode via web. Uma UI nova pode reaproveitar tudo isso | `lib/three/STLLoader.ts`, `workers/`, `api.remote.js` |

---

## 5. O que dá para reaproveitar numa interface nova

- **Manter:** servidor Node (cncengine + controllers Grbl/grblHAL), API REST e o protocolo Socket.IO. São estáveis e independentes da UI.
- **Trocar:** o renderer inteiro. Uma nova app React/Vite pode se conectar ao mesmo servidor, do mesmo jeito que o Remote Mode já faz.
- **Acrescentar:** uma camada "Criar" (IA → modelo 3D → CAM → G-code) antes do fluxo de envio. É a peça que falta para um leigo.

## 6. Limitações desta análise

- Análise estática do código-fonte. Nada foi executado contra uma máquina real.
- O REA marca relações dinâmicas (registro em runtime, canais montados dinamicamente) como não provadas. A ausência de um achado não prova que a coisa não existe.
- Os endpoints "candidate" vêm de chamadas `authrequest.get/post` com caminho literal. Algumas entradas `store.get(...)` que o REA classificou como "network" são, na verdade, chaves de preferência locais, e foram separadas no JSON.
