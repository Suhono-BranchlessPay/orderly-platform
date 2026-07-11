#!/usr/bin/env bash
# Deploy Theme+SEO when /var/www/samurai-resto is NOT a git checkout.
# Usage on VPS:
#   bash <(curl -fsSL https://raw.githubusercontent.com/Suhono-BranchlessPay/orderly-platform/main/deploy/vps-deploy-theme-seo-nogit.sh)
set -euo pipefail

ROOT="${ROOT:-/var/www/samurai-resto}"
SRC="${SRC:-/tmp/orderly-platform-src}"
REPO="${REPO:-https://github.com/Suhono-BranchlessPay/orderly-platform.git}"
STOREFRONT_DIST="$ROOT/artifacts/samurai-resto/dist/public"

cd "$ROOT"
test -f ecosystem.config.cjs

DBURL=$(node -e "console.log(require('./ecosystem.config.cjs').apps[0].env.DATABASE_URL||'')")
test -n "$DBURL"

echo "==> 1) Clone latest → $SRC"
rm -rf "$SRC"
git clone --depth 1 "$REPO" "$SRC"

echo "==> 2) Sync code (keep ecosystem, .env, uploads, node_modules)"
# Fix common zip-deploy corruption: index.html sometimes becomes a directory
if [ -d "$ROOT/artifacts/samurai-resto/index.html" ]; then
  echo "WARN: removing directory masquerading as index.html"
  rm -rf "$ROOT/artifacts/samurai-resto/index.html"
fi
if [ -d "$ROOT/artifacts/samurai-resto/dist/public/index.html" ]; then
  rm -rf "$ROOT/artifacts/samurai-resto/dist/public/index.html"
fi

rsync -a \
  --exclude 'ecosystem.config.cjs' \
  --exclude '.env' \
  --exclude 'node_modules' \
  --exclude 'artifacts/api-server/uploads' \
  --exclude 'artifacts/api-server/dist' \
  --exclude 'artifacts/samurai-resto/dist' \
  --exclude '.git' \
  "$SRC"/ "$ROOT"/

# Ensure source index.html is a real file after sync
if [ ! -f "$ROOT/artifacts/samurai-resto/index.html" ]; then
  echo "ERROR: artifacts/samurai-resto/index.html is missing or not a file"
  ls -la "$ROOT/artifacts/samurai-resto/index.html" || true
  exit 1
fi

echo "==> 3) Apply Identity Packs (Samurai + Kirin + Linton)"
psql "$DBURL" -f "$ROOT/scripts/apply-samurai-identity-pack.sql"
psql "$DBURL" -f "$ROOT/scripts/apply-kirin-themepack.sql"
psql "$DBURL" -f "$ROOT/scripts/apply-replit-variant-names.sql"
psql "$DBURL" -f "$ROOT/scripts/migrate-samurai-linton-tenant.sql"

echo "==> 4) Set STOREFRONT_DIST"
python3 - <<PY
from pathlib import Path
import re
p = Path("ecosystem.config.cjs")
src = p.read_text()
dist = "${STOREFRONT_DIST}"
if re.search(r"STOREFRONT_DIST\s*:", src):
    src = re.sub(r'STOREFRONT_DIST\s*:\s*["\'][^"\']*["\']', f'STOREFRONT_DIST: "{dist}"', src)
else:
    src = re.sub(r'(PORT\s*:\s*["\']?\d+["\']?\s*,)', rf'\1\n        STOREFRONT_DIST: "{dist}",', src, count=1)
p.write_text(src)
print("STOREFRONT_DIST =", dist)
PY

echo "==> 5) Install + build"
pnpm install --frozen-lockfile || pnpm install
pnpm --filter @workspace/api-server run build
PORT=26204 BASE_PATH=/ pnpm --filter @workspace/samurai-resto run build
test -f "$STOREFRONT_DIST/index.html"

echo "==> 6) Restart PM2"
pm2 delete samurai-api 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

echo "==> 7) Verify"
sleep 2
echo "--- Kirin HTML ---"
curl -s -H "Host: kirinhibachiexpress.com" http://127.0.0.1:8080/ \
  | grep -E '<title>|canonical|og:title|og:site_name' | head -20 || true
echo "--- Samurai HTML ---"
curl -s -H "Host: samurairesto.com" http://127.0.0.1:8080/ \
  | grep -E '<title>|canonical' | head -10 || true
echo "--- Kirin menu ---"
curl -s -H "Host: kirinhibachiexpress.com" http://127.0.0.1:8080/api/menu/items
echo
echo "--- Linton HTML ---"
curl -s -H "Host: samurailinton.com" http://127.0.0.1:8080/ \
  | grep -E '<title>|canonical|og:title' | head -10 || true
echo "--- Linton menu (expect []) ---"
curl -s -H "Host: samurailinton.com" http://127.0.0.1:8080/api/menu/items
echo
echo "DONE. Update nginx location / → proxy_pass :8080 if public domain still wrong."
echo "Add server_name samurailinton.com when DNS is ready (see deploy/nginx-multi-tenant.conf.md)."
