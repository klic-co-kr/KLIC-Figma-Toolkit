#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  cat <<'EOF'
Node.js LTS is required to run the KLIC completion audit.

Install option 1:
  brew install node

Install option 2:
  Download Node.js LTS from https://nodejs.org/

After installation, close this terminal and open it again, then rerun this script.
EOF
  exit 1
fi

node "$SCRIPT_DIR/run-completion-audit.mjs" "$@"
