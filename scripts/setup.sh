#!/usr/bin/env bash
# One-shot setup: checks Node, installs, tests, builds.
set -euo pipefail
cd "$(dirname "$0")/.."

if command -v nvm >/dev/null 2>&1 || [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh"
  nvm install >/dev/null
  nvm use >/dev/null
fi

node_major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$node_major" -lt 22 ]; then
  echo "DuperHuman needs Node 22 or newer (found $(node -v)). Install it with: nvm install 22" >&2
  exit 1
fi

npm install --no-audit --no-fund
npm test
npm run build
echo
echo "Ready. Start the app with: npm run dev"
