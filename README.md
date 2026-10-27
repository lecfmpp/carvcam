# CarvCAM

Design, prepare and carve signs on Sienci Labs machines (LongMill and AltMill) in one app.
Proprietary software — see `LICENSE`. This repository is private.

| Folder | What it is |
|---|---|
| `gsender-ui/` | The app (React + Vite): sign design, preparation, positioning, carving and simulation |
| `cam-engine/` | CAM engine in TypeScript: geometry, operations, G-code and the Sienci catalog |
| `desktop/` | Desktop app (Electron) and installers for Windows, Linux and Raspberry Pi |
| `docs/` | Internal guides (code signing) |

## Try it

You need [Node.js](https://nodejs.org) 18 or newer. From the repository root:

- **Mac:** double-click `try-carvcam.command`
- **Windows:** double-click `try-carvcam.cmd`
- **Linux / terminal:** `./try-carvcam.sh`

It opens at http://localhost:4173. Details in `gsender-ui/README.md`.
