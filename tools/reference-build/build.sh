#!/usr/bin/env bash
# Build the reference CircuitJS1 image and extract the static site to .reference-site/.
# Usage: tools/reference-build/build.sh
# Env:   EXTRA_CA_CERT=/path/ca.crt  extra CA for TLS-intercepting proxies (optional)
#        HTTPS_PROXY                 forwarded to the build when set (optional)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
UPSTREAM="$(git -C "$ROOT/reference/circuitjs1" rev-parse --short=12 HEAD)"
PATCH="$(sha256sum "$ROOT/tools/reference-patch/harness.patch" | cut -c1-8)"
IMAGE="${REFERENCE_IMAGE:-circuitjs-next/reference:$UPSTREAM-p$PATCH}"

args=(build -f "$ROOT/tools/reference-build/Dockerfile" -t "$IMAGE")
if [ -n "${EXTRA_CA_CERT:-}" ]; then args+=(--secret "id=extra_ca,src=$EXTRA_CA_CERT"); fi
if [ -n "${HTTPS_PROXY:-}" ]; then args+=(--network host --build-arg "HTTPS_PROXY=$HTTPS_PROXY"); fi
docker "${args[@]}" "$ROOT"

rm -rf "$ROOT/.reference-site"
cid="$(docker create "$IMAGE")"
docker cp "$cid:/site" "$ROOT/.reference-site"
docker rm "$cid" >/dev/null
# Recorded into golden fixtures so a fixture names the exact reference it came from.
printf '{"upstreamSha":"%s","harnessPatchSha256":"%s","image":"%s"}\n' \
  "$(git -C "$ROOT/reference/circuitjs1" rev-parse HEAD)" \
  "$(sha256sum "$ROOT/tools/reference-patch/harness.patch" | cut -d' ' -f1)" "$IMAGE" \
  > "$ROOT/.reference-site/reference-build.json"
echo "Reference image: $IMAGE"
echo "Static site:     $ROOT/.reference-site (open circuitjs.html)"
