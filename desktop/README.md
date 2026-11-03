# CarvCAM desktop (Electron)

O app de verdade para instalar: Mac, Windows, Linux e Raspberry Pi. É o `gsender-ui` (build de produção) dentro de uma janela Electron, que conversa com o **gSender instalado pelo usuário** por HTTP (neste computador ou na rede da oficina).

| Arquivo | O que faz |
|---|---|
| `src/main.js` | Processo principal: janela, segurança, menu, instância única, IPC da ponte |
| `src/protocol.js` | Serve `renderer/` em `app://carvcam/` (esquema padrão + seguro) e aplica a CSP |
| `src/preload.js` | Expõe `window.carvcamDesktop` (contrato em `gsender-ui/src/desktop/bridge.ts`) |
| `src/http-request.js` | `request()`: HTTP feito no processo principal (sem CORS), com timeout e limites de tamanho |
| `src/allowlist.js` | Quais endereços `request()` aceita (só este computador e rede local) |
| `src/window-state.js` | Lembra tamanho e posição da janela |
| `src/updater.js` | Atualização automática pelo GitHub Releases (desligada por padrão) |
| `electron-builder.config.js` | Instaladores, nomes dos arquivos, assinatura e notarização |
| `scripts/` | `prepare-renderer` (copia `gsender-ui/dist`), `make-icons` (ícones a partir do SVG), `dev` |

## Como funciona

- **Origem própria, não `file://`.** O build fica em `app://carvcam/index.html`, registrado como esquema `standard` + `secure`. Assim `localStorage`, IndexedDB, `fetch`, workers de módulo e WebCrypto (`crypto.subtle`, usado para conferir a licença) funcionam como em https. As rotas usam HashRouter, então não precisa de fallback de SPA. O service worker não é registrado no desktop (o `main.tsx` só registra em http/https) e não faz falta: os arquivos já estão no disco, o app abre sem internet.
- **Segurança.** `contextIsolation`, `sandbox`, sem `nodeIntegration`, sem `<webview>`. CSP no `index.html` servido (scripts só do app; o script inline da tela de entrada entra pelo hash, calculado ao abrir). A janela não navega para fora do app; `window.open` e links externos (http, https, mailto) vão para o **navegador do sistema** (é assim que o login abre `carvcam.com/activate`). Permissões (câmera, microfone, localização…) são negadas.
- **Ponte `window.carvcamDesktop`:**
  - `platform`, `version`
  - `request(url, {method, headers, body, timeoutMs})` → `{status, headers, body}`. Roda no processo principal com o `fetch` do Node. Só aceita `localhost`, `127.0.0.0/8`, `::1`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, IPv6 local (`fe80::/10`, `fc00::/7`) e nomes `*.local`; o resto é recusado antes de qualquer conexão. Respostas 4xx/5xx voltam normalmente; erro de rede e timeout rejeitam (a mensagem do timeout contém "timed out"). Timeout padrão 8 s (máx. 120 s), corpo enviado até 64 MB (enviado byte a byte como veio, sem acrescentar charset: serve para multipart montado pelo app), resposta até 32 MB, redirecionamentos não são seguidos.
  - `openExternal(url)`: só http, https e mailto.
  - Só a página do app (frame principal) pode chamar; iframes (vídeos do YouTube) não.

## Desenvolver

Precisa do Node.js 20+.

```bash
cd cam-engine && npm install
cd ../gsender-ui && npm install
cd ../desktop && npm install
npm run dev          # sobe o Vite do gsender-ui (5173) e abre o Electron nele, com recarga ao editar
```

`npm run dev` usa um Vite que já esteja rodando em `http://localhost:5173` (ou em `CARVCAM_DEV_URL`). Argumentos extras vão para o Electron (`npm run dev -- --no-sandbox` se estiver rodando como root no Linux).

Para abrir o build de produção sem empacotar: `cd gsender-ui && npx vite build`, depois `cd ../desktop && npm start`.

Testes (lista de endereços permitidos e o `request` contra um servidor local): `npm test`.

## Gerar os instaladores na sua máquina

Primeiro o build do app (`cd gsender-ui && npx vite build`). Depois, em `desktop/`:

```bash
npm run dist:mac     # num Mac: CarvCAM-Mac-universal.dmg + .zip (Intel e Apple Silicon)
npm run dist:win     # no Windows: CarvCAM-Windows-64Bit.exe
npm run dist:linux   # CarvCAM-Linux-x86_64.AppImage + CarvCAM-Linux-amd64.deb
npm run dist:pi      # CarvCAM-Linux-arm64.AppImage/.deb + CarvCAM-Linux-armv7l.AppImage/.deb
npm run dist:dir     # só a pasta desempacotada (rápido, para testar)
```

Saem em `desktop/release/`. O Linux (inclusive ARM) pode ser gerado de um Linux x64; o `.dmg` só num Mac; o `.exe` no Windows (ou Linux com Wine).

O Electron está fixado na 43.x: a 44 não tem mais build `armv7l` (Raspberry Pi OS 32 bits). Ao subir de versão, confira se o Pi de 32 bits ainda importa.

## Publicar uma versão

1. Ajuste a versão em `desktop/package.json` (o workflow também usa a tag).
2. `git tag v0.2.0 && git push origin v0.2.0`
3. O workflow **Desktop app** (`.github/workflows/desktop.yml`) gera Mac, Windows, Linux x64 e Pi em paralelo e cria um **Release em rascunho** neste repositório com todos os arquivos. Revise e publique.

Em todo push/PR que mexe no app, o mesmo workflow gera os instaladores como artefatos do run (14 dias), sem release.

**Atualização automática:** desligada até existir um feed público. Para ligar, crie a variável do repositório `CARVCAM_UPDATES=1` (Settings › Secrets and variables › Actions › Variables). O build passa a incluir `app-update.yml` e os `latest*.yml` vão para o release; o app confere a cada 6 h e instala ao fechar. O repositório de releases precisa ser público (o app não leva token). No Mac só funciona com o app assinado.

## Assinatura

Sem segredos configurados, tudo sai **sem assinatura** e funciona, com avisos na primeira abertura:

- **Mac:** o app sai com assinatura ad-hoc (sem notarização). Na primeira vez: clique com o botão direito no CarvCAM em Aplicativos › **Abrir** › Abrir. No macOS 15 (Sequoia) ou mais novo: tente abrir, depois **Ajustes do Sistema › Privacidade e Segurança › Abrir Mesmo Assim**. Alternativa no Terminal: `xattr -dr com.apple.quarantine /Applications/CarvCAM.app`.
- **Windows:** o SmartScreen mostra "O Windows protegeu o computador": **Mais informações › Executar assim mesmo**.
- **Linux:** não precisa. AppImage: `chmod +x CarvCAM-Linux-x86_64.AppImage`.

Para assinar, cadastre estes segredos no GitHub (Settings › Secrets and variables › Actions):

| Segredo | O que é |
|---|---|
| `CSC_LINK` | Certificado **Developer ID Application** exportado como `.p12`, em base64 (`base64 -i cert.p12 \| pbcopy`) |
| `CSC_KEY_PASSWORD` | Senha do `.p12` |
| `APPLE_ID` | E-mail da conta Apple Developer |
| `APPLE_APP_SPECIFIC_PASSWORD` | Senha de app gerada em appleid.apple.com |
| `APPLE_TEAM_ID` | Team ID (10 caracteres) da conta |
| `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` | (opcional) certificado de assinatura de código do Windows |

Com `CSC_LINK` o Mac é assinado com hardened runtime e os entitlements de `build/entitlements.mac.plist`; com os três `APPLE_*` também é notarizado. Localmente funciona igual: exporte as mesmas variáveis antes do `npm run dist:mac`.

## Nomes dos arquivos (links do site)

| Plataforma | Arquivo |
|---|---|
| Mac (Intel + Apple Silicon) | `CarvCAM-Mac-universal.dmg` (`CarvCAM-Mac-universal.zip` para atualização) |
| Windows 64 bits | `CarvCAM-Windows-64Bit.exe` |
| Linux x64 | `CarvCAM-Linux-x86_64.AppImage`, `CarvCAM-Linux-amd64.deb` |
| Raspberry Pi 64 bits | `CarvCAM-Linux-arm64.AppImage`, `CarvCAM-Linux-arm64.deb` |
| Raspberry Pi 32 bits | `CarvCAM-Linux-armv7l.deb` (e `CarvCAM-Linux-armv7l.AppImage`) |
