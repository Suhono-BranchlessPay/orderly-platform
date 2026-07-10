#!/usr/bin/env bash
# Clear accidental Kirin menu clone + apply SEO identity (optional)
set -euo pipefail
cd /var/www/samurai-resto

DBURL=$(node -e "console.log(require('./ecosystem.config.cjs').apps[0].env.DATABASE_URL||'')")
if [ -z "$DBURL" ]; then
  echo "ERROR: DATABASE_URL missing in ecosystem.config.cjs"
  exit 1
fi

echo "==> Clear Kirin menu (do NOT clone Samurai — wait for Kirin Square)"
psql "$DBURL" <<'SQL'
DELETE FROM menu_items WHERE tenant_id = 'kirin';
DELETE FROM menu_categories WHERE tenant_id = 'kirin';
SELECT tenant_id, count(*) FROM menu_items GROUP BY 1 ORDER BY 1;
SELECT tenant_id, count(*) FROM menu_categories GROUP BY 1 ORDER BY 1;
SQL

echo "==> Verify API returns empty Kirin menu"
curl -s -H "Host: kirinhibachiexpress.com" http://127.0.0.1:8080/api/menu/items
echo
curl -s -H "Host: kirinhibachiexpress.com" http://127.0.0.1:8080/api/menu/categories
echo
echo "DONE — connect TENANT_KIRIN_SQUARE_* then import Kirin's real catalog"
