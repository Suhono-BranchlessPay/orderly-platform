#!/usr/bin/env bash
set -euo pipefail
cd /var/www/samurai-resto

mkdir -p ~/backups
cp -a ecosystem.config.cjs "~/backups/ecosystem.config.cjs.bak.$(date +%Y%m%d%H%M)" 2>/dev/null || true

echo "== git reset to origin/main =="
git fetch origin '+refs/heads/main:refs/remotes/origin/main'
git checkout main
git reset --hard origin/main
git log -1 --oneline

if [[ ! -f ecosystem.config.cjs ]]; then
  LATEST=$(ls -t ~/backups/ecosystem.config.cjs.bak* 2>/dev/null | head -1 || true)
  if [[ -n "${LATEST:-}" ]]; then
    cp "$LATEST" ecosystem.config.cjs
  else
    echo "Missing ecosystem.config.cjs" >&2
    exit 1
  fi
fi

echo "== migrate gift cards =="
DBURL=$(node -e "const m=require('./ecosystem.config.cjs'); console.log(m.apps[0].env.DATABASE_URL)")
psql "$DBURL" -v ON_ERROR_STOP=1 -f scripts/migrate-gift-cards.sql

echo "== ensure ORDERLY_GIFT_CARDS_ENABLED present (default off) =="
node <<'NODE'
const fs = require('fs');
const p = '/var/www/samurai-resto/ecosystem.config.cjs';
let src = fs.readFileSync(p, 'utf8');
if (!/ORDERLY_GIFT_CARDS_ENABLED/.test(src)) {
  src = src.replace(
    /(env\s*:\s*\{)/,
    `$1\n      ORDERLY_GIFT_CARDS_ENABLED: "0",`,
  );
  fs.writeFileSync(p, src);
  console.log('added ORDERLY_GIFT_CARDS_ENABLED=0');
} else {
  console.log('ORDERLY_GIFT_CARDS_ENABLED already present');
}
NODE

echo "== build + restart =="
pnpm install --frozen-lockfile
pnpm --filter @workspace/db build || true
pnpm --filter api-server build
pm2 restart samurai-api --update-env
pm2 save
sleep 2
curl -sS -o /dev/null -w "healthz %{http_code}\n" http://127.0.0.1:8080/api/healthz || true
echo "Done. Gift card engine stays OFF until ORDERLY_GIFT_CARDS_ENABLED=1."
