// CarvCAM packaging: assisted NSIS installer, per-machine install (Program Files), asar with the native modules
// (serialport) unpacked, updates from GitHub Releases and optional code signing.
// Signing: see docs/code-signing.md. Without the variables, the installer is built unsigned.
const azure = process.env.AZURE_SIGNING_ENDPOINT && process.env.AZURE_SIGNING_ACCOUNT && process.env.AZURE_SIGNING_PROFILE;

/** @type {import("electron-builder").Configuration} */
module.exports = {
  appId: "com.carvcam.app",
  productName: "CarvCAM",
  copyright: "Copyright © 2026 CarvCAM",
  asar: true,
  asarUnpack: ["**/*.node"],
  files: ["main.mjs", "app/**", "bridge/**", "package.json", "LICENSE", "THIRD_PARTY_NOTICES.txt"],
  // License and third-party notices also sit next to the program, where users can read them.
  extraFiles: ["LICENSE", "THIRD_PARTY_NOTICES.txt"],
  directories: { buildResources: "build", output: "release" },
  compression: "normal",
  npmRebuild: false, // serialport uses N-API (prebuilt win32-x64 binaries, nothing to compile)
  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
    artifactName: "${productName}-${version}-Windows-64Bit.${ext}",
    icon: "build/icon.ico",
    ...(azure
      ? {
          azureSignOptions: {
            publisherName: process.env.WIN_PUBLISHER_NAME,
            endpoint: process.env.AZURE_SIGNING_ENDPOINT,
            codeSigningAccountName: process.env.AZURE_SIGNING_ACCOUNT,
            certificateProfileName: process.env.AZURE_SIGNING_PROFILE,
          },
        }
      : { signtoolOptions: { sign: "./build/sign.cjs", ...(process.env.WIN_PUBLISHER_NAME ? { publisherName: process.env.WIN_PUBLISHER_NAME } : {}) } }),
  },
  // Linux: AppImage and .deb. x64 for PCs; arm64 and armv7l for the Raspberry Pi.
  linux: {
    target: [
      { target: "AppImage", arch: (process.env.LINUX_ARCHS || "x64").split(",") },
      { target: "deb", arch: (process.env.LINUX_ARCHS || "x64").split(",") },
    ],
    artifactName: "${productName}-${version}-Linux-${arch}.${ext}",
    icon: "build/icon.png",
    category: "Graphics",
    synopsis: "Design, prepare and carve on your LongMill or AltMill",
    maintainer: "CarvCAM",
    executableName: "carvcam",
    desktop: { Name: "CarvCAM", StartupWMClass: "CarvCAM", Keywords: "CNC;router;LongMill;AltMill;gcode;" },
  },
  // The .deb installs a udev rule so the USB controller works without joining the dialout group.
  deb: { afterInstall: "build/linux-after-install.sh", afterRemove: "build/linux-after-remove.sh" },
  mac: {
    target: [{ target: "dmg", arch: ["x64", "arm64"] }],
    artifactName: "${productName}-${version}-Mac-${arch}.${ext}",
    icon: "build/icon.png",
    category: "public.app-category.productivity",
    hardenedRuntime: true,
    entitlements: "build/entitlements.mac.plist",
    entitlementsInherit: "build/entitlements.mac.plist",
  },
  nsis: {
    oneClick: false,
    perMachine: true,
    allowToChangeInstallationDirectory: true,
    license: "LICENSE",
    installerIcon: "build/icon.ico",
    uninstallerIcon: "build/icon.ico",
    installerSidebar: "build/sidebar.bmp",
    uninstallerSidebar: "build/sidebar.bmp",
    createDesktopShortcut: false, // the finish page asks (build/installer.nsh)
    createStartMenuShortcut: true,
    shortcutName: "CarvCAM",
    include: "build/installer.nsh",
  },
  // Installers live in a separate public repository; this source repository is private.
  publish: [{ provider: "github", owner: "lecfmpp", repo: "carvcam-releases", releaseType: "release" }],
};
