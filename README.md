# CarvCAM

Nova interface e CAM para o gSender, feita para as máquinas Sienci Labs (LongMill e AltMill).
Veio do repositório Leandro-Apps/scanbusinesscard (pasta `carvcam/`), com o histórico preservado.

| Pasta | O que é |
|---|---|
| `gsender-ui/` | O app (React + Vite): design de placas, preparo, posicionamento, corte e simulação |
| `cam-engine/` | Motor de CAM em TypeScript: geometria, operações, G-code e catálogo Sienci |
| `docs/gsender-reverse-engineering/` | Estudos e decisões (engenharia reversa do gSender, comparativos) |

## Testar

Precisa do [Node.js](https://nodejs.org) 18 ou mais novo. Na raiz do repositório:

- **Mac:** clique duas vezes em `testar-carvcam.command`
- **Windows:** clique duas vezes em `testar-carvcam.cmd`
- **Linux / terminal:** `./testar-carvcam.sh`

Abre em http://localhost:4173. Detalhes em `gsender-ui/README.md`.
