#!/usr/bin/env bash
# Serve the reference build at http://localhost:${PORT:-8000}/circuitjs.html
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${PORT:-8000}"
[ -d "$ROOT/.reference-site" ] || "$ROOT/tools/reference-build/build.sh"
cd "$ROOT/.reference-site"
exec python3 -m http.server "$PORT" --bind 127.0.0.1
