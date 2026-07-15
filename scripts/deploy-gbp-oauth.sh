#!/usr/bin/env bash
# Blok 4.2 Stage 2 — deploy Google Business Profile OAuth connect + review sync.
# Runs the migration, ensures env placeholders (all OFF/blank by default),
# rebuilds, restarts, and smokes /api/gbp/health.
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

echo "== migrate gbp_oauth_connections =="
DBURL=$(node -e "const m=require('./ecosystem.config.cjs'); console.log(m.apps[0].env.DATABASE_URL)")
psql "$DBURL" -v ON_ERROR_STOP=1 -f scripts/migrate-gbp-oauth-schema.sql

echo "== ensure GBP Stage 2 env placeholders present (safe defaults) =="
node <<'NODE'
const fs = require('fs');
const p = '/var/www/samurai-resto/ecosystem.config.cjs';
let src = fs.readFileSync(p, 'utf8');
const ensure = (key, val) => {
  if (new RegExp(key).test(src)) { console.log(key, 'already present'); return; }
  src = src.replace(/(env\s*:\s*\{)/, `$1\n      ${key}: ${JSON.stringify(val)},`);
  console.log('added', key, '=', val);
};
// Send stays OFF; sync stays OFF (0). Fill real OAuth creds manually + reload.
ensure('GBP_SEND_ENABLED', '0');
ensure('GBP_AUTO_DRAFT_ENABLED', '1');
ensure('GBP_SYNC_INTERVAL_MS', '0');
ensure('GBP_OAUTH_REDIRECT_URI', 'https://samurairesto.com/api/gbp/oauth/callback');
ensure('GBP_OAUTH_SUCCESS_REDIRECT', 'https://orderlyfoods.com/dashboard');
fs.writeFileSync(p, src);
console.log('--- reminder: set GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / ORDERLY_TOKEN_ENCRYPTION_KEY, then pm2 restart --update-env ---');
NODE

echo "== build =="
pnpm --filter @workspace/db exec tsc -p tsconfig.json
pnpm --filter @workspace/api-server build

echo "== pm2 restart =="
pm2 restart ecosystem.config.cjs --update-env
sleep 2

echo "== smoke =="
curl -sS -o /dev/null -w 'healthz:%{http_code}\n' https://samurairesto.com/api/healthz
curl -sS https://samurairesto.com/api/gbp/health | head -c 600
echo
git log -1 --oneline
echo "OK gbp oauth deploy — now set Google creds + Connect Google in the console"
