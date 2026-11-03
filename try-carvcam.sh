#!/usr/bin/env bash
# CarvCAM: installs (first run only), builds the production version and opens it in the browser.
# Usage: ./try-carvcam.sh        (Mac or Linux; needs Node.js 18 or newer)
#        ./try-carvcam.sh --dev  (development mode, reloads when you edit the code)
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. Install the LTS version from https://nodejs.org and run this again."
  exit 1
fi
major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$major" -lt 18 ]; then
  echo "Node.js $(node -v) is too old; install version 18 or newer (LTS from https://nodejs.org)."
  exit 1
fi

for dir in cam-engine app; do
  if [ ! -d "$dir/node_modules" ]; then
    echo "==> Installing dependencies for $dir (first run only)…"
    (cd "$dir" && npm install --no-audit --no-fund)
  fi
done

cd app
if [ "${1:-}" = "--dev" ]; then
  echo "==> Development mode at http://localhost:5173"
  npx vite --open
else
  echo "==> Building the production version and opening http://localhost:4173"
  echo "    After the first launch, CarvCAM also opens offline at that address."
  npm run local
fi
