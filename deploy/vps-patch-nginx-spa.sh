#!/usr/bin/env bash
# Patch nginx so HTML goes to Express (per-tenant SEO) while assets stay on disk.
# Run on VPS: bash /tmp/vps-patch-nginx-spa.sh
set -euo pipefail

ROOT_PUBLIC="/var/www/samurai-resto/artifacts/samurai-resto/dist/public"

echo "==> Find nginx site configs mentioning the domains"
SITES=$(grep -rlE 'kirinhibachiexpress|samurairesto|samurai-resto' /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null || true)
if [ -z "$SITES" ]; then
  SITES=$(ls /etc/nginx/sites-enabled/* 2>/dev/null || true)
fi
echo "$SITES"

echo "==> Backup + show current location / blocks"
for f in $SITES; do
  [ -f "$f" ] || continue
  cp -a "$f" "$f.bak.$(date +%Y%m%d%H%M%S)"
  echo "----- $f -----"
  grep -nE 'server_name|location |try_files|proxy_pass|root ' "$f" | head -40
done

# Write a drop-in snippet the operator can include, plus attempt safe replace
SNIP=/etc/nginx/snippets/orderly-spa.conf
mkdir -p /etc/nginx/snippets
cat > "$SNIP" <<NGX
# Orderly multi-tenant SPA — HTML via Express, assets from disk
location /api/ {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    client_max_body_size 10M;
}

location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|webp|woff2?|map|txt)$ {
    root ${ROOT_PUBLIC};
    try_files \$uri =404;
    expires 7d;
    add_header Cache-Control "public";
}

location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
}
NGX

echo "Wrote $SNIP"
echo ""
echo "MANUAL STEP (required if auto-edit is unsafe):"
echo "  In each server { } for samurai/kirin, REPLACE the old"
echo "    location / { try_files \$uri /index.html; }"
echo "  and ensure root points at dist/public, then either paste the"
echo "  contents of $SNIP or: include $SNIP;"
echo ""
echo "Then:"
echo "  nginx -t && systemctl reload nginx"
echo "  curl -s https://kirinhibachiexpress.com/ | grep -E '<title>|canonical'"
