# Send to gSender with one click

Source: [Sienci-Labs/gsender](https://github.com/Sienci-Labs/gsender), default branch at commit `426eaa1`
(2026-10-16, `package.json` 1.6.4), read on 2026-11-03. Paths are relative to that repository.

Goal: the **Send to gSender** button in Prepare loads the verified G-code into a running gSender (on this
computer, a gControl or a Raspberry Pi in the shop), so the person only presses Start in gSender.
Code: `app/src/lib/gsender.ts` and `app/src/components/SendToGsender.tsx`. CarvCAM can also run the
machine itself; this is for people who keep gSender as their sender.

## 1. Where gSender's server listens
gSender desktop is an Electron app that starts an embedded Express + Socket.IO server
(`src/main.js` calls `launchServer()` from `src/server-cli.js`).

| Situation | Host | Port | Source |
|---|---|---|---|
| Desktop, Remote Mode **off** | `127.0.0.1` | **random** (`port: 0`) | `src/server-cli.js`: `defaultHost = isElectron() ? '127.0.0.1' : '0.0.0.0'`, `defaultPort = isElectron() ? 0 : 8000` |
| Desktop, Remote Mode **on** | the IP chosen in the dialog (LAN IP) | chosen, **8000** by default | `src/server/index.js` (`remoteSettings`); dialog in `src/app/src/features/RemoteMode/index.tsx` |
| Headless server (`server-cli`, Docker, headless Pi) | `0.0.0.0` | **8000** | `src/server-cli.js` |

- **With Remote Mode off, nothing outside gSender can find it**, not even on the same computer: the port is
  random on every launch and only gSender's own window knows it (IPC `check-remote-status`).
- With Remote Mode on, it listens **only on the chosen IP** (not `127.0.0.1`), so the same computer also
  uses that IP:port.
- So CarvCAM asks for the **Remote Mode address** (the one gSender shows next to its QR code). With none
  saved it tries `127.0.0.1:8000`, which only works with the headless server.
- If the IP goes away (DHCP), gSender turns Remote Mode off and says so; the saved address in CarvCAM is
  then wrong too, and the error message tells the person to check it.

## 2. Authentication
- `POST /api/signin` (`src/server/api/api.users.js`): with no users in `.cncrc` it returns
  `{ enabled: false, token }`, a JWT signed with the `.cncrc` secret. With users it needs name + password (401).
- **The token isn't enforced today.** In `src/server/app.js` ("Secure API Access") the JWT error handler sets
  `bypass = true` and calls `next()`, and `authorizeIPAddress` (`src/server/access-control.js`) lets everything
  through (`let pass = true; // TODO`).
- CarvCAM signs in when the page is local (desktop app, `try-carvcam`) and sends `Authorization: Bearer` if it
  gets a token; on failure it carries on without one. On the hosted https page it skips sign-in (see CORS).
  Accounts with passwords in gSender would need a credentials prompt (not built).

## 3. Loading the file: `POST /api/file`, not `POST /api/gcode`
`POST /api/gcode` (`api.gcode.js`) needs a connected machine (400 without `port`), passes the name as a string
where `GrblController`'s `gcode:load` now expects a `meta` object (the name is lost), and skips `CNCEngine`, so
gSender's window isn't told to redraw.

`POST /api/file` (`api.file.js`) is what gSender's own "Load File" uses (`src/app/src/lib/fileupload.ts`):
- `multipart/form-data` with `gcode` (the file; its name is the job name), `port` (may be empty) and
  `visualizer=VISUALIZER_PRIMARY`. Multer in memory, no size limit configured.
- The server reads the file as **latin1**; CarvCAM strips accents first (they only appear in comments).
- `CNCEngine.load(...)` stores the G-code, loads it into the controller when there is one on that port, and
  emits `file:load` to **every** window, whose saga parses and draws it like a local open.
- Answers 200 `{ msg: 'Successfully loaded file' }`.
- **Works with no machine connected:** the file stays in CNCEngine and is handed to the controller when the
  person connects. CarvCAM then says "Connect your machine in gSender first, then press Start".

**Running job:** `gcode:load` calls `workflow.stop()`, so sending during a job would stop it. CarvCAM checks
`GET /api/controllers` first and refuses when any controller's `workflow.state` isn't `idle` or the firmware
state is Run, Hold or Door.

## 4. Finding the machine: `GET /api/controllers`
Returns `controller.status` for each open controller (`port`, `ready`, `controller.type`,
`controller.state.status.activeState`, `workflow.state`…). Empty list = no machine connected. CarvCAM also uses
it to confirm the address is gSender (it must be a JSON array).

## 5. CORS and browsers
- `app.use(cors())` with defaults: `Access-Control-Allow-Origin: *`, preflight answered on every route, no
  `Access-Control-Allow-Private-Network`.
- From `http://127.0.0.1:4173` (desktop app, `try-carvcam`) to `127.0.0.1` or a LAN IP: works (tested in headless
  Chrome against a server with the same middleware).
- From the hosted **https** app to `http://192.168.x.x`: blocked as mixed content; CarvCAM doesn't try and explains.
- From the hosted app to `127.0.0.1`: Chrome may ask for local-network permission. Not tested.
- To stay CORS-simple there, CarvCAM only does `GET /api/controllers` and the multipart `POST /api/file` with no
  extra headers.

## 6. Flow
1. Address from Settings › gSender address (or "Change" in Prepare), normalized to `http://host:port`
   (port 8000 if missing). Empty → `http://127.0.0.1:8000`.
2. `GET /api/controllers` (3 s). Network error → "gSender isn't answering"; timeout → "No answer"; not an array → "isn't gSender".
3. Any busy controller → refuse ("A job is running in gSender").
4. Port: the first `ready` controller, else the first; none → `""`.
5. Local page: `POST /api/signin` `{}` (3 s), token optional.
6. `POST /api/file` multipart (20 s).
7. Success: "Loaded as X.nc. Open gSender and press Start." (or "Connect your machine in gSender first…").

## 7. What was tested
- Unit tests (`app/src/lib/gsender.test.ts`) with a mocked transport.
- A test server with the **same versions** of express 4.16.4, cors 2.8.5, express-jwt 5.3.1 and multer
  1.4.5-lts.1 in `app.js` order (CNCEngine faked): the upload arrives with the right fields, name and content,
  through Node's fetch and headless Chrome clicking the button.
- **Not tested against a real gSender or machine**: the file showing in gSender's visualizer, Start, and
  Remote Mode on a gControl or Pi still need a real check.
