# CarvCAM desktop (Electron): Windows, Mac, Linux and Raspberry Pi

An Electron app with an NSIS installer that bundles carvcam-bridge (USB through `serialport`,
and Ethernet on the SLB's port 23). Users don't need Node.js or anything other than the installer.

| | CarvCAM |
|---|---|
| App | Electron 33 |
| Installer | Assisted NSIS, per machine (Program Files) (`electron-builder.config.cjs`) |
| Pages | License, folder, install, finish page with shortcut and "Run" (`build/installer.nsh`) |
| Launch after install | As the normal user (through explorer.exe) |
| Native modules | `asarUnpack` of the `.node` files (serialport, prebuilt N-API binary) |
| Updates | electron-updater + GitHub Releases (`lecfmpp/carvcam`) |
| Signing | DigiCert, SSL.com eSigner or Azure (`build/sign.cjs`) |
| File name | `CarvCAM-0.1.0-Windows-64Bit.exe` |
| Linux | AppImage and .deb, with a udev rule for USB (no dialout group) |
| Raspberry Pi | arm64 and armv7l (AppImage and .deb) |
| Mac | .dmg + .zip (Intel and Apple Silicon); signed and notarized with the Apple secrets, otherwise ad-hoc signed |

## How it works
`main.mjs` starts the bridge on `127.0.0.1:8765`, serves the built app at `http://127.0.0.1:4173`
(always the same port, because projects and the workshop live in browser storage, which is
separate per address) and opens the window. External links open in the system browser. Single instance.

## Run it and build the installer
```
cd desktop
npm install
npm start            # builds ../app and opens the window
npm run dist:win     # builds release/CarvCAM-<version>-Windows-64Bit.exe
npm run dist:linux   # AppImage and .deb (LINUX_ARCHS=x64,arm64,armv7l to include the Raspberry Pi)
npm run dist:mac     # .dmg (on a Mac only)
```
On Linux, `dist:win` needs Wine (NSIS uses it to build the uninstaller). The usual route is
GitHub Actions (`.github/workflows/installers.yml`), which runs on Windows: every push builds
the installers as artifacts, and a `v*` tag publishes them to the Release, signed if the secrets exist,
with fixed-name copies (`CarvCAM-Windows-64Bit.exe`, `CarvCAM-Linux-x86_64.AppImage`...) for the
website links under `releases/latest/download/`.

## Mac without an Apple certificate
Until the Apple Developer secrets exist (see below), the Mac build is ad-hoc signed and not notarized.
It runs on Intel and Apple Silicon, but the first open needs one confirmation:
1. Open the `.dmg` and drag CarvCAM to Applications.
2. Open CarvCAM. macOS says it can't check it for malicious software: click **Done** (or Cancel).
3. Open **System Settings › Privacy & Security**, scroll to "CarvCAM was blocked…" and click **Open Anyway**,
   then confirm. (On macOS 14 and older, right-click the app › Open › Open also works.)

Automatic updates on Mac need the real signature (Squirrel.Mac checks it), so until then Mac users
download new versions from the website.

## Signing
See [docs/code-signing.md](../docs/code-signing.md).
