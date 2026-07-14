# Blok 4.2 — Google Business Profile trial (Samurai)

**Status:** Stage 1 skeleton (inbox + human approve). **Send to Google is stubbed.**  
**Scope:** ONE tenant — `samurai`. Same hard rules as Blok 4.1 Meta social.

## Goal

Owner console can triage **Google reviews** and **Q&A**, draft a reply, and
approve it. Nothing auto-posts to Google until Stage 2 (OAuth + Business
Profile API) is wired and `GBP_SEND_ENABLED=1`.

Related (already live, no API): Order Online URL + UTM — see
`docs/BLOK_C1_GOOGLE_ORDER_ONLINE.md`.

## Hard rules

1. Human must click **Draft → Approve** (and later **Send**) — no auto-reply.
2. `allergy_health` → blocked, never drafted for send.
3. `spam` → skipped, no draft.
4. `complaint` → may draft for review, **never** sent via `/send`.
5. Tokens only in env — never in DB / git / audit rows.
6. `GBP_SEND_ENABLED` defaults **off**.

## What Stage 1 includes

| Piece | Detail |
|-------|--------|
| Tables | `gbp_inbox`, `gbp_reply_audit` |
| Ingest | `POST /api/gbp/webhooks/gbp` (Pub/Sub-ish / loose JSON) |
| Simulate | `POST /api/dashboard/gbp/simulate` (dashboard auth) |
| Inbox API | list / draft / approve / skip / send (send → 501 stub) |
| Console | “Google reviews (trial)” panel |

## Env

```bash
# Map location resource → tenant (optional; default samurai)
GBP_LOCATION_ID_TENANT_MAP_JSON={"locations/YOUR_LOCATION_ID":"samurai"}
GBP_DEFAULT_TENANT_ID=samurai

GBP_SEND_ENABLED=0
GBP_KILL_SWITCH_SAMURAI=0

# Stage 2 only — not required for inbox/simulate
# GBP_ACCESS_TOKEN=...
# TENANT_SAMURAI_GBP_ACCESS_TOKEN=...

# Optional; falls back to SOCIAL_INTERNAL_API_KEY
# GBP_INTERNAL_API_KEY=...
```

Migrate:

```bash
psql "$DATABASE_URL" -f scripts/migrate-block4-gbp-inbox.sql
```

## Smoke (no Google OAuth)

```bash
# Health (no auth)
curl -s "$BASE/api/gbp/health"

# Simulate a 5★ review (dashboard cookie or internal key)
curl -s -X POST "$BASE/api/dashboard/gbp/simulate" \
  -H "Content-Type: application/json" \
  -H "Cookie: ...dashboard session..." \
  -d '{
    "kind": "review",
    "author_name": "Alex",
    "body": "Great hibachi tonight!",
    "star_rating": 5
  }'
```

Console → **Google reviews (trial)** → Draft → Approve.  
**Send to Google** should fail with a clear Stage-2 message until OAuth exists.

## Malik ops (location ownership)

1. Confirm you own **Samurai Martinsville** in [Google Business Profile](https://business.google.com/).
2. Keep Order Online URL pointing at Orderly (C1 doc).
3. Stage 2 later: Google Cloud project → enable Business Profile APIs → OAuth
   with location management → store refresh/access token in env → wire
   `integrations/gbpReviews.ts` → controlled `GBP_SEND_ENABLED=1` smoke.

## Stage 2 (not in this PR)

- Real OAuth + token refresh
- Pub/Sub notification subscription for new reviews
- `accounts.locations.reviews.updateReply` / Q&A answers
- Multi-tenant location registry beyond env JSON map

## Dual-mount note

Nginx proxies `/api/dashboard/*`. Routes are mounted at:

- `/api/gbp/*` (direct / Pub/Sub)
- `/api/dashboard/gbp/*` (console)
