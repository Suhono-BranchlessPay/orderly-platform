#!/usr/bin/env bash
# =============================================================================
# THE ONLY supported production deploy path for Samurai on the VPS.
# Do not invent parallel flows (tmp-deploy-*.sh, bare git pull + build, etc.).
#
# Usage (on VPS as root):
#   bash scripts/deploy-samurai-main.sh
#
# Order (fixed):
#   1) pull origin/main
#   2) build api-server
#   3) ALWAYS restore storefront assets from dist → attached_assets/
#   4) pm2 restart samurai-api
# =============================================================================
set -euo pipefail

APP="${APP_DIR:-/var/www/samurai-resto}"
cd "$APP"

echo "== stash local dirt if any =="
git stash push -u -m "pre-deploy-samurai-main-$(date +%Y%m%d%H%M)" || true

echo "== 1/4 pull main =="
git fetch origin main
git checkout main
git reset --hard origin/main
HEAD_SHORT="$(git rev-parse --short HEAD)"
git log -1 --oneline
echo "HEAD=$HEAD_SHORT"

echo "== 2/4 build api =="
pnpm --filter @workspace/api-server run build 2>&1 | tail -30

echo "== 3/4 restore storefront assets from dist (always) =="
# STRICT: missing dist or zero restored files aborts before PM2 restart.
STRICT_ASSETS=1 SKIP_STOREFRONT_BUILD=1 bash scripts/deploy-samurai-assets.sh

ASSET_COUNT="$(
  find attached_assets -maxdepth 1 -type f \
    \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.webp' -o -iname '*.gif' \) \
    2>/dev/null | wc -l | tr -d ' '
)"
echo "attached_assets image count: $ASSET_COUNT"
if [[ "${ASSET_COUNT:-0}" -lt 1 ]]; then
  echo "ERROR: attached_assets empty after restore — refusing to restart PM2"
  exit 1
fi

echo "== 4/4 pm2 restart =="
pm2 restart samurai-api --update-env
sleep 3
pm2 pid samurai-api || true

PORT="$(
  node -e "const e=require('./ecosystem.config.cjs');const p=e.apps.find(a=>a.name==='samurai-api');process.stdout.write(String((p.env&&p.env.PORT)||3000))"
)"
curl -sS -m 8 "http://127.0.0.1:${PORT}/api/healthz" || curl -sS -m 8 "http://127.0.0.1:${PORT}/healthz" || true
echo

echo "deploy-samurai-main: OK HEAD=$HEAD_SHORT assets=$ASSET_COUNT"
echo "DONE"
