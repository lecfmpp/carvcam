# CarvCAM (gsender-ui): design de placas, CAM e corte para máquinas Sienci Labs

Implementação do handoff do Claude Design ("Calm Precision") em React + TypeScript + Vite, sobre o motor de CAM em `../cam-engine`.

## Testar no seu computador
Precisa só do [Node.js](https://nodejs.org) 18 ou mais novo (versão LTS). Na pasta `carvcam/`:

- **Windows:** clique duas vezes em `testar-carvcam.cmd`.
- **Mac / Linux:** `./testar-carvcam.sh`

Na primeira vez o script instala as dependências (precisa de internet só nesse momento). Depois gera a versão final e abre o CarvCAM em **http://localhost:4173**. Depois de aberto uma vez, o app também inicia **sem internet** nesse endereço: um service worker guarda todos os arquivos, e o motor de CAM, as fontes e a simulação rodam no próprio computador.

Para desenvolver (recarrega ao editar o código): `./testar-carvcam.sh --dev` (http://localhost:5173).

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
- `src/machine/store.ts`: máquina simulada (conectar, home, jog, zero, probe, corte com troca de fresa e alarmes). O adaptador real (Socket.IO do servidor do gSender) entra aqui com as mesmas ações.
- `src/assistant/`: provedores do assistente (local e Claude). A IA só edita o projeto; nunca move a máquina.

## Limites conhecidos
- A conexão com a máquina real ainda não existe; para cortar hoje, use **Download G-code** e abra o arquivo no gSender.
- O assistente via Claude nunca foi testado contra a API (falta uma chave neste ambiente).
- Os vídeos tutoriais são placeholders (`src/lib/videos.ts`).
