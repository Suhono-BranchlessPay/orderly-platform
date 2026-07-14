# Blok 3.2 / 3.3 — Support otomatis + Dashboard i18n

## 3.2 Support otomatis (KB retrieval)

- Table `support_kb_articles` (platform FAQ + per-tenant articles)
- Table `support_escalations` (open when confidence is low or user forces escalate)
- API (dashboard auth cookie), mounted at **`/api/dashboard/support`**:
  - `GET /health`
  - `GET /kb?tenant_id=&locale=`
  - `POST /chat` `{ question, tenant_id, locale?, escalate? }`
  - `GET /escalations?tenant_id=&status=`
- Console panel **Support assistant**: ask → answer from KB, or escalate
- Seeded EN platform FAQ (reports, menu, Square, QR, anchor, social, refunds, escalate)
- **Not** open-ended LLM inventing money/health facts — retrieval + confidence floor only

Migration: `scripts/migrate-block3-support-i18n.sql`

## 3.3 Dashboard multibahasa

Locales: `en, zh, es, id, th, my, vi, hi, ne, fil, ar`

- Vanilla `public/dashboard/i18n.js` + `data-i18n` keys (console is still one HTML page)
- Auto-detect from `navigator.language` + `localStorage` override
- Manual picker in the top bar
- RTL for `ar`
- Banner when locale is marked `needs_native` (th / my / ne / ar)

**Note on react-i18next:** the work order named react-i18next; this console is not React yet. Dictionaries are structured so a future React console can move them into react-i18next JSON resources without inventing a second string system.

## Deploy

```bash
psql "$DATABASE_URL" -f scripts/migrate-block3-support-i18n.sql
pnpm --filter @workspace/api-server build
pm2 restart ecosystem.config.cjs --update-env
```

Smoke (after dashboard login cookie):

```bash
curl -sS -b cookie.txt 'https://orderlyfoods.com/api/dashboard/support/health'
curl -sS -b cookie.txt -X POST 'https://orderlyfoods.com/api/dashboard/support/chat' \
  -H 'Content-Type: application/json' \
  -d '{"tenant_id":"samurai","question":"How do I change the menu?"}'
```

## Quality hold

Ask Malik’s network for native review of **th / my / ne / ar** before treating those locales as owner-ready.
