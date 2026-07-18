# Meta Conversion API (ads) — Orderly

**Status:** Skeleton on `feature/meta-capi-ads` — **OFF by default** (`META_CAPI_ENABLED≠1`).  
**Not** Blok 4.1 social inbox. **Not** C5 marketing SEND (still HOLD).

## What this solves

Advice that sales lift needs:

1. **Real-time server events** → `ViewContent` / `AddToCart` / `InitiateCheckout` / `Purchase` via async **outbox** (order/pay never waits on Meta).
2. **Advanced Matching** → phone/email **SHA-256** hashed (never plaintext). Default: only when `marketing_consent_email` or `marketing_consent_sms` is true (`META_CAPI_REQUIRE_MARKETING_CONSENT=1`).
3. **Multi-tenant audiences** → every event includes `custom_data.restaurant_id` (= `tenant_id`) plus `content_ids` so Resto A ads do not train on Resto B.

## Architecture (honest)

| Piece | Status |
|-------|--------|
| Server CAPI outbox + flush | ✅ This PR |
| Browser Meta Pixel (`fbq`) | ❌ Not yet — `event_id` already emitted so hybrid dedup can land later |
| Hybrid Pixel + CAPI | 📋 Next — same `event_id` on both sides |
| Social Graph send | Separate (Blok 4.1) |

**Today after enable:** **server-side CAPI** (not hybrid yet). Funnel events come from `/api/analytics/events`; `Purchase` from paid order create.

## Event map

| Orderly | Meta |
|---------|------|
| `menu_view` / `page_view` | `ViewContent` |
| `add_to_cart` | `AddToCart` |
| `checkout_start` | `InitiateCheckout` |
| Paid order (server) | `Purchase` (`event_id` = order UUID) |
| Analytics `paid` | **Skipped** (avoid double Purchase) |

## Env (never commit secrets)

```bash
META_CAPI_ENABLED=0          # keep 0 until paid ads + tenant consent framework
# Per-tenant ONLY (required). Global META_PIXEL_ID is NOT used — fail closed.
TENANT_SAMURAI_META_PIXEL_ID=…
TENANT_SAMURAI_META_CAPI_ACCESS_TOKEN=…   # Events Manager → Conversions API
TENANT_SAMURAI_META_CAPI_TEST_EVENT_CODE=TEST…   # optional Events Manager test
META_CAPI_REQUIRE_MARKETING_CONSENT=1
META_GRAPH_API_VERSION=v21.0
# META_GLOBAL_KILL_SWITCH=1 also blocks CAPI enqueue + flush
```

**Fail-closed:** a tenant without `TENANT_{ID}_META_PIXEL_ID` + `TENANT_{ID}_META_CAPI_ACCESS_TOKEN` sends nothing. Do not set shared platform Pixel env for CAPI — that would mix restaurants into one Meta account.

## Deploy

```bash
psql "$DATABASE_URL" -f scripts/migrate-meta-capi-outbox.sql
pnpm --filter @workspace/api-server build
# set env, then:
pm2 restart ecosystem.config.cjs --update-env
curl -sS https://samurairesto.com/api/meta-capi/health
```

## Smoke (test code)

1. Set `META_CAPI_ENABLED=1` + Pixel + token + `META_CAPI_TEST_EVENT_CODE`.
2. Browse menu / add to cart / checkout on storefront.
3. Place a sandbox/test paid order.
4. Events Manager → Test Events should show `ViewContent` / `AddToCart` / `InitiateCheckout` / `Purchase` with `restaurant_id`.
5. Turn `META_CAPI_ENABLED` back to `0` if not ready for production.

## Consent / legal

- Hashed PII for matching is **measurement**, not a marketing send — still coordinate with counsel before forcing `META_CAPI_REQUIRE_MARKETING_CONSENT=0`.
- C5 SMS/email SEND remains HOLD.

## Dedup (when Pixel is added)

Use the same `event_id`:

- Funnel: client UUID already sent as `event_id` / `meta.event_id`.
- Purchase: Orderly order UUID.

Without Pixel, there is nothing to dedupe yet — CAPI alone will not double-count against itself for Purchase (single server emit).
