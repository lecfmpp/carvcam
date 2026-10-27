// Assinatura de cada .exe do pacote (o app e o instalador), chamada pelo electron-builder.
// Escolha o serviço com WIN_SIGN_PROVIDER; sem ele (ou fora do Windows) não assina.
//   digicert : DigiCert KeyLocker, igual ao gSender (SM_KEYPAIR_ALIAS + smctl no PATH)
//   sslcom   : SSL.com eSigner (CodeSignTool; ESIGNER_USERNAME, ESIGNER_PASSWORD,
//              ESIGNER_CREDENTIAL_ID, ESIGNER_TOTP_SECRET, CODESIGNTOOL_DIR)
// Azure Artifact Signing não passa por aqui: é configurado em electron-builder.config.cjs.
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
