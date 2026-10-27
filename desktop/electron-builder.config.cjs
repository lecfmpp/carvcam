// Empacotamento do CarvCAM, espelhando o package.json "build" do gSender 1.6.4:
// NSIS assistido, instalação para todos os usuários (Program Files), asar com os módulos nativos
// (serialport) fora dele, atualizações pelas releases do GitHub e assinatura de código opcional.
// Assinatura: veja docs/assinatura-de-codigo.md. Sem as variáveis, o instalador sai sem assinatura.
const azure = process.env.AZURE_SIGNING_ENDPOINT && process.env.AZURE_SIGNING_ACCOUNT && process.env.AZURE_SIGNING_PROFILE;

/** @type {import("electron-builder").Configuration} */
module.exports = {
  appId: "com.carvcam.app",
  productName: "CarvCAM",
  copyright: "Copyright © 2026 CarvCAM",
  asar: true,
  asarUnpack: ["**/*.node"],
  files: ["main.mjs", "app/**", "bridge/**", "package.json", "LICENSE"],
  directories: { buildResources: "build", output: "release" },
  compression: "normal",
  npmRebuild: false, // o serialport usa N-API (binários prontos para win32-x64, sem compilar)
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
  // Linux como o gSender: AppImage e .deb. x64 para PCs; arm64 e armv7l para o Raspberry Pi.
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
  // .deb instala uma regra udev para a controladora USB funcionar sem entrar no grupo dialout.
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
    createDesktopShortcut: false, // a página final pergunta (build/installer.nsh)
    createStartMenuShortcut: true,
    shortcutName: "CarvCAM",
    include: "build/installer.nsh",
  },
  publish: [{ provider: "github", owner: "lecfmpp", repo: "carvcam", releaseType: "release" }],
};
