# CarvCAM for Windows (Electron)

The same setup as gSender 1.6.4: an Electron app with an NSIS installer that bundles
carvcam-bridge (USB through `serialport`, and Ethernet on the SLB's port 23). Users don't need
Node.js or anything other than the installer.

| | gSender 1.6.4 | CarvCAM |
|---|---|---|
| App | Electron | Electron 33 |
| Installer | Assisted NSIS, per machine (Program Files) | Same (`electron-builder.config.cjs`) |
| Pages | License, folder, install, finish page with shortcut and "Run" | Same (`build/installer.nsh`) |
| Launch after install | As the normal user (through explorer.exe) | Same |
| Native modules | `asarUnpack` of the `.node` files | Same (serialport, prebuilt N-API binary) |
| Updates | electron-updater + GitHub Releases | Same (`lecfmpp/carvcam`) |
| Signing | DigiCert KeyLocker in CI | DigiCert, SSL.com eSigner or Azure (`build/sign.cjs`) |
| File name | `gSender-1.6.4-Windows-64Bit.exe` | `CarvCAM-0.1.0-Windows-64Bit.exe` |
| Linux | AppImage and .deb | AppImage and .deb, with a udev rule for USB (no dialout group) |
| Raspberry Pi | arm64 and armv7l | arm64 and armv7l (AppImage and .deb) |
| Mac | Signed and notarized .dmg | .dmg (Intel and Apple Silicon); signed with the Apple secrets |

## How it works
`main.mjs` starts the bridge on `127.0.0.1:8765`, serves the built app at `http://127.0.0.1:4173`
(always the same port, because projects and the workshop live in browser storage, which is
separate per address) and opens the window. External links open in the system browser. Single instance.

## Run it and build the installer
```
cd desktop
npm install
npm start            # builds gsender-ui and opens the app
npm run dist:win     # builds release/CarvCAM-<version>-Windows-64Bit.exe
npm run dist:linux   # AppImage and .deb (LINUX_ARCHS=x64,arm64,armv7l to include the Raspberry Pi)
npm run dist:mac     # .dmg (on a Mac only)
```
On Linux, `dist:win` needs Wine (NSIS uses it to build the uninstaller). The usual route is
GitHub Actions (`.github/workflows/installers.yml`), which runs on Windows: every push builds
the installers as artifacts, and a `v*` tag publishes them to the Release, signed if the secrets exist,
with fixed-name copies (`CarvCAM-Windows-64Bit.exe`, `CarvCAM-Linux-x86_64.AppImage`...) for the
website links under `releases/latest/download/`.

## Signing
See [docs/code-signing.md](../docs/code-signing.md).
