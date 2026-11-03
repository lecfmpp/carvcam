// electron-builder configuration. Artifact names match the download links on carvcam.com:
//   CarvCAM-Mac-universal.dmg (+ .zip for auto-update)
//   CarvCAM-Windows-64Bit.exe
//   CarvCAM-Linux-x86_64.AppImage, CarvCAM-Linux-amd64.deb
//   CarvCAM-Linux-arm64.AppImage, CarvCAM-Linux-arm64.deb, CarvCAM-Linux-armv7l.deb (Raspberry Pi)
//
// Environment (all optional; without them the build is unsigned):
//   CSC_LINK, CSC_KEY_PASSWORD          macOS "Developer ID Application" .p12 (base64 or path)
//   APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID   notarization
//   WIN_CSC_LINK, WIN_CSC_KEY_PASSWORD  Windows code signing certificate
//   CARVCAM_UPDATES=1                   embed the GitHub Releases feed (turns on auto-update)
"use strict";

const env = process.env;
const macSigned = !!env.CSC_LINK;
const notarize = macSigned && !!(env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID);
const updates = env.CARVCAM_UPDATES === "1";

/** @type {import("electron-builder").Configuration} */
module.exports = {
  appId: "com.carvcam.app",
  productName: "CarvCAM",
  copyright: "CarvCAM · GPL-3.0",
  directories: { output: "release", buildResources: "build" },
  files: ["package.json", "src/**/*", "renderer/**/*", "build/icon.png", "!**/*.map"],
  asar: true,
  // electron-updater is the only runtime dependency.
  npmRebuild: false,
  publish: updates ? [{ provider: "github", owner: "lecfmpp", repo: "carvcam", releaseType: "draft" }] : null,

  mac: {
    category: "public.app-category.graphics-design",
    icon: "build/icon-mac.png",
    target: [
      { target: "dmg", arch: ["universal"] },
      { target: "zip", arch: ["universal"] },
    ],
    artifactName: "CarvCAM-Mac-${arch}.${ext}",
    // Signed: Developer ID + hardened runtime (needed for notarization).
    // Unsigned: ad-hoc signature ("-"), so Apple Silicon still runs it after right-click > Open.
    identity: macSigned ? undefined : "-",
    hardenedRuntime: macSigned,
    gatekeeperAssess: false,
    entitlements: "build/entitlements.mac.plist",
    entitlementsInherit: "build/entitlements.mac.plist",
    notarize,
    minimumSystemVersion: "12.0",
  },
  dmg: {
    artifactName: "CarvCAM-Mac-${arch}.${ext}",
    title: "CarvCAM",
    writeUpdateInfo: false,
  },

  win: {
    icon: "build/icon.png",
    target: [{ target: "nsis", arch: ["x64"] }],
    artifactName: "CarvCAM-Windows-64Bit.${ext}",
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    shortcutName: "CarvCAM",
    artifactName: "CarvCAM-Windows-64Bit.${ext}",
  },

  linux: {
    icon: "build/icons",
    category: "Graphics",
    executableName: "carvcam",
    syncDesktopName: true,
    synopsis: "Signs and plaques CAM for Sienci Labs machines",
    description: "CarvCAM designs signs and plaques, generates toolpaths and sends the job to gSender.",
    maintainer: "CarvCAM <support@carvcam.com>",
    vendor: "CarvCAM",
    // Arches come from the command line (--x64 / --arm64 / --armv7l).
    target: ["AppImage", "deb"],
    artifactName: "CarvCAM-Linux-${arch}.${ext}",
  },
  appImage: { artifactName: "CarvCAM-Linux-${arch}.${ext}" },
  deb: {
    artifactName: "CarvCAM-Linux-${arch}.${ext}",
    packageName: "carvcam",
  },
};
