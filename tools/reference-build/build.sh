#!/usr/bin/env bash
# Build the reference CircuitJS1 image and extract the static site to .reference-site/.
# Usage: tools/reference-build/build.sh
# Env:   EXTRA_CA_CERT=/path/ca.crt  extra CA for TLS-intercepting proxies (optional)
#        HTTPS_PROXY                 forwarded to the build when set (optional)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IMAGE="${REFERENCE_IMAGE:-circuitjs-next/reference:$(git -C "$ROOT/reference/circuitjs1" rev-parse --short=12 HEAD)}"

args=(build -f "$ROOT/tools/reference-build/Dockerfile" -t "$IMAGE")
if [ -n "${EXTRA_CA_CERT:-}" ]; then args+=(--secret "id=extra_ca,src=$EXTRA_CA_CERT"); fi
if [ -n "${HTTPS_PROXY:-}" ]; then args+=(--network host --build-arg "HTTPS_PROXY=$HTTPS_PROXY"); fi
docker "${args[@]}" "$ROOT"

rm -rf "$ROOT/.reference-site"
cid="$(docker create "$IMAGE")"
docker cp "$cid:/site" "$ROOT/.reference-site"
docker rm "$cid" >/dev/null
echo "Reference image: $IMAGE"
echo "Static site:     $ROOT/.reference-site (open circuitjs.html)"
