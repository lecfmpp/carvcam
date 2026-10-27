# Assinatura de código do instalador do Windows

Sem assinatura, o Windows mostra o aviso azul do SmartScreen ("O Windows protegeu o computador")
e o usuário precisa clicar em **Mais informações › Executar assim mesmo**. A assinatura troca
"Editor desconhecido" pelo nome da empresa e faz o aviso sumir à medida que o instalador ganha
reputação. O gSender assina com a **DigiCert KeyLocker**; o nosso CI aceita esse e mais dois
serviços.

> Conferido em outubro de 2026. Preços e regras mudam: confirme na página de cada empresa antes
> de comprar.

## O que mudou nos últimos anos (e por que importa)

- **Desde junho de 2023** a chave do certificado precisa ficar num token físico ou num serviço de
  assinatura na nuvem (HSM). Não existe mais o arquivo `.pfx` simples que se copiava para o CI.
  Para assinar no GitHub Actions, use um serviço **na nuvem**.
- **O EV não remove mais o SmartScreen na hora.** Desde 2024 a Microsoft trata EV e OV da mesma
  forma: a reputação cresce com os downloads de cada versão. Um OV na nuvem resolve o mesmo
  problema por bem menos.
- **Reputação vai com o certificado.** Trocar de certificado é como começar de novo; renove o
  mesmo, sempre que possível.

## Qual escolher

| Opção | Para quem | Custo aproximado | No nosso CI |
|---|---|---|---|
| **Azure Artifact Signing** (ex-Trusted Signing) | Empresa nos EUA, Canadá, UE ou Reino Unido; pessoa física só nos EUA e Canadá | US$ 9,99/mês (5.000 assinaturas) | Sim (`azure`) |
| **SSL.com eSigner** (certificado OV) | Empresa (CNPJ serve) ou pessoa física, no Brasil inclusive | Certificado anual + plano do eSigner | Sim (`sslcom`) |
| **DigiCert KeyLocker** (o que o gSender usa) | Empresa | O mais caro das três | Sim (`digicert`) |

**Recomendação para o CarvCAM:** se houver uma empresa nos EUA, Canadá, UE ou Reino Unido, use o
**Azure Artifact Signing**: é o mais barato e o mais simples de manter. Se a empresa for só
brasileira (ou for pessoa física no Brasil), use um **OV da SSL.com com eSigner**: valida CNPJ ou
documento pessoal e assina pela nuvem, direto no GitHub Actions.

## Passo a passo

### 1. Prepare os dados da empresa
- Razão social exatamente como vai aparecer no Windows (esse é o "Editor").
- CNPJ (ou documento pessoal), endereço e telefone que apareçam em fonte pública (site, Google
  Maps ou cadastro da Receita): a autoridade certificadora liga ou confere por esses dados.
- Um domínio próprio com e-mail (ex.: `contato@carvcam.com`) ajuda na validação.

### 2a. Azure Artifact Signing (se for elegível)
1. Crie uma conta no Azure e uma assinatura (pagamento por cartão).
2. No portal, crie um recurso **Artifact Signing account** e, dentro dele, faça a **validação de
   identidade** (organização). Leva alguns dias úteis.
3. Crie um **certificate profile** do tipo *Public Trust*.
4. Crie um **App registration** (Microsoft Entra ID) com um segredo, e dê a ele o papel
   *Artifact Signing Certificate Profile Signer* na conta de assinatura.
5. No GitHub, em **lecfmpp/carvcam › Settings › Secrets and variables › Actions**, cadastre:
   `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_SIGNING_ENDPOINT`
   (ex.: `https://eus.codesigning.azure.net`), `AZURE_SIGNING_ACCOUNT`, `AZURE_SIGNING_PROFILE`
   e `WIN_PUBLISHER_NAME` (o nome validado, exatamente igual).

### 2b. SSL.com eSigner (empresa no Brasil ou pessoa física)
1. Compre um certificado **Code Signing OV** na SSL.com e escolha a entrega por **eSigner** (nuvem).
2. Envie os documentos e faça a validação (alguns dias úteis).
3. No painel da SSL.com, ative o eSigner, anote o **Credential ID** e guarde o segredo **TOTP**
   (o código do autenticador, em texto) para assinatura automática.
4. Cadastre no GitHub: `WIN_SIGN_PROVIDER` = `sslcom`, `ESIGNER_USERNAME`, `ESIGNER_PASSWORD`,
   `ESIGNER_CREDENTIAL_ID`, `ESIGNER_TOTP_SECRET` e `WIN_PUBLISHER_NAME`.
5. Confira o link de download do CodeSignTool no workflow (`.github/workflows/installers.yml`)
   com a página atual da SSL.com.

### 2c. DigiCert KeyLocker (igual ao gSender)
`WIN_SIGN_PROVIDER` = `digicert`, mais `SM_API_KEY`, `SM_CLIENT_CERT_FILE_BASE64`,
`SM_CLIENT_CERT_PASSWORD`, `SM_HOST` e `SM_KEYPAIR_ALIAS`. O CI precisa dos mesmos passos de
instalação do `smctl` que o CI do gSender (`.github/workflows/CI.yml` do gSender); peça e
adicionamos quando escolher essa opção.

### 3. Publique uma versão
```
git tag v0.1.0
git push origin v0.1.0
```
O GitHub Actions gera o instalador no Windows, assina e publica em
**Releases** (`CarvCAM-0.1.0-Windows-64Bit.exe` + `latest.yml`). O CarvCAM instalado procura
atualizações nessa página ao abrir.

### 4. Confira a assinatura
No Windows: botão direito no `.exe` › **Propriedades › Assinaturas digitais**. Deve aparecer o
nome da empresa e "Esta assinatura digital está OK".

## Enquanto não houver certificado

O instalador funciona do mesmo jeito. Para quem baixar:
1. Abra o `CarvCAM-…-Windows-64Bit.exe`.
2. Se aparecer "O Windows protegeu o computador", clique em **Mais informações** e depois em
   **Executar assim mesmo**.

## Fontes
- [Opções de assinatura de código (Microsoft Learn)](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options)
- [Preços do Artifact Signing (Microsoft Azure)](https://azure.microsoft.com/cs-cz/pricing/details/artifact-signing/)
- [Artifact Signing (Microsoft Azure)](https://azure.microsoft.com/en-ca/products/artifact-signing/)
- [Custos de assinatura no CI em 2026 (codenote.net)](https://codenote.net/en/posts/windows-code-signing-ci-cost-per-signing-volume-2026/)
- [Elegibilidade e preços OV/EV a partir do Japão, 2026 (codenote.net)](https://codenote.net/ja/posts/ov-ev-code-signing-certificate-pricing-japan-2026/)
- [Reputação do SmartScreen com EV (Microsoft Tech Community)](https://techcommunity.microsoft.com/discussions/microsoftdefenderthreatintelligence/smartscreen-reputation-issue-for-ev-code-signed-windows-application/4537122)
- [Reputação após renovar o EV (Microsoft Q&A)](https://learn.microsoft.com/en-us/answers/questions/5900208/smartscreen-reputation-reset-following-ev-certific)
- [EV ou OV? (SSL.com)](https://www.ssl.com/fr/faq/quel-certificat-de-signature-de-code-ai-je-besoin-d%27ev-ov/)
- [Assinatura do gSender: WindowsSigner.js e CI.yml (Sienci Labs, GitHub)](https://github.com/Sienci-Labs/gsender)
