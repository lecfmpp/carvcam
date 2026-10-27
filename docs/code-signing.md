# Code signing the Windows installer

Without a signature, Windows shows the blue SmartScreen warning ("Windows protected your PC")
and the user has to click **More info › Run anyway**. Signing replaces "Unknown publisher" with
the company name and makes the warning go away as the installer builds up reputation. Our CI supports three signing services.

> Checked in October 2026. Prices and rules change: confirm on each company's page before
> buying.

## What has changed in recent years (and why it matters)

- **Since June 2023** the certificate's key must live on a physical token or in a cloud signing
  service (HSM). The plain `.pfx` file you used to copy into CI no longer exists.
  To sign on GitHub Actions, use a **cloud** service.
- **EV no longer removes SmartScreen right away.** Since 2024 Microsoft treats EV and OV the same
  way: reputation grows with the downloads of each release. A cloud OV certificate solves the same
  problem for much less.
- **Reputation follows the certificate.** Switching certificates is like starting over; renew the
  same one whenever possible.

## Which one to choose

| Option | For whom | Approximate cost | In our CI |
|---|---|---|---|
| **Azure Artifact Signing** (formerly Trusted Signing) | Companies in the US, Canada, EU or UK; individuals only in the US and Canada | US$ 9.99/month (5,000 signatures) | Yes (`azure`) |
| **SSL.com eSigner** (OV certificate) | Companies (a CNPJ, the Brazilian company registration, works) or individuals, including in Brazil | Annual certificate + eSigner plan | Yes (`sslcom`) |
| **DigiCert KeyLocker** | Companies | The most expensive of the three | Yes (`digicert`) |

**Recommendation for CarvCAM:** if there is a company in the US, Canada, EU or UK, use
**Azure Artifact Signing**: it is the cheapest and the simplest to maintain. If the company is only
Brazilian (or you are an individual in Brazil), use an **SSL.com OV certificate with eSigner**: it
validates a CNPJ or a personal ID document and signs in the cloud, directly from GitHub Actions.

## Step by step

### 1. Prepare the company details
- Legal company name exactly as it will appear in Windows (this is the "Publisher").
- CNPJ (Brazilian company registration) or personal ID document, plus an address and phone number
  that appear in a public source (website, Google Maps or the Receita Federal registry, Brazil's tax
  authority): the certificate authority calls or checks using these details.
- Your own domain with an email address (e.g. `contact@carvcam.com`) helps with validation.

### 2a. Azure Artifact Signing (if you are eligible)
1. Create an Azure account and a subscription (paid by card).
2. In the portal, create an **Artifact Signing account** resource and, inside it, complete the
   **identity validation** (organization). It takes a few business days.
3. Create a **certificate profile** of type *Public Trust*.
4. Create an **App registration** (Microsoft Entra ID) with a secret, and give it the
   *Artifact Signing Certificate Profile Signer* role on the signing account.
5. On GitHub, under **lecfmpp/carvcam › Settings › Secrets and variables › Actions**, add:
   `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_SIGNING_ENDPOINT`
   (e.g. `https://eus.codesigning.azure.net`), `AZURE_SIGNING_ACCOUNT`, `AZURE_SIGNING_PROFILE`
   and `WIN_PUBLISHER_NAME` (the validated name, exactly the same).

### 2b. SSL.com eSigner (company in Brazil or individual)
1. Buy a **Code Signing OV** certificate from SSL.com and choose **eSigner** (cloud) delivery.
2. Send the documents and complete the validation (a few business days).
3. In the SSL.com dashboard, enable eSigner, note the **Credential ID** and keep the **TOTP** secret
   (the authenticator code, as text) for automated signing.
4. Add on GitHub: `WIN_SIGN_PROVIDER` = `sslcom`, `ESIGNER_USERNAME`, `ESIGNER_PASSWORD`,
   `ESIGNER_CREDENTIAL_ID`, `ESIGNER_TOTP_SECRET` and `WIN_PUBLISHER_NAME`.
5. Check the CodeSignTool download link in the workflow (`.github/workflows/installers.yml`)
   against SSL.com's current page.

### 2c. DigiCert KeyLocker
`WIN_SIGN_PROVIDER` = `digicert`, plus `SM_API_KEY`, `SM_CLIENT_CERT_FILE_BASE64`,
`SM_CLIENT_CERT_PASSWORD`, `SM_HOST` and `SM_KEYPAIR_ALIAS`. The CI also needs DigiCert's `smctl`
installation steps (see DigiCert's KeyLocker documentation); ask and we will add them when you
pick this option.

### 3. Publish a release
**Option A, from GitHub (recommended):** go to **Actions › Installers › Run workflow**, pick the
branch and fill in **version** (e.g. `0.1.0`, without the `v`). The job creates the `v0.1.0` tag on
the chosen commit and continues as if the tag had been pushed. Leaving **version** empty runs a
test build only, without publishing.

**Option B, with git:** pushing a tag still works:
```
git tag v0.1.0
git push origin v0.1.0
```
Either way, GitHub Actions builds the installer on Windows, signs it and publishes it under
**Releases** (`CarvCAM-0.1.0-Windows-64Bit.exe` + `latest.yml`). The installed CarvCAM checks
that page for updates when it starts.

### 4. Check the signature
On Windows: right-click the `.exe` › **Properties › Digital Signatures**. The company name should
appear, along with "This digital signature is OK".

## Until there is a certificate

The installer works just the same. For people downloading it:
1. Open `CarvCAM-…-Windows-64Bit.exe`.
2. If "Windows protected your PC" appears, click **More info** and then
   **Run anyway**.

## Sources
- [Code signing options (Microsoft Learn)](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options)
- [Artifact Signing pricing (Microsoft Azure)](https://azure.microsoft.com/cs-cz/pricing/details/artifact-signing/)
- [Artifact Signing (Microsoft Azure)](https://azure.microsoft.com/en-ca/products/artifact-signing/)
- [CI signing costs in 2026 (codenote.net)](https://codenote.net/en/posts/windows-code-signing-ci-cost-per-signing-volume-2026/)
- [OV/EV eligibility and pricing from Japan, 2026 (codenote.net)](https://codenote.net/ja/posts/ov-ev-code-signing-certificate-pricing-japan-2026/)
- [SmartScreen reputation with EV (Microsoft Tech Community)](https://techcommunity.microsoft.com/discussions/microsoftdefenderthreatintelligence/smartscreen-reputation-issue-for-ev-code-signed-windows-application/4537122)
- [Reputation after renewing an EV certificate (Microsoft Q&A)](https://learn.microsoft.com/en-us/answers/questions/5900208/smartscreen-reputation-reset-following-ev-certific)
- [EV or OV? (SSL.com)](https://www.ssl.com/fr/faq/quel-certificat-de-signature-de-code-ai-je-besoin-d%27ev-ov/)
