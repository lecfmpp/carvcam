# CarvCAM para Windows (Electron)

O mesmo formato do gSender 1.6.4: um app Electron com instalador NSIS, que traz junto o
carvcam-bridge (USB pelo `serialport` e Ethernet na porta 23 da SLB). Quem instala não precisa
de Node.js nem de nada além do instalador.

| | gSender 1.6.4 | CarvCAM |
|---|---|---|
| App | Electron | Electron 33 |
| Instalador | NSIS assistido, por máquina (Program Files) | Igual (`electron-builder.config.cjs`) |
| Páginas | Licença, pasta, instalação, final com atalho e "Abrir" | Igual (`build/installer.nsh`) |
| Abre depois de instalar | Como usuário normal (via explorer.exe) | Igual |
| Módulos nativos | `asarUnpack` dos `.node` | Igual (serialport, binário N-API pronto) |
| Atualização | electron-updater + Releases do GitHub | Igual (`lecfmpp/carvcam`) |
| Assinatura | DigiCert KeyLocker no CI | DigiCert, SSL.com eSigner ou Azure (`build/sign.cjs`) |
| Nome do arquivo | `gSender-1.6.4-Windows-64Bit.exe` | `CarvCAM-0.1.0-Windows-64Bit.exe` |

## Como funciona
`main.mjs` sobe o bridge em `127.0.0.1:8765`, serve o app compilado em `http://127.0.0.1:4173`
(sempre a mesma porta, porque projetos e oficina ficam no armazenamento do navegador, separado
por endereço) e abre a janela. Links externos abrem no navegador do sistema. Uma instância só.

## Rodar e gerar o instalador
```
cd desktop
npm install
npm start            # compila o gsender-ui e abre o app
npm run dist:win     # gera release/CarvCAM-<versão>-Windows-64Bit.exe
```
No Linux, o `dist:win` precisa do Wine (o NSIS gera o desinstalador com ele). O caminho normal é
o GitHub Actions (`.github/workflows/windows-installer.yml`), que roda no Windows: cada push gera
o instalador como artefato, e uma tag `v*` publica na Release, assinado se os segredos existirem.

## Assinatura
Ver [docs/assinatura-de-codigo.md](../docs/assinatura-de-codigo.md).
