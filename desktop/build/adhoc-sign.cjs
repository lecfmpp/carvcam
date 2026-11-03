// afterPack: on Mac builds without an Apple certificate, give the app an ad-hoc signature ("-").
// Apple Silicon only runs signed code, and electron-builder 25 can't ad-hoc sign by itself (it skips
// signing entirely without a Developer ID, and on every pull-request build). With a certificate,
// electron-builder signs over this afterwards with the real identity, hardened runtime and notarization.
const { execFileSync } = require("node:child_process");
const { join } = require("node:path");

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== "darwin" || process.env.CSC_LINK) return;
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  console.log(`  • ad-hoc signing  app=${app}`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
  execFileSync("codesign", ["--verify", "--deep", "--strict", app], { stdio: "inherit" });
};
