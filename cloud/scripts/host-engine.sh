#!/usr/bin/env bash
# Upload the prebuilt linux/arm64 houston-engine binary to a public Supabase
# Storage bucket and print its public URL (for HOUSTON_ENGINE_BINARY_URL).
#
#   cd cloud && bash scripts/host-engine.sh
set -euo pipefail

cd "$(dirname "$0")/.."
set -a; . ./.env.local; set +a
URL="$NEXT_PUBLIC_SUPABASE_URL"
KEY="$SUPABASE_SERVICE_ROLE_KEY"
BIN="dist/houston-engine-linux-arm64"
BUCKET="engine-bin"
OBJECT="houston-engine-linux-arm64"

[ -f "$BIN" ] || { echo "missing $BIN — run build-engine-linux.sh first"; exit 1; }

echo "[host] ensuring bucket '$BUCKET' (public)..."
curl -s -X POST "$URL/storage/v1/bucket" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d "{\"id\":\"$BUCKET\",\"name\":\"$BUCKET\",\"public\":true}" >/dev/null || true

echo "[host] uploading $(ls -lh "$BIN" | awk '{print $5}')..."
# upsert so re-runs replace the binary
curl -s -X POST "$URL/storage/v1/object/$BUCKET/$OBJECT" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/octet-stream" -H "x-upsert: true" \
  --data-binary "@$BIN" >/dev/null

PUBLIC="$URL/storage/v1/object/public/$BUCKET/$OBJECT"
echo "[host] verifying..."
CODE=$(curl -s -o /dev/null -w "%{http_code}" -I "$PUBLIC")
echo "[host] HTTP $CODE"
echo
echo "HOUSTON_ENGINE_BINARY_URL=$PUBLIC"
