# Dynamic packaging QR (Orderly)

## How it works

```
Printed QR  →  https://orderlyfoods.com/r/{slug}  →  302 redirect  →  tenant order page
```

- **Printed URL never changes** (safe for cups/bags).
- **Redirect target** lives in `tenants.theme.qr.target` — change anytime without reprint.
- Each scan is logged to `qr_scans` (tenant, time, UA, referer; no PII).

## Samurai Martinsville (first tenant)

| | |
|--|--|
| Slug | `samurai` |
| Print URL | `https://orderlyfoods.com/r/samurai` |
| Default target | `https://samurairesto.com/order` |
| Files | `assets/qr/samurai.svg`, `assets/qr/samurai-print.png` |

## Deploy (VPS)

```bash
cd /var/www/samurai-resto
DBURL=$(node -e "console.log(require('./ecosystem.config.cjs').apps[0].env.DATABASE_URL||'')")

# After syncing this branch:
psql "$DBURL" -f scripts/migrate-qr-redirects.sql
pnpm install
pnpm --filter @workspace/api-server run build
pm2 restart samurai-api

# Generate print assets (on VPS or locally)
node scripts/generate-qr.mjs samurai
ls -la assets/qr/
```

### Nginx for orderlyfoods.com

Proxy `/r/` (and preferably `/`) to the same Express app (`127.0.0.1:8080`), same pattern as Samurai/Kirin. Example:

```nginx
location /r/ {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

If `orderlyfoods.com` is not yet on this VPS, temporary test:

```bash
curl -sI -H "Host: samurairesto.com" http://127.0.0.1:8080/r/samurai
# Expect: 302 Location: https://samurairesto.com/order
```

## Change redirect without reprint

```sql
UPDATE tenants SET theme = jsonb_set(
  theme, '{qr,target}', '"https://samurairesto.com/order?utm_source=qr_cup"'
) WHERE id = 'samurai';
```

## Stats

```bash
curl -s http://127.0.0.1:8080/r/samurai/stats
```

## Other tenants

```bash
node scripts/generate-qr.mjs kirin
node scripts/generate-qr.mjs samurai-linton
```
