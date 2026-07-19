#!/usr/bin/env bash
# Internal helper: restore Vite-hashed images from dist → attached_assets/.
# Production deploys must use scripts/deploy-samurai-main.sh (calls this with STRICT_ASSETS=1).
# Do not treat this file as a standalone deploy path.
#
# Env:
#   APP_DIR, DIST_ASSETS, ATTACHED_ASSETS
#   SKIP_STOREFRONT_BUILD=1 — restore only (used by deploy-samurai-main.sh)
#   STRICT_ASSETS=1 — fail if dist missing or zero files restored
set -euo pipefail

APP="${APP_DIR:-/var/www/samurai-resto}"
cd "$APP"

DIST="${DIST_ASSETS:-artifacts/samurai-resto/dist/public/assets}"
OUT="${ATTACHED_ASSETS:-attached_assets}"
STRICT="${STRICT_ASSETS:-0}"

if [[ ! -d "$DIST" ]]; then
  if [[ "$STRICT" == "1" ]]; then
    echo "ERROR: $DIST missing — cannot restore storefront assets"
    exit 1
  fi
  echo "WARN: $DIST missing — skip restore (build storefront first, then re-run)."
  exit 0
fi

mkdir -p "$OUT"

echo "== restore hashed assets from dist → $OUT =="
RESTORED="$(
python3 - "$DIST" "$OUT" <<'PY'
import os, re, shutil, sys
dist, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
pat = re.compile(
    r"^(?P<base>.+)-(?P<hash>[A-Za-z0-9_-]{6,12})\.(?P<ext>jpe?g|png|webp|gif)$",
    re.I,
)
restored = 0
for name in os.listdir(dist):
    m = pat.match(name)
    if not m:
        continue
    dest = os.path.join(out, f"{m.group('base')}.{m.group('ext')}")
    src = os.path.join(dist, name)
    shutil.copy2(src, dest)
    restored += 1
    print("restored", dest, file=sys.stderr)
print(restored)
PY
)"
echo "total_restored $RESTORED"

if [[ "$STRICT" == "1" && "${RESTORED:-0}" -lt 1 ]]; then
  echo "ERROR: zero assets restored from $DIST"
  exit 1
fi

if [[ "${SKIP_STOREFRONT_BUILD:-0}" == "1" ]]; then
  echo "SKIP_STOREFRONT_BUILD=1 — done after restore only"
  exit 0
fi

echo "== rebuild storefront =="
PORT="${STOREFRONT_PORT:-26204}" BASE_PATH=/ pnpm --filter @workspace/samurai-resto run build 2>&1 | tail -30

echo "deploy-samurai-assets: OK"
