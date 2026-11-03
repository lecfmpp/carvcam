# Enviar para o gSender com um clique

Fonte: código do [Sienci-Labs/gsender](https://github.com/Sienci-Labs/gsender), branch padrão no commit `426eaa1` (16/10/2026, `package.json` 1.6.4), lido em 03/11/2026. Os caminhos abaixo são relativos à raiz desse repositório.

Objetivo: o botão **Send to gSender** do Preparar carrega o G-code verificado num gSender aberto (neste computador, num gControl ou num Raspberry Pi da oficina), e a pessoa só aperta Start no gSender. Implementação: `gsender-ui/src/lib/gsender.ts` e `gsender-ui/src/components/SendToGsender.tsx`.

## 1. Onde o servidor do gSender escuta

O gSender desktop é um Electron que sobe um servidor Express + Socket.IO embutido (`src/main.js` chama `launchServer()` de `src/server-cli.js`).

| Situação | Host | Porta | Fonte |
|---|---|---|---|
| gSender desktop, Remote Mode **desligado** | `127.0.0.1` | **aleatória** (`port: 0`) | `src/server-cli.js`: `defaultHost = isElectron() ? '127.0.0.1' : '0.0.0.0'`, `defaultPort = isElectron() ? 0 : 8000` |
| gSender desktop, Remote Mode **ligado** | o IP escolhido no diálogo (IP da rede local) | a escolhida, **8000** por padrão | `src/server/index.js` (`remoteSettings.headlessStatus`, `ip`, `port`); diálogo em `src/app/src/features/RemoteMode/index.tsx` (`useState(8000)`, porta 1025–65535, só IPv4) |
| Servidor sem Electron (`server-cli`, Docker, Pi headless) | `0.0.0.0` | **8000** | `src/server-cli.js` |

Consequências:

- **Sem Remote Mode, nada de fora acha o gSender desktop**, nem no mesmo computador: a porta é sorteada a cada abertura e só a janela do próprio gSender sabe qual é (IPC `check-remote-status` em `src/main.js`). Não existe arquivo nem registro com essa porta.
- Com Remote Mode ligado, o servidor escuta **só no IP escolhido** (não em `0.0.0.0` nem em `127.0.0.1`). No mesmo computador, então, também é preciso usar esse IP:porta.
- Por isso o CarvCAM pede o **endereço do Remote Mode** (o mesmo que o gSender mostra com o QR code). Sem endereço salvo, tenta `127.0.0.1:8000`, que só funciona com o servidor sem Electron (ou se alguém escolher 127.0.0.1 no Remote Mode).
- Se o IP configurado deixar de existir (DHCP mudou), o gSender desliga o Remote Mode sozinho e avisa ("Remote Mode Configuration Error", `src/main.js`). O endereço salvo no CarvCAM também fica errado; a mensagem de erro manda conferir.

## 2. Autenticação

- `POST /api/signin` (`src/server/api/api.users.js`, `signin`): sem usuários cadastrados no `.cncrc`, devolve `{ enabled: false, token, name: "" }` com um JWT assinado pelo `secret` do `.cncrc` (gerado na primeira execução, `src/server/index.js`). Com usuários, pede `name` + `password` e responde 401 se errar.
- O token iria no cabeçalho `Authorization: Bearer <token>` (é o que a UI do gSender faria em `src/app/src/api/index.ts`; hoje ela manda token vazio, `const token = ''`). `express-jwt` 5.3 só lê o cabeçalho, não `?access_token=`.
- **Na prática o token não é exigido.** Em `src/server/app.js` ("Secure API Access") o `expressJwt` gera `UnauthorizedError`, mas o tratador de erro logo depois põe `bypass = true` dentro do `try` (a validação de usuário está comentada) e chama `next()`. O filtro de IP (`authorizeIPAddress`, `src/server/access-control.js`) também deixa tudo passar (`let pass = true; // TODO: Fix whitelist`). Não faz diferença ser localhost ou outra máquina.
- O que o CarvCAM faz: no app desktop, chama `/api/signin` e, se vier token, manda `Authorization: Bearer`. Se falhar (401 com usuários), segue sem token. No navegador não chama (ver CORS abaixo). Se um dia a Sienci passar a exigir token, o desktop já manda; com usuários e senha seria preciso pedir as credenciais (não implementado).

## 3. Carregar o arquivo: `POST /api/file`, não `POST /api/gcode`

### `POST /api/gcode` (`src/server/api/api.gcode.js`, `upload`)

Corpo JSON `{ port, name, gcode, context }`. Problemas:

1. **Exige máquina conectada**: sem `port` responde 400 "No port specified"; com porta sem controlador, 400 "Controller not found".
2. Chama `controller.command('gcode:load', name, gcode, context, cb)`, mas no `GrblController` (`src/server/controllers/Grbl/GrblController.js`) o primeiro argumento de `gcode:load` hoje é `meta` (`const { name } = meta`). Passando uma string, o nome do arquivo some. (No `GrblHalController` o primeiro argumento ainda é `name`.)
3. Só carrega no `sender` do controlador. Não passa pelo `CNCEngine`, então a janela do gSender não recebe `file:load` e o visualizador/informações do arquivo podem não atualizar como num "Load File" normal.

### `POST /api/file` (`src/server/api/api.file.js`, `uploadFile`) — o que usamos

É o mesmo caminho do botão de abrir arquivo do gSender (`src/app/src/lib/fileupload.ts`, `uploadGcodeFileToServer`, chamado em `src/app/src/features/FileControl/index.tsx`):

- `multipart/form-data` com os campos `gcode` (o arquivo; o nome do arquivo vira o nome do job), `port` (porta da máquina conectada, pode ser vazio) e `visualizer` (`VISUALIZER_PRIMARY`, constante em `src/app/src/constants/index.ts`). Multer em memória (`src/server/app.js`), sem limite de tamanho configurado. A rota pula o parser de JSON.
- O servidor lê o arquivo como **latin1** (`buffer.toString('latin1')`). O CarvCAM tira acentos antes de mandar (só aparecem nos comentários, como o nome do projeto).
- Chama `CNCEngine.load({ gcode, port, name, size, visualizer })` (`src/server/services/cncengine/CNCEngine.js`):
  - guarda o G-code no CNCEngine;
  - se há controlador naquela porta, `controller.loadFile()` → `gcode:load` (vai para o sender, pronto para Start);
  - emite `file:load` por Socket.IO para **todas** as janelas conectadas; a UI do gSender (`src/app/src/store/redux/sagas/controllerSagas.tsx`) chama `parseGCode(...)` e o arquivo aparece no visualizador como se tivesse sido aberto ali.
- Responde 200 `{ msg: 'Successfully loaded file' }` (ou 400 "No file attached").
- **Sem máquina conectada também funciona:** o arquivo fica no CNCEngine e aparece no visualizador; quando a pessoa conectar a máquina, o `open` do CNCEngine chama `controller.loadFile(this.gcode, ...)` sozinho. A mensagem do CarvCAM nesse caso é "Connect your machine in gSender first, then press Start".
- Não é preciso mandar `gcode:load` por Socket.IO.

### Job em andamento

`gcode:load` faz `this.workflow.stop()` (Grbl e grblHAL) e `loadFile()` só respeita o job quando `refresh = true`, que não é o caso do upload. Ou seja, **mandar um arquivo durante um job pararia o job**. O CarvCAM consulta `GET /api/controllers` antes e recusa se algum controlador tiver `workflow.state` diferente de `idle` (`running`/`paused`, `src/server/lib/Workflow.js`) ou estado do firmware `Run`/`Hold`/`Door`.

## 4. Achar a máquina conectada: `GET /api/controllers`

`src/server/api/api.controllers.js` devolve um array com `controller.status` de cada controlador aberto (`get status()` em `GrblController.js` e `GrblHalController.js`):

```json
[{ "port": "COM3", "baudrate": 115200, "rtscts": false, "sockets": ["…"], "ready": true,
   "controller": { "type": "grblHAL", "settings": {…}, "state": { "status": { "activeState": "Idle", … } } },
   "feeder": {…}, "sender": { "name": "…", "total": 0, "sent": 0, … },
   "workflow": { "state": "idle" } }]
```

Ao desconectar, o controlador sai do store (`store.unset` em `CNCEngine.js`), então lista vazia = nenhuma máquina conectada. O CarvCAM usa essa chamada também para confirmar que o endereço é mesmo um gSender (precisa ser um array JSON).

## 5. CORS e navegador

- `app.use(cors())` em `src/server/app.js`, com as opções padrão: `Access-Control-Allow-Origin: *`, preflight respondido para todas as rotas (testado: `OPTIONS /api/file` → 204 com `Allow-Headers` refletido). Não manda `Access-Control-Allow-Private-Network`.
- **No app desktop** (Electron, `window.carvcamDesktop.request`) não há CORS: a requisição sai do processo principal.
- **No navegador:**
  - De `http://localhost:4173` (o jeito local de rodar o CarvCAM) para `127.0.0.1` ou para um IP da rede: funcionou num Chrome 153 headless contra um servidor com os mesmos middlewares (ver seção 7).
  - De uma página **https** pública para `http://192.168.x.x`: bloqueado como conteúdo misto. O CarvCAM nem tenta e já explica.
  - De uma página pública para `127.0.0.1`/rede local: o Chrome pede permissão de acesso à rede local (antes, preflight de Private Network Access, que o gSender não responde). Não testado; a mensagem de erro sugere o app desktop ou o Download.
  - Para evitar preflight, no navegador o CarvCAM só faz `GET /api/controllers` e o `POST /api/file` multipart sem cabeçalhos extras (requisições "simples"). Não chama `/api/signin` (JSON) nem manda `Authorization`.
  - `fetch` não distingue "gSender fechado" de "bloqueado pelo navegador": as duas viram `TypeError`. A mensagem cobre os dois casos.

## 6. Fluxo do CarvCAM

1. Endereço: o salvo em Settings › gSender address (ou no "Change" do Preparar), normalizado para `http://host:porta` (porta 8000 se faltar). Vazio → `http://127.0.0.1:8000`.
2. `GET /api/controllers` (3 s). Erro de rede → "gSender isn't answering" / "Couldn't reach" (navegador); tempo esgotado → "No answer"; resposta que não é array → "isn't gSender".
3. Algum controlador ocupado → recusa ("A job is running in gSender").
4. Porta: o primeiro controlador `ready`, senão o primeiro; nenhum → `""`.
5. Desktop: `POST /api/signin` `{}` (3 s), token opcional.
6. `POST /api/file` multipart (20 s): `gcode` = `<nome-do-projeto>.nc`, `port`, `visualizer=VISUALIZER_PRIMARY`.
7. Sucesso: "Loaded as X.nc. Open gSender and press Start." (ou "Connect your machine in gSender first…").

## 7. O que foi testado

- Testes unitários (`gsender-ui/src/lib/gsender.test.ts`) com transporte simulado: normalização de endereço, leitura de `/api/controllers` e `/api/signin`, corpo multipart, máquina ocupada, sem máquina, gSender fechado, bloqueio do navegador, tempo esgotado, erro do gSender.
- Servidor de teste com as **mesmas versões** de `express` 4.16.4, `cors` 2.8.5, `express-jwt` 5.3.1 e `multer` 1.4.5-lts.1 e a mesma ordem de middlewares do `app.js` (CNCEngine simulado): o multipart do CarvCAM chega com `port`, `visualizer`, nome e conteúdo certos, com e sem token, pelo `fetch` do Node e por um Chrome headless clicando no botão do Preparar.
- **Não testado contra um gSender de verdade** (sem máquina, sem gSender rodando neste ambiente). Falta confirmar: o arquivo aparecendo no visualizador do gSender, o Start, e o comportamento com Remote Mode num gControl/Pi.
