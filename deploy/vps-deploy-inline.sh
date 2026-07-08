#!/usr/bin/env bash
set -eu
ROOT="${1:-/var/www/samurai-resto}"
API="$ROOT/artifacts/api-server"
WEB="$ROOT/artifacts/samurai-resto"
TMP="/tmp/samurai-deploy-src"
REPO="https://github.com/Suhono-BranchlessPay/Commercial-website.git"

echo "==> Deploy prepaid payments (git clone, no curl raw)"
cd "$ROOT"

if ! command -v git >/dev/null 2>&1; then
  apt-get update -qq && apt-get install -y git
fi

rm -rf "$TMP"
git clone --depth 1 "$REPO" "$TMP"

for f in \
  "artifacts/api-server/src/integrations/square.ts" \
  "artifacts/api-server/src/routes/orders.ts" \
  "artifacts/api-server/src/routes/square.ts" \
  "artifacts/api-server/src/routes/index.ts" \
  "lib/db/src/schema/menu.ts" \
  "artifacts/samurai-resto/src/pages/order.tsx" \
  "artifacts/samurai-resto/src/components/SquareCardPayment.tsx" \
  "artifacts/samurai-resto/src/pages/owner.tsx" \
  "lib/api-zod/src/generated/types/orderInput.ts" \
  "lib/api-zod/src/generated/types/order.ts"
do
  mkdir -p "$(dirname "$ROOT/$f")"
  cp "$TMP/$f" "$ROOT/$f"
  echo "  copied $f"
done

DBURL=""
if [ -f "$ROOT/.env" ]; then
  DBURL=$(grep -E '^DATABASE_URL=' "$ROOT/.env" | head -1 | sed 's/^DATABASE_URL=//' | tr -d '"' | tr -d "'")
fi
if [ -z "$DBURL" ] && [ -f "$ROOT/ecosystem.config.cjs" ]; then
  DBURL=$(node -e "console.log(require('$ROOT/ecosystem.config.cjs').apps[0].env.DATABASE_URL||'')")
fi
if [ -n "$DBURL" ]; then
  psql "$DBURL" -c "ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_timing text NOT NULL DEFAULT 'pay_now';" || true
  psql "$DBURL" -c "ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid';" || true
  psql "$DBURL" -c "ALTER TABLE orders ADD COLUMN IF NOT EXISTS square_payment_id text;" || true
fi

echo "==> Build API"
cd "$API"
pnpm run build

echo "==> Build frontend"
cd "$WEB"
PORT=26204 BASE_PATH=/ pnpm run build

echo "==> Restart PM2"
cd "$ROOT"
pm2 delete samurai-api 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

echo "==> Verify"
sleep 2
curl -s http://localhost:8080/api/healthz
echo ""
curl -s http://localhost:8080/api/square/config
echo ""
echo "DONE"
