#!/usr/bin/env bash
# =============================================================================
# THE ONLY supported production deploy path for Samurai on the VPS.
#
# Usage (on VPS as root):
#   bash scripts/deploy-samurai-main.sh
#
# Safe money-path order (learned 20 Jul 2026 — fail-closed Square):
#   Pulling code to disk does NOT kill payments. Restarting without env does.
#   1) pull origin/main
#   2) PREFLIGHT: mirror/verify TENANT_SAMURAI_SQUARE_* BEFORE pm2 recreate
#   3) build api-server
#   4) ALWAYS restore storefront assets from dist → attached_assets/
#   5) pm2 delete + start (NOT restart — restart --update-env can miss new keys)
#   6) POSTFLIGHT: Host samurairesto.com /api/square/config must be enabled:true
# =============================================================================
set -euo pipefail

APP="${APP_DIR:-/var/www/samurai-resto}"
cd "$APP"

echo "== stash local dirt if any =="
git stash push -u -m "pre-deploy-samurai-main-$(date +%Y%m%d%H%M)" || true

echo "== 1/6 pull main =="
git fetch origin main
git checkout main
git reset --hard origin/main
HEAD_SHORT="$(git rev-parse --short HEAD)"
git log -1 --oneline
echo "HEAD=$HEAD_SHORT"

echo "== 2/6 PREFLIGHT money env (before process recreate) =="
if [[ ! -f scripts/deploy-preflight-tenant-money.mjs ]]; then
  echo "ERROR: missing scripts/deploy-preflight-tenant-money.mjs"
  exit 1
fi
node scripts/deploy-preflight-tenant-money.mjs

echo "== 3/6 build api =="
pnpm --filter @workspace/api-server run build 2>&1 | tail -30

echo "== 4/6 restore storefront assets from dist (always) =="
STRICT_ASSETS=1 SKIP_STOREFRONT_BUILD=1 bash scripts/deploy-samurai-assets.sh

ASSET_COUNT="$(
  find attached_assets -maxdepth 1 -type f \
    \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.webp' -o -iname '*.gif' \) \
    2>/dev/null | wc -l | tr -d ' '
)"
echo "attached_assets image count: $ASSET_COUNT"
if [[ "${ASSET_COUNT:-0}" -lt 1 ]]; then
  echo "ERROR: attached_assets empty after restore — refusing to recreate PM2"
  exit 1
fi

echo "== 5/6 pm2 delete + start (loads full ecosystem env) =="
# `pm2 restart --update-env` previously left TENANT_SAMURAI_SQUARE_* unloaded
# and took Samurai payments offline until delete+start.
pm2 delete samurai-api || true
pm2 start ecosystem.config.cjs --update-env
pm2 save || true
sleep 4
pm2 pid samurai-api || true

PORT="$(
  node -e "const e=require('./ecosystem.config.cjs');const p=e.apps.find(a=>a.name==='samurai-api');process.stdout.write(String((p.env&&p.env.PORT)||3000))"
)"
curl -sS -m 8 "http://127.0.0.1:${PORT}/api/healthz" || true
echo

echo "== 6/6 POSTFLIGHT: Samurai payments must stay enabled =="
SQ_JSON="$(curl -sS -m 8 -H "Host: samurairesto.com" "http://127.0.0.1:${PORT}/api/square/config" || true)"
echo "samurai square/config: $SQ_JSON"
if ! echo "$SQ_JSON" | grep -q '"enabled":true'; then
  echo "ERROR: Samurai square/config is not enabled:true after deploy."
  echo "Payments may be down — fix TENANT_SAMURAI_SQUARE_* and: pm2 delete samurai-api && pm2 start ecosystem.config.cjs"
  exit 1
fi
if ! echo "$SQ_JSON" | grep -q 'L1XA1D2Q249NH'; then
  echo "WARN: Samurai locationId unexpected — verify manually: $SQ_JSON"
fi

echo "deploy-samurai-main: OK HEAD=$HEAD_SHORT assets=$ASSET_COUNT"
echo "DONE"
