# CarvCAM (gsender-ui): design de placas, CAM e corte para máquinas Sienci Labs

Implementação do handoff do Claude Design ("Calm Precision") em React + TypeScript + Vite, sobre o motor de CAM em `../cam-engine`.

## Testar no seu computador
Precisa só do [Node.js](https://nodejs.org) 18 ou mais novo (versão LTS). Na raiz do repositório:

- **Windows:** clique duas vezes em `try-carvcam.cmd`.
- **Mac / Linux:** `./try-carvcam.sh`

Na primeira vez o script instala as dependências (precisa de internet só nesse momento). Depois gera a versão final e abre o CarvCAM em **http://localhost:4173**. Depois de aberto uma vez, o app também inicia **sem internet** nesse endereço: um service worker guarda todos os arquivos, e o motor de CAM, as fontes e a simulação rodam no próprio computador.

Para desenvolver (recarrega ao editar o código): `./try-carvcam.sh --dev` (http://localhost:5173).

```bash
# o mesmo, à mão
cd cam-engine && npm install
cd ../gsender-ui && npm install
npm run local      # build + http://localhost:4173
npm run dev        # desenvolvimento em http://localhost:5173
npm run build      # typecheck + build de produção
```

## Máquinas, fresas e links da Sienci
- **Cards de máquina** (onboarding e Settings › My machine): `src/components/MachineCard.tsx`, fichas em `src/lib/machineInfo.ts` (páginas de produto da Sienci, out/2026).
- **Biblioteca de fresas** (My bits): as que o CarvCAM usa e "More from the Sienci store" (`src/lib/storeBits.ts`).
- **Fotos:** WebP em `public/machines/` e `public/bits/`. `npm run images:fetch` baixa a foto principal de cada página de produto (`src/lib/sienciProducts.json`) e converte para WebP leve (precisa de acesso ao sienci.com). Sem a foto, o card mostra um desenho da máquina ou a silhueta da fresa.
- **Links:** todo link para o sienci.com passa por `sienciLink()` (`src/lib/referral.ts`), que acrescenta `utm_source=carvcam&utm_medium=app&utm_campaign=<lugar>&utm_content=<produto>`. As UTMs só identificam a origem; a comissão vem do código de afiliado. Depois de aprovado no programa da Sienci, preencha `VITE_SIENCI_AFFILIATE_PARAM` e `VITE_SIENCI_AFFILIATE_ID` (veja `.env.example`).

## Marca e tela de entrada
- Logo **CarvCAM** (`src/components/Brand.tsx`, `public/carvcam-icon.svg`) na barra do topo e como ícone da aba.
- Tela de entrada (`index.html`): aparece antes de qualquer JavaScript, com a animação da logo e uma barra de progresso das etapas reais (interface, fontes, motor de CAM aquecido no worker, telas). Nada vem da internet. Se algo demorar mais de 15 s, avisa; se falhar, o app abre assim mesmo.

## Telas
| Rota | Tela |
|---|---|
| `#/workshop/onboarding` | Minha oficina: máquina → router/spindle → fresas |
| `#/workshop`, `#/workshop/bits`, `#/workshop/settings` | Primeiros cortes (prévias simuladas pelo motor), biblioteca de fresas, minha máquina |
| `#/surfacing` | Aplainar a mesa (G-code de aplainamento gerado pelo motor) |
| `#/create` | Criar: editor + assistente (parser local offline; Claude API opcional com a chave do usuário). Texto (reto ou em arco), formas, curvas livres (caneta), biblioteca de elementos, importar SVG/DXF, imagem de decalque e conversão de imagem em vetor, alinhar/distribuir, contorno, subtrair/máscara, V-carve e hachura |
| `#/prepare` | Preparar: velocidades da tabela Sienci, abas, segunda fresa, G-code verificado, **Download G-code (.nc)** |
| `#/position`, `#/carve` | Posicionar e Cortar (máquina **simulada** por enquanto) |

## Modo Painel (gControl)
Para a tela touch de 15,6″ do gControl. Liga sozinho quando o dispositivo principal é touch (`pointer: coarse`), em Settings (Automatic / Always on / Off) ou com `?panel=1` na URL.
- **Tamanho:** o layout cabe em 1280×720 (Windows a 150%) e os controles principais crescem para 48–60 px.
- **Tela cheia:** botão no topo (quiosque).
- **Desempenho:** simulação e malha 3D mais leves para o processador N150.
- **Início:** com um projeto aberto, o app inicia direto em Posicionar.

## Arquitetura
- `src/lib/catalog.ts`: catálogo da interface derivado do catálogo Sienci do motor (máquinas, cabeçotes, fresas, projetos).
- `src/engine/`: o motor roda num Web Worker (`generatePlate` + simulação do corte).
- `src/stage/`: palco com vista de cima (mapa de alturas) e 3D (three.js).
- `src/machine/store.ts`: estado da máquina. Com uma controladora conectada, as ações vão para `src/machine/real.ts`; sem ela, o simulador interno anima tudo.
- `src/machine/grbl/`: protocolo grbl/grblHAL (leitura das respostas, envio por contagem de caracteres, home, jog, zero, placa de toque, overrides, troca de ferramenta, parada segura, retomada no meio) e os transportes (Web Serial e bridge).
- `bridge/server.mjs`: o carvcam-bridge, que abre a porta USB ou a conexão Ethernet da controladora para o app.
- `src/assistant/`: provedores do assistente (local e Claude). A IA só edita o projeto; nunca move a máquina.

## Conectar na máquina
O CarvCAM fala direto com a controladora (LongBoard, SuperLongBoard, SLB-EXT, SLB-LITE), sem o gSender aberto. Feche o gSender antes: só um programa pode usar a conexão.

- **USB:** `npm run local` (ou `try-carvcam`) inicia o app e o **carvcam-bridge** juntos. No assistente **Connect**, a placa aparece sozinha na lista. No Chrome/Edge também funciona sem o bridge (o navegador pede para escolher a porta).
- **Ethernet (SLB/SLB-EXT):** escolha Ethernet no assistente e informe o IP da placa (padrão `192.168.5.1`, porta 23). Precisa do bridge.
- O bridge só aceita conexões do próprio computador e de páginas servidas por ele (`localhost`), para nenhum site da internet conseguir mandar na máquina.
- **Sem máquina:** escolha **Simulator** no assistente.

Para testar a conexão real sem máquina, há uma placa falsa na rede: `npx vite-node scripts/fake-grbl.ts` e, no assistente, Ethernet com o IP `127.0.0.1:2323`.

## Limites conhecidos
- A conexão real foi testada contra uma placa grbl/grblHAL simulada, ainda não numa LongMill ou AltMill de verdade. No primeiro uso, faça um corte no ar (fresa acima do material) e fique com a mão no E-stop.
- O assistente via Claude nunca foi testado contra a API (falta uma chave neste ambiente).
- Os vídeos tutoriais são placeholders (`src/lib/videos.ts`).
