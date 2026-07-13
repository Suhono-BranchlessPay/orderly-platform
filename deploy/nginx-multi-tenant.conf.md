# Nginx — multi-tenant storefront (Orderly)

Both `samurairesto.com` and `kirinhibachiexpress.com` (and future tenants) point at
the **same** codebase. Document requests go through Express so Host → tenant SEO
is injected server-side. Static assets (JS/CSS/images) are served from disk.

## Required env (PM2 / ecosystem)

```js
STOREFRONT_DIST: "/var/www/orderly-platform/artifacts/samurai-resto/dist/public",
```

## Example server block (one block per domain, or shared with multiple server_name)

```nginx
server {
    listen 443 ssl http2;
    server_name samurairesto.com www.samurairesto.com
                kirinhibachiexpress.com www.kirinhibachiexpress.com;
    client_max_body_size 10M;

    # TLS certs — use certbot / your existing certs per domain as needed

    root /var/www/orderly-platform/artifacts/samurai-resto/dist/public;

    # API → Express
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Dynamic flyer QR — GET /r/:tenantSlug (must hit Express, not SPA static miss)
    location /r/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Fingerprinted assets — serve from disk (fast)
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|webp|woff2?|map|txt)$ {
        try_files $uri =404;
        expires 7d;
        add_header Cache-Control "public";
    }

    # HTML / SPA routes → Express injects per-tenant <head> from Host
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Verify (no JS — crawler view)

```bash
curl -sI -H "Host: kirinhibachiexpress.com" http://127.0.0.1:8080/ | head
curl -s  -H "Host: kirinhibachiexpress.com" http://127.0.0.1:8080/ | grep -E 'canonical|og:title|<title>'
# Expect: canonical https://kirinhibachiexpress.com/  (NOT samurairesto.com)
```

## DB migration for SEO theme

```bash
psql "$DATABASE_URL" -f scripts/migrate-tenant-seo-identity.sql
```

## Assets still needed from brand owners

Place in `artifacts/samurai-resto/public/` (or uploads):

- `/kirin-logo.png`
- `/kirin-og-image.jpg`
- `/samurai-logo.png` (if not already deployed)
- `/og-image.jpg` (Samurai)
