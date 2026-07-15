# Blok 4.2 — Google Business Profile trial (Samurai)

**Status:** Stage 2 — self-serve **Google OAuth connect** + LIVE review pull +
AI draft (`review_draft` / BAGIAN F) + auto-sync. Send to Google is real but
stays **gated** behind human approval + `GBP_SEND_ENABLED=1`.  
**Scope:** ONE tenant — `samurai`. Same hard rules as Blok 4.1 Meta social.

> **External blocker (cannot be coded away):** the Business Profile APIs
> (`mybusiness*`) are allow-listed by Google. Until the GCP project is approved,
> listing reviews / posting replies returns **403** even with a valid token. The
> OAuth connect + encrypted token storage below are ready the moment Google
> approves the project.

## Goal

Owner console can triage **Google reviews** and **Q&A**, draft a reply, and
approve it. Nothing auto-posts to Google until Stage 2 (OAuth + Business
Profile API) is wired and `GBP_SEND_ENABLED=1`.

Related (already live, no API): Order Online URL + UTM — see
`docs/BLOK_C1_GOOGLE_ORDER_ONLINE.md`.

## Hard rules

1. Human must click **Draft → Approve → Send** — nothing auto-posts to Google.
2. **Negative reviews (1–3★) always ESCALATE** — never auto-drafted (BAGIAN F).
3. `allergy_health` → blocked, never drafted for send.
4. `spam` → skipped, no draft.
5. `complaint` → may draft for review, **never** sent via `/send`.
6. Refresh tokens are **AES-256-GCM encrypted at rest** (never plaintext in DB /
   git / audit rows). Access tokens are minted in memory only.
7. `GBP_SEND_ENABLED` defaults **off**.

## What's included (Stage 1 + Stage 2)

| Piece | Detail |
|-------|--------|
| Tables | `gbp_inbox`, `gbp_reply_audit`, `gbp_oauth_connections` (encrypted refresh token) |
| OAuth connect | `GET /api/dashboard/gbp/oauth/start` → Google consent → `GET /api/gbp/oauth/callback` |
| Ingest | `POST /api/gbp/webhooks/gbp` + LIVE pull `POST /api/dashboard/gbp/sync` |
| Auto-sync | `GBP_SYNC_INTERVAL_MS` cron (off by default) — polls reviews, auto-drafts |
| AI draft | `review_draft` task → BAGIAN F (Google tone; 4–5★ warm reply, 1–3★ escalate) |
| Simulate | `POST /api/dashboard/gbp/simulate` (dashboard auth) |
| Inbox API | list / draft / approve / skip / send (send is LIVE, gated) |
| Console | “Google reviews (trial)” panel + **Connect Google** / **Sync reviews now** |

## OAuth flow (Stage 2)

1. Console **Connect Google** → `GET /api/dashboard/gbp/oauth/start?tenant_id=samurai`
   (dashboard session required). Builds a Google consent URL with a signed
   `state` that binds the callback to the tenant (HMAC over
   `ORDERLY_TOKEN_ENCRYPTION_KEY`, 10-min TTL).
2. Google → `GET /api/gbp/oauth/callback` (public; validated by `state`).
   Exchanges the code, best-effort discovers the account/location, encrypts and
   stores the refresh token in `gbp_oauth_connections`, then bounces the browser
   back to the console with `?gbp=connected`.
3. Access tokens are minted from the stored refresh token on demand and cached
   in memory (`resolveGbpAccessToken`).

## Env

```bash
# Platform Google OAuth app (Google Cloud → Credentials → OAuth client, Web)
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
# Must EXACTLY match an Authorized redirect URI on the OAuth client:
GBP_OAUTH_REDIRECT_URI=https://samurairesto.com/api/gbp/oauth/callback
# Where the callback bounces the browser after connect (console):
GBP_OAUTH_SUCCESS_REDIRECT=https://orderlyfoods.com/dashboard

# Required for at-rest token encryption (also used by Square OAuth):
ORDERLY_TOKEN_ENCRYPTION_KEY=...   # 32+ byte secret

# Auto-sync reviews every 30 min (off by default = 0):
GBP_SYNC_INTERVAL_MS=1800000

GBP_SEND_ENABLED=0
GBP_KILL_SWITCH_SAMURAI=0
GBP_AUTO_DRAFT_ENABLED=1

# Optional manual overrides (skip OAuth): env token / location
# GBP_LOCATION_RESOURCE=accounts/{acct}/locations/{loc}
# GBP_ACCESS_TOKEN=...            # short-lived manual paste
# TENANT_SAMURAI_GBP_REFRESH_TOKEN=...

# Map location resource → tenant for webhook ingest (optional; default samurai)
GBP_LOCATION_ID_TENANT_MAP_JSON={"locations/YOUR_LOCATION_ID":"samurai"}
GBP_DEFAULT_TENANT_ID=samurai

# Optional; falls back to SOCIAL_INTERNAL_API_KEY
# GBP_INTERNAL_API_KEY=...
```

Migrate:

```bash
psql "$DATABASE_URL" -f scripts/migrate-block4-gbp-inbox.sql       # Stage 1 (existing)
psql "$DATABASE_URL" -f scripts/migrate-gbp-oauth-schema.sql       # Stage 2 (this PR)
```

Deploy helper: `scripts/deploy-gbp-oauth.sh` (runs the migration, ensures env
placeholders, builds, restarts, smokes `/api/gbp/health`).

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

## Malik ops (Google Cloud + connect)

1. Confirm you own **Samurai Martinsville** in [Google Business Profile](https://business.google.com/).
2. In [Google Cloud Console](https://console.cloud.google.com/): create/select a
   project → **enable** the *Business Profile API* family
   (`mybusinessaccountmanagement`, `mybusinessbusinessinformation`, and the v4
   *My Business* API for review replies) → request access if prompted
   (allow-listing; may take days).
3. **APIs & Services → Credentials → Create OAuth client → Web application.**
   Add Authorized redirect URI `https://samurairesto.com/api/gbp/oauth/callback`.
   Put the client id/secret into `GOOGLE_OAUTH_CLIENT_ID/SECRET` on the VPS.
4. Set `ORDERLY_TOKEN_ENCRYPTION_KEY` (same one Square OAuth uses).
5. Console → **Google reviews (trial)** → pick tenant `samurai` → **Connect
   Google** → grant consent. On return the panel shows *Connected*.
6. **Sync reviews now** (or wait for `GBP_SYNC_INTERVAL_MS`) → reviews land in
   the inbox with an AI draft. Approve, then **Send to Google** only after
   `GBP_SEND_ENABLED=1`.
7. Keep the Order Online URL pointing at Orderly (C1 doc).

## Still pending (future)

- Pub/Sub push subscription (real-time new-review notifications vs polling)
- Q&A answers (`mybusinessqanda` API — reviews are wired, Q&A reply is stubbed)
- Multi-tenant beyond the `samurai` trial allow-list

## Dual-mount note

Nginx proxies `/api/dashboard/*` on `orderlyfoods.com`; `samurairesto.com`
proxies all `/api/*` (storefront host). Routes are mounted at:

- `/api/gbp/*` (direct / Pub/Sub / **OAuth callback** on samurairesto.com)
- `/api/dashboard/gbp/*` (console — inbox + **OAuth start**)

The OAuth **callback** URL registered in Google Cloud must be the
`samurairesto.com/api/gbp/oauth/callback` form (exactly like Square's callback
lives on samurairesto.com), since `orderlyfoods.com` only proxies
`/api/dashboard/*`.
