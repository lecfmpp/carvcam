# CarvCAM

A new UI and CAM for gSender, built for Sienci Labs machines (LongMill and AltMill).
It came from the Leandro-Apps/scanbusinesscard repository (`carvcam/` folder), with its history preserved.

| Folder | What it is |
|---|---|
| `gsender-ui/` | The app (React + Vite): sign design, preparation, positioning, carving and simulation |
| `cam-engine/` | CAM engine in TypeScript: geometry, operations, G-code and the Sienci catalog |
| `docs/gsender-reverse-engineering/` | Research and decisions (gSender reverse engineering, comparisons) |

## Try it

You need [Node.js](https://nodejs.org) 18 or newer. From the repository root:

- **Mac:** double-click `try-carvcam.command`
- **Windows:** double-click `try-carvcam.cmd`
- **Linux / terminal:** `./try-carvcam.sh`

It opens at http://localhost:4173. Details in `gsender-ui/README.md`.
