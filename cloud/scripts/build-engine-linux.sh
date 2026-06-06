#!/usr/bin/env bash
# Build houston-engine for linux/arm64 (Debian bookworm — matches the Upstash
# Box runtime) using the always-on Dockerfile's build stage, and extract the
# binary to cloud/dist/. Waits for the Docker daemon to come up first.
set -euo pipefail

REPO=/Users/cris/hackathons/houston
OUT="$REPO/cloud/dist/houston-engine-linux-arm64"
mkdir -p "$REPO/cloud/dist"

echo "[build] waiting for Docker daemon..."
for _ in $(seq 1 120); do
  if docker info >/dev/null 2>&1; then break; fi
  sleep 3
done
docker info >/dev/null 2>&1 || { echo "[build] Docker daemon never came up"; exit 1; }
echo "[build] docker ready"

cd "$REPO"
echo "[build] building engine (linux/arm64, this is a from-scratch release build)..."
docker build --platform linux/arm64 --target build \
  -t houston-engine-linux-build -f always-on/Dockerfile .

echo "[build] extracting binary..."
docker rm -f hengine-extract >/dev/null 2>&1 || true
docker create --platform linux/arm64 --name hengine-extract houston-engine-linux-build >/dev/null
docker cp hengine-extract:/src/target/release/houston-engine "$OUT"
docker rm hengine-extract >/dev/null

ls -lh "$OUT"
file "$OUT" 2>/dev/null || true
echo "[build] done -> $OUT"
