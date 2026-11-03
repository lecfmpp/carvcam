// Signs each .exe in the package (the app and the installer); called by electron-builder.
// Pick the service with WIN_SIGN_PROVIDER; without it (or off Windows) nothing is signed.
//   digicert : DigiCert KeyLocker (SM_KEYPAIR_ALIAS + smctl on the PATH)
//   sslcom   : SSL.com eSigner (CodeSignTool; ESIGNER_USERNAME, ESIGNER_PASSWORD,
//              ESIGNER_CREDENTIAL_ID, ESIGNER_TOTP_SECRET, CODESIGNTOOL_DIR)
// Azure Artifact Signing doesn't go through here: it's configured in electron-builder.config.cjs.
const { execFileSync } = require("node:child_process");
const path = require("node:path");

exports.default = async (config) => {
  const file = config.path ? String(config.path) : "";
  const provider = process.env.WIN_SIGN_PROVIDER;
  if (process.platform !== "win32" || !provider) {
    console.log(`sign: skipped for ${path.basename(file)} (no WIN_SIGN_PROVIDER)`);
    return;
  }
  if (!file) throw new Error("sign: no file path");
  if (provider === "digicert") {
    execFileSync("smctl", ["sign", `--keypair-alias=${process.env.SM_KEYPAIR_ALIAS}`, `--input=${file}`, "--verbose"], { stdio: "inherit" });
  } else if (provider === "sslcom") {
    const dir = process.env.CODESIGNTOOL_DIR;
    execFileSync(
      path.join(dir, "CodeSignTool.bat"),
      ["sign", `-username=${process.env.ESIGNER_USERNAME}`, `-password=${process.env.ESIGNER_PASSWORD}`, `-credential_id=${process.env.ESIGNER_CREDENTIAL_ID}`, `-totp_secret=${process.env.ESIGNER_TOTP_SECRET}`, `-input_file_path=${file}`, "-override"],
      { cwd: dir, stdio: "inherit", shell: true },
    );
  } else {
    throw new Error(`sign: unknown WIN_SIGN_PROVIDER "${provider}"`);
  }
};
