#!/usr/bin/env bash
# CarvCAM: instala (só na primeira vez), gera a versão final e abre no navegador.
# Uso: ./testar-carvcam.sh        (Mac ou Linux; precisa do Node.js 18 ou mais novo)
#      ./testar-carvcam.sh --dev  (modo desenvolvimento, recarrega ao editar o código)
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js não encontrado. Instale a versão LTS em https://nodejs.org e rode de novo."
  exit 1
fi
major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$major" -lt 18 ]; then
  echo "Node.js $(node -v) é antigo demais; instale a versão 18 ou mais nova (LTS em https://nodejs.org)."
  exit 1
fi

for dir in cam-engine gsender-ui; do
  if [ ! -d "$dir/node_modules" ]; then
    echo "==> Instalando dependências de $dir (só na primeira vez)…"
    (cd "$dir" && npm install --no-audit --no-fund)
  fi
done

cd gsender-ui
if [ "${1:-}" = "--dev" ]; then
  echo "==> Modo desenvolvimento em http://localhost:5173"
  npx vite --open
else
  echo "==> Gerando a versão final e abrindo em http://localhost:4173"
  echo "    Depois da primeira abertura, o CarvCAM também abre sem internet nesse endereço."
  npm run local
fi
