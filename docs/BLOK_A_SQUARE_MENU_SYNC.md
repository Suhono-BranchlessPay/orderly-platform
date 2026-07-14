# Blok A — Square → Orderly Menu Sync

## Known prod bug (fixed Jul 14 2026)

**Symptom:** Console `Last error: Failed query: insert into "menu_items"…`, last successful sync = never.

**Cause:** Unique index `menu_items_tenant_sku_idx` on `(tenant_id, sku)`. Legacy rows use `id = sku` (e.g. `SKU023`). Sync inserted `id = sqvar_…` with same SKU → unique violation → pull aborted.

**Fix:** Match by `square_variation_id` or `(tenant_id, sku)` and UPDATE in place; INSERT only when unmatched.

## Principle

**SQUARE is the source of truth for the menu. Orderly FOLLOWS.**

- Orderly pulls categories, items, prices, availability, and modifiers from
  Square's Catalog API and writes them into Orderly's own `menu_items` /
  `menu_categories` tables.
- Orderly **never** writes menu data back to Square in this PR (no
  create/update/delete catalog calls). The existing human-approved catalog
  push path (`integrations/squareCatalog.ts`, used by Bridge imports with
  `publish_to_square=true`) is untouched and out of scope here.
- Money/charge paths (`integrations/square.ts` order/payment/refund flows)
  are **not modified**. Credentials are resolved through the exact same
  env-first-then-OAuth-DB helper those flows already use
  (`getSquareCredsForTenantSlug`), so Samurai's `SQUARE_ACCESS_TOKEN` etc.
  are read-only inputs here, never duplicated, rotated, or overwritten.
- Nothing is ever deleted. Items that disappear from Square (archived,
  removed from this location, or sold out) are **soft-disabled**
  (`available = false`) so order history and reporting stay intact.

## What ships in this PR

| Area | What |
| --- | --- |
| Schema | `menu_items.square_catalog_object_id` / `square_variation_id` / `square_category_id` / `square_modifiers` / `updated_at`; `menu_categories.square_category_id`; new `menu_sync_state` table (one row per tenant, sync health only — no tokens). |
| Sync engine | `artifacts/api-server/src/lib/squareMenuSync.ts` — `syncSquareMenuForTenant({ tenantId, slug, reason })` paginates `GET /v2/catalog/list` (types `ITEM,CATEGORY,IMAGE,MODIFIER_LIST`) and upserts into Orderly's menu tables. |
| Triggers | (1) Square OAuth callback, if the connection is already linked to a tenant (reconnect case). (2) Onboarding `/publish`, right after linking the Square connection to the new tenant. (3) Manual: dashboard button, onboarding wizard endpoint, and the cron below. |
| Webhook | `POST /api/webhooks/square` — optional HMAC signature check, triggers a sync on `catalog.*` / `inventory.*` events. Idempotent. |
| Cron | Optional `setInterval` in `artifacts/api-server/src/index.ts`, gated by `MENU_SYNC_INTERVAL_MS` (default `0` = off). |
| Ops | `GET /api/dashboard/menu-sync?tenant_id=` (last status) and `POST /api/dashboard/menu-sync` (`{ tenant_id }`, sync now) + a "Square menu sync" panel in the console. |

## Env vars

All optional — the feature is inert until you set them.

| Var | Default | Purpose |
| --- | --- | --- |
| `MENU_SYNC_INTERVAL_MS` | `0` (off) | Enables the background cron. Recommended `900000` (15 min) if enabled. |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | unset | If set, `POST /api/webhooks/square` verifies Square's `x-square-hmacsha256-signature` header (HMAC-SHA256 of `notification_url + raw_body`, base64). If unset, the webhook still works (useful for sandbox) but is **unauthenticated** — do not leave unset in production. |
| `SQUARE_WEBHOOK_NOTIFICATION_URL` | reconstructed from `req.protocol`/`req.host`/`req.originalUrl` | Override when the reconstructed URL doesn't exactly match what's registered in the Square Developer Dashboard (e.g. behind a proxy that doesn't set `X-Forwarded-Proto`). |

No new Square app/OAuth env vars are introduced — credential resolution
reuses `SQUARE_ACCESS_TOKEN` / `SQUARE_LOCATION_ID` / `SQUARE_APPLICATION_ID`
(env, per-tenant via `TENANT_{SLUG}_*`) and the existing
`square_oauth_connections` OAuth fallback (see `docs/SELF_SERVE_ONBOARDING.md`).

## Deploy the migration

```bash
psql "$DATABASE_URL" -f scripts/migrate-block-a-square-menu-sync.sql
```

The migration is additive-only (`ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF
NOT EXISTS`) — safe to re-run, and safe to run against a live database with
zero downtime. It writes no secrets and does not touch `square_oauth_connections`
or any order/payment table.

## Configure the Square webhook (optional but recommended)

1. Square Developer Dashboard → your app → **Webhooks** → add a subscription
   for `catalog.version.updated` and `inventory.count.updated`, pointed at
   `https://<your-host>/api/webhooks/square`.
2. Copy the **Signature Key** shown there into `SQUARE_WEBHOOK_SIGNATURE_KEY`
   on the API server (never commit it — see Blok 0 rotation doc for the
   general secrets-handling checklist).
3. Leave `SQUARE_WEBHOOK_NOTIFICATION_URL` unset unless signature checks fail
   in your logs (`Square webhook: signature verification failed`) — in that
   case set it to the exact URL you registered in step 1.

## Verify checklist

1. **Migration applied** — `psql "$DATABASE_URL" -c "\d menu_sync_state"` shows
   the new table; `\d menu_items` shows the new `square_*` columns.
2. **Manual sync works** — as a logged-in dashboard user, pick a tenant with
   Square configured (env token or a published OAuth connection) and click
   **Sync menu now** in the "Square menu sync" panel. The status line should
   show a fresh "Last successful sync" timestamp and an item count.
   Equivalent via curl:
   ```bash
   curl -sS -X POST https://<dashboard-host>/api/dashboard/menu-sync \
     -H 'Content-Type: application/json' \
     --cookie "<dashboard session cookie>" \
     -d '{"tenant_id":"<tenant id>"}'
   ```
3. **Menu reflects Square** — `GET /api/menu/items` for that tenant shows the
   items/prices/categories currently in that Square location's catalog, with
   `square_variation_id` populated.
4. **Soft-disable works** — archive or delete an item's location availability
   in Square, sync again, and confirm the corresponding Orderly item flips to
   `available: false` (not deleted) and no longer appears on the storefront.
5. **Samurai env path untouched** — confirm `SQUARE_ACCESS_TOKEN` /
   `SQUARE_LOCATION_ID` for Samurai are unchanged in the process env, and that
   order/payment flows (`integrations/square.ts`) still work exactly as
   before (this PR does not modify that file's behavior, only exports one
   already-existing function under a public name).
6. **OAuth callback trigger** — for a tenant that already has a live tenant
   row, reconnect Square via `/api/onboarding/:id/square/start` +
   `/callback`; confirm a sync fires automatically (check
   `menu_sync_state.last_started_at` moves).
7. **Publish trigger** — run the onboarding `/publish` flow (needs
   `ONBOARDING_PUBLISH_ENABLED=1`) for a session that connected Square;
   confirm a sync fires right after the tenant is created.
8. **Webhook (if configured)** — trigger a test event from the Square
   Developer Dashboard's webhook subscription page; confirm
   `menu_sync_state.last_started_at` for the right tenant updates, and that
   an invalid/missing signature is rejected with `401` when
   `SQUARE_WEBHOOK_SIGNATURE_KEY` is set.
9. **Cron (if enabled)** — set `MENU_SYNC_INTERVAL_MS=60000` locally, restart,
   and watch logs for `"Square menu sync cron enabled"` followed by periodic
   sync activity across every tenant with resolvable Square creds.
10. **No money/charge regression** — place a normal test order end-to-end;
    confirm Square order creation, card charge, and kitchen-accept still work
    (this PR does not touch `sendOrderToSquare` / `syncSquareOrderFromOwnerStatus`
    / `refundSquarePayment` behavior).

## Known limitations (honest, not hidden)

- Availability/sold-out detection uses Square's own `location_overrides.sold_out`
  flag on each item variation (surfaced directly by the Catalog API) — it does
  **not** make a separate live Inventory API call. This covers most POS-tracked
  sold-out states but not every custom inventory workflow.
- Modifier extraction (`square_modifiers`) is best-effort: list/modifier name
  and price only, not every Square modifier option (min/max selections,
  overrides) — good enough for display, not a full modifier UI yet.
- The webhook's tenant resolution falls back to comparing `location_id` across
  every tenant's resolved creds when a Square `merchant_id` doesn't map to a
  linked OAuth connection (i.e. env-token tenants like Samurai). Fine at
  today's scale; would need an index/lookup table if the tenant count grows
  much larger.
