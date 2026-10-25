# gsender-ui: nova interface do gSender ("Calm Precision")

Implementação do handoff do Claude Design em React + TypeScript + Vite, sobre o motor de CAM em `../cam-engine`.

```bash
cd ../cam-engine && npm install
cd ../gsender-ui && npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + build de produção
```

## Telas
| Rota | Tela |
|---|---|
| `#/workshop/onboarding` | Minha oficina: máquina → router/spindle → fresas |
| `#/workshop`, `#/workshop/bits`, `#/workshop/settings` | Primeiros cortes (prévias simuladas pelo motor), biblioteca de fresas, minha máquina |
| `#/surfacing` | Aplainar a mesa (G-code de aplainamento gerado pelo motor) |
| `#/create` | Criar: editor + assistente (parser local offline; Claude API opcional com a chave do usuário) |
| `#/prepare` | Preparar: velocidades da tabela Sienci, abas, segunda fresa, G-code verificado, **Download G-code (.nc)** |
| `#/position`, `#/carve` | Posicionar e Cortar (máquina **simulada** por enquanto) |

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
