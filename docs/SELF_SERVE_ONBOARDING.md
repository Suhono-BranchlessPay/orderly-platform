# Self-Serve Onboarding (Blok 3.1)

A prospective restaurant walks through a wizard (`public/onboarding/index.html`,
served at `/onboarding`) and, at the end, connects their own Square account.
**The restaurant authorizes Square themselves — Square credentials never
pass through a human at Orderly.**

## What is REAL vs still a skeleton

**REAL (this update):**
- `POST /api/onboarding/:id/square/start` — builds a genuine Square OAuth
  `authorize` URL (sandbox or production) using the **platform's** Square
  application id, and stores a CSRF `state` on the onboarding session.
- `GET /api/onboarding/square/callback` — verifies `state`, exchanges the
  authorization `code` for a real access/refresh token
  (`POST /oauth2/token`), lists the merchant's locations
  (`GET /v2/locations`), picks the first `ACTIVE` one, and stores the tokens
  **encrypted at rest** (AES-256-GCM) in `square_oauth_connections`.
- Publishing a session (`ONBOARDING_PUBLISH_ENABLED=1`) links that
  connection row to the new draft tenant (`tenant_id`), so once a human
  activates the tenant, `integrations/square.ts` can resolve real order/pay
  credentials for it automatically.

**Still a skeleton (unchanged from before):**
- "Theme" is a deterministic name-hash → palette lookup — not ML.
- `menu-draft` is opaque JSON, never written to `menu_items` / `menu_categories`.
- `/publish` only ever creates a **draft** (`status: "draft"`) tenant row. A
  human must still flip it to `active` via the normal tenant admin path — no
  money path is ever auto-activated by onboarding.

## Flow

1. Restaurant fills in basics → `POST /:id/square/start` returns
   `{ authorizeUrl, state, environment, scopes }` (JSON — the wizard does
   `window.location = authorizeUrl` itself, it is **not** a forced redirect).
2. Restaurant reviews and approves scopes on Square's own hosted page.
3. Square redirects the browser to
   `SQUARE_OAUTH_REDIRECT_URI` (default
   `https://samurairesto.com/api/onboarding/square/callback`) with
   `?code=...&state=...`.
4. The callback verifies `state` against
   `onboarding_sessions.square_oauth_state`, exchanges the code, stores
   encrypted tokens, and either:
   - redirects to `${ONBOARDING_UI_BASE_URL}/onboarding?session=<id>&square=connected`
     if `ONBOARDING_UI_BASE_URL` is set, or
   - renders a small inline HTML success page if it isn't (so the tab is
     never left blank/broken — Square hits this URL directly, not via fetch).
5. The wizard's `/status` and `/preview` responses include
   `session.square.connected` / `merchantId` / `locationId` so the UI can
   show a "✅ Square connected" badge without ever seeing the token.

## Scopes requested

Space-separated, from Square's [documented OAuth permissions](https://developer.squareup.com/docs/oauth-api/square-permissions):

```
MERCHANT_PROFILE_READ MERCHANT_PROFILE_WRITE ORDERS_READ ORDERS_WRITE PAYMENTS_READ PAYMENTS_WRITE ITEMS_READ
```

(`MERCHANT_PROFILE_READ`/`WRITE` is required to call `GET /v2/locations` and
resolve the pickup location; the rest mirror what the existing Samurai
env-token integration already uses for taking + refunding orders.)

## Env vars — checklist for Malik

Set these on the API server that owns `/api/onboarding` (never commit real
values — this repo's `.env.sandbox.example` only has placeholders):

| Var | Required for | Notes |
| --- | --- | --- |
| `SQUARE_OAUTH_APPLICATION_ID` | `/square/start` | Orderly's **platform** Square app client id (Square Developer Dashboard → your app → Credentials). Different from a restaurant's own `SQUARE_APPLICATION_ID` used by the manual/env path. |
| `SQUARE_OAUTH_APPLICATION_SECRET` | `/square/callback` | Platform app's client secret. **Server-side only, never sent to the browser.** |
| `SQUARE_OAUTH_REDIRECT_URI` | both | Must **exactly** match a redirect URL registered in the Square Developer Dashboard for this app. Default: `https://samurairesto.com/api/onboarding/square/callback`. |
| `SQUARE_OAUTH_ENVIRONMENT` | both | `sandbox` (default) or `production`. Controls both the authorize/token host (`connect.squareupsandbox.com` vs `connect.squareup.com`) and which redirect URL Square expects. |
| `ORDERLY_TOKEN_ENCRYPTION_KEY` | storing tokens | Any secret string, 32+ bytes recommended. Hashed with SHA-256 to a 32-byte AES-256-GCM key — you do not need to hand-craft an exact-length key. **Losing this key means existing encrypted tokens can never be decrypted again** — back it up like any other production secret. |
| `ONBOARDING_UI_BASE_URL` | nicer UX (optional) | e.g. `https://orderlyfoods.com`. When set, `/square/callback` does a real `302` redirect back into the wizard (`/onboarding?session=<id>&square=connected`) instead of rendering a standalone HTML success page. |

If `SQUARE_OAUTH_APPLICATION_ID`/`SQUARE_OAUTH_APPLICATION_SECRET` are
missing, `/square/start` and `/square/callback` return a **503** with a clear
message — never a silent failure. Same for a missing
`ORDERLY_TOKEN_ENCRYPTION_KEY`.

### Registering the redirect URI in Square

1. Square Developer Dashboard → your app → **OAuth**.
2. Add the exact value of `SQUARE_OAUTH_REDIRECT_URI` (production and/or
   sandbox app, matching `SQUARE_OAUTH_ENVIRONMENT`) to "Redirect URL".
3. Under **Permissions**, make sure the app is allowed to request the scopes
   listed above (some are gated behind Square's app review for production —
   sandbox has no such gate, so test there first).

### Sandbox vs production

- Sandbox: create a test seller account in the Square Developer Dashboard →
  Sandbox Test Accounts. `SQUARE_OAUTH_ENVIRONMENT=sandbox` points the
  authorize/token/`/v2/locations` calls at `connect.squareupsandbox.com`.
- Production: flip `SQUARE_OAUTH_ENVIRONMENT=production` and register the
  production redirect URI. Existing sandbox connections are unaffected —
  `environment` is stored per-row on `square_oauth_connections`.

## Storage

Migration: `scripts/migrate-block3-square-oauth.sql` (additive, safe to
re-run — `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`).

- `onboarding_sessions` gains `square_merchant_id`, `square_location_id`,
  `square_connected_at` (denormalized "is this session connected" flags —
  no tokens live here).
- New table `square_oauth_connections`: `id`, `onboarding_session_id`,
  `tenant_id` (nullable until publish), `merchant_id`, `location_id`,
  `access_token_enc`, `refresh_token_enc`, `access_token_expires_at`,
  `scopes`, `environment`, `meta` (jsonb), timestamps.
  `access_token_enc` / `refresh_token_enc` are **always** AES-256-GCM
  ciphertext (`artifacts/api-server/src/lib/tokenCrypto.ts`), format
  `v1:<ivHex>:<authTagHex>:<ciphertextHex>` — plaintext tokens are never
  written to this table, to logs, or to git.

## Runtime credential resolution (money paths unchanged)

`artifacts/api-server/src/integrations/square.ts` still resolves credentials
from env (`tenantSecret()`) **first**, exactly as before — this is the
Samurai path and it is untouched, byte-for-byte, including when it's called
(the function became `async` to allow the DB fallback below, but for any
tenant with env tokens set it never touches the database).

Only when the env lookup returns nothing does it fall back to
`resolveSquareCredsFromDb(slug)` in `lib/squareOauth.ts`, which:
1. Looks up the tenant by slug to get its `tenant_id`.
2. Finds the newest `square_oauth_connections` row for that `tenant_id`.
3. Decrypts `access_token_enc` and returns it alongside `location_id` /
   `merchant_id` / `environment`.

This only ever matches tenants that were (a) onboarded through the real
Square OAuth flow above and (b) published + activated by a human — draft
tenants are never resolved into a live checkout path.

## Wizard page access (unchanged)

The static wizard (`/onboarding`) is still gated behind
`requireOrderlyDashboardHostPage` (`lib/dashboardHost.ts`) — the same host
allowlist as `/dashboard` — so it never serves on a restaurant's own domain.
Only the **API** (`/api/onboarding/*`, including `/square/start` and
`/square/callback`) is not host-gated, so it can be curl'd directly from
anywhere for verification/testing.

## Dual-mount

Mounted at both `/api/onboarding` (samurairesto.com) and
`/api/dashboard/onboarding` (so Orderly's VPS nginx, which currently only
proxies `/api/dashboard/*`, can reach the wizard API too). The OAuth
**callback** itself should stay registered at
`/api/onboarding/square/callback` on samurairesto.com — that's the exact URL
you register in the Square Developer Dashboard; don't also register the
`/dashboard/onboarding` variant, one redirect URI is enough.

## curl smoke test

```bash
# 1. Start a session
curl -sX POST https://samurairesto.com/api/onboarding/start \
  -H 'Content-Type: application/json' \
  -d '{"restaurantName":"Golden Dragon Test"}' | tee /tmp/session.json
SESSION_ID=$(node -pe 'JSON.parse(require("fs").readFileSync("/tmp/session.json")).session.id')

# 2. Ask for the Square authorize URL (real, needs env configured)
curl -sX POST https://samurairesto.com/api/onboarding/$SESSION_ID/square/start
# => { "authorizeUrl": "https://connect.squareupsandbox.com/oauth2/authorize?...", "state": "...", "environment": "sandbox", "scopes": [...] }

# 3. Open authorizeUrl in a browser, approve on Square's page.
#    Square redirects to SQUARE_OAUTH_REDIRECT_URI?code=...&state=...
#    -> the callback exchanges the code, stores encrypted tokens, and either
#       302s to ONBOARDING_UI_BASE_URL/onboarding?session=...&square=connected
#       or shows an inline "Square connected" HTML page.

# 4. Confirm the session now shows connected (no tokens in the response)
curl -s "https://samurairesto.com/api/onboarding/status?session=$SESSION_ID"
# => session.square = { connected: true, merchantId: "...", locationId: "...", connectedAt: "..." }

# 5. (Optional) publish a draft tenant shell and confirm the connection got linked
#    Requires ONBOARDING_PUBLISH_ENABLED=1 on the server.
curl -sX POST https://samurairesto.com/api/onboarding/$SESSION_ID/publish
```

Missing-config checks (should return 503, not a crash):

```bash
# With SQUARE_OAUTH_APPLICATION_ID/SECRET unset:
curl -sX POST https://samurairesto.com/api/onboarding/$SESSION_ID/square/start
# => 503 {"error":"Square OAuth is not configured on this server. ..."}

# With ORDERLY_TOKEN_ENCRYPTION_KEY unset:
curl -sX POST https://samurairesto.com/api/onboarding/$SESSION_ID/square/start
# => 503 {"error":"Token encryption is not configured on this server. ..."}
```

## What this does NOT do

- Does not touch Kirin/Linton or any tenant besides the one being onboarded.
- Does not touch Stripe, C5, or any billing/anchor code.
- Does not change the Samurai (or any existing manual-env-token tenant)
  charge/refund/order-sync flow — those still resolve entirely from env, and
  never make a database round-trip to check for an OAuth connection.
- Does not auto-activate a tenant. `/publish` only ever creates a `draft`
  tenants row; a human must flip `status` to `active` through the existing
  tenant admin path before any real order can be charged through the
  OAuth-connected Square account.
- Does not commit any secret, token, or key to git. The only things this
  migration adds to the database are columns/tables that hold **ciphertext**
  and non-sensitive ids (`merchant_id`, `location_id`).
