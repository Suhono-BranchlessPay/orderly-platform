#!/usr/bin/env bash
# Deploy Theme Pack Kirin + server-side SEO injection (VPS)
# Run on server: bash deploy/vps-deploy-theme-seo.sh
set -euo pipefail

ROOT="${ROOT:-/var/www/samurai-resto}"
cd "$ROOT"

ECO="$ROOT/ecosystem.config.cjs"
if [ ! -f "$ECO" ]; then
  echo "ERROR: $ECO not found"
  exit 1
fi

DBURL=$(node -e "console.log(require('./ecosystem.config.cjs').apps[0].env.DATABASE_URL||'')")
if [ -z "$DBURL" ]; then
  echo "ERROR: DATABASE_URL missing in ecosystem.config.cjs"
  exit 1
fi

STOREFRONT_DIST="$ROOT/artifacts/samurai-resto/dist/public"

echo "==> 1) Pull latest code"
git fetch origin
git pull --ff-only origin main || {
  echo "WARN: git pull failed — continuing with local tree"
}

echo "==> 2) Apply Kirin Theme Pack + keep menu empty"
if [ -f scripts/apply-kirin-themepack.sql ]; then
  psql "$DBURL" -f scripts/apply-kirin-themepack.sql
else
  echo "ERROR: scripts/apply-kirin-themepack.sql missing — push/pull first"
  exit 1
fi

echo "==> 3) Ensure STOREFRONT_DIST in ecosystem.config.cjs"
node <<'NODE'
const fs = require("fs");
const path = "ecosystem.config.cjs";
let src = fs.readFileSync(path, "utf8");
const dist = "/var/www/samurai-resto/artifacts/samurai-resto/dist/public";
if (/STOREFRONT_DIST\s*:/.test(src)) {
  src = src.replace(
    /STOREFRONT_DIST\s*:\s*["'][^"']*["']/,
    `STOREFRONT_DIST: "${dist}"`,
  );
} else {
  // Insert after PORT line inside env block
  src = src.replace(
    /(PORT\s*:\s*["']?\d+["']?\s*,)/,
    `$1\n        STOREFRONT_DIST: "${dist}",`,
  );
}
fs.writeFileSync(path, src);
console.log("STOREFRONT_DIST set to", dist);
NODE

echo "==> 4) Install + build"
pnpm install --frozen-lockfile || pnpm install
pnpm --filter @workspace/api-server run build
PORT=26204 BASE_PATH=/ pnpm --filter @workspace/samurai-resto run build

if [ ! -f "$STOREFRONT_DIST/index.html" ]; then
  echo "ERROR: storefront build missing $STOREFRONT_DIST/index.html"
  exit 1
fi

# Ensure ORDERLY head markers exist in built HTML (from source index.html)
if ! grep -q "ORDERLY:TENANT_HEAD" "$STOREFRONT_DIST/index.html"; then
  echo "WARN: built index.html missing ORDERLY:TENANT_HEAD markers — SEO inject may be partial"
fi

echo "==> 5) Restart PM2"
pm2 delete samurai-api 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

echo "==> 6) Patch nginx for HTML → Express (idempotent snippet check)"
NGINX_SITE=""
for f in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*; do
  [ -f "$f" ] || continue
  if grep -qE "kirinhibachiexpress|samurairesto|samurai-resto" "$f" 2>/dev/null; then
    NGINX_SITE="$f"
    break
  fi
done

if [ -n "$NGINX_SITE" ]; then
  echo "Found nginx site: $NGINX_SITE"
  if grep -q "proxy_pass http://127.0.0.1:8080" "$NGINX_SITE" && grep -q "location /" "$NGINX_SITE"; then
    # If location / still uses try_files only, print reminder
    if grep -A5 "location /" "$NGINX_SITE" | grep -q "try_files"; then
      echo "NOTE: $NGINX_SITE still has try_files on location /"
      echo "      Update to proxy HTML to Express — see deploy/nginx-multi-tenant.conf.md"
      echo "      Quick fix example written to /tmp/orderly-nginx-spa-snippet.conf"
      cat > /tmp/orderly-nginx-spa-snippet.conf <<'NGX'
# Replace "location / { try_files ... }" with:
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|webp|woff2?|map|txt)$ {
    root /var/www/samurai-resto/artifacts/samurai-resto/dist/public;
    try_files $uri =404;
    expires 7d;
}
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
NGX
    fi
  fi
else
  echo "NOTE: nginx site file not auto-detected — update manually (deploy/nginx-multi-tenant.conf.md)"
fi

echo "==> 7) Verify"
sleep 2
echo "--- Kirin config theme/seo ---"
curl -s -H "Host: kirinhibachiexpress.com" http://127.0.0.1:8080/api/config/checkout \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d); console.log(JSON.stringify({tenantId:j.tenantId,name:j.name,metaTitle:j.theme?.seo?.title||j.theme?.metaTitle,canonical:j.theme?.seo?.canonical,primary:j.theme?.colors?.primary||j.theme?.primary,city:j.restaurant?.city},null,2))})"

echo "--- Kirin HTML head (server inject) ---"
curl -s -H "Host: kirinhibachiexpress.com" http://127.0.0.1:8080/ \
  | grep -E '<title>|canonical|og:title|og:site_name|og:url' | head -20

echo "--- Samurai HTML head (must stay Samurai) ---"
curl -s -H "Host: samurairesto.com" http://127.0.0.1:8080/ \
  | grep -E '<title>|canonical|og:title' | head -10

echo "--- Kirin menu (must be empty) ---"
curl -s -H "Host: kirinhibachiexpress.com" http://127.0.0.1:8080/api/menu/items
echo

echo "DONE. If HTML still shows Samurai title, update nginx location / to proxy_pass :8080 and: nginx -t && systemctl reload nginx"
