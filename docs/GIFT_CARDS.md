# Gift Cards via Square (Part 3)

Square is the **issuer** (compliance / escheatment / liability). Orderly provides
sell + redeem UX and an audit ledger only — we never hold gift-card balances
ourselves.

## Status

| Piece | Status |
|-------|--------|
| Schema `gift_card_programs` / `gift_cards` / `transactions` | ✅ |
| Square Gift Cards API client | ✅ |
| Purchase (charge → Create DIGITAL → ACTIVATE) | ✅ gated |
| Balance by GAN + quote/redeem | ✅ gated |
| Dashboard program panel | ✅ |
| OAuth scopes `GIFTCARDS_READ` / `WRITE` | ✅ in authorize URL |
| Checkout / mobile buy+redeem UI | ❌ next slice |
| Owner.com card migration | 📋 master-only append API — **no CrustnRoll** |
| Non-Square POS | ❌ deferred |

## Legal HOLD

Do **not** set `ORDERLY_GIFT_CARDS_ENABLED=1` in production until:

1. Counsel reviews gift-card terms / unused-balance / escheatment posture
2. CPA confirms accounting (Square liability vs restaurant books)
3. Tenant program row is `enabled` + `status=active`

## Env

```js
ORDERLY_GIFT_CARDS_ENABLED: "0", // set "1" only after legal + program active
```

Sell/redeem runs only when **all** are true:

1. `ORDERLY_GIFT_CARDS_ENABLED=1`
2. `gift_card_programs.enabled=true` AND `status='active'`
3. Tenant `pos_type=square` with working Square credentials
4. (for storefront sell UI) `sell_online=true`

## Migrate (schema)

```bash
psql "$DATABASE_URL" -f scripts/migrate-gift-cards.sql
```

Deploy helper (VPS): `scripts/deploy-gift-cards-schema.sh` — adds env default `0`,
runs SQL, rebuilds, restarts PM2.

## Purchase flow

1. Buyer pays with card (`createSquarePaymentOnly` → Payments API)
2. `CreateGiftCard` type `DIGITAL`
3. `CreateGiftCardActivity` type `ACTIVATE` with paid amount + buyer instrument id
4. Local `gift_cards` + `gift_card_transactions` audit rows

## Redeem flow

Checkout calls `POST /api/gift-cards/redeem` → Square `REDEEM` activity.
Prefer Payments API gift-card source when wiring full checkout (auto REDEEM);
manual activity path is implemented for the first slice.

## API (storefront Host)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/gift-cards/program` | Public config |
| GET | `/api/gift-cards/balance?gan=` | Live Square balance; GAN masked |
| POST | `/api/gift-cards/quote-redeem` | `{ gan, amount_cents, order_total_cents? }` |
| POST | `/api/gift-cards/purchase` | `{ amount_cents, square_payment_source_id, … }` |
| POST | `/api/gift-cards/redeem` | `{ gan, amount_cents, order_id? }` |

## Dashboard (orderlyfoods.com)

| Method | Path |
|--------|------|
| GET/PUT | `/api/dashboard/gift-cards/program` |
| GET | `/api/dashboard/gift-cards/cards` |
| POST | `/api/dashboard/gift-cards/migrate` — master-only append |

`migrate` records an already-issued Square gift card id + audit reason. It does
**not** pull Owner.com. Do not migrate CrustnRoll until SEO + loyalty + gift
cards + 301 plan are ready.

## Re-authorize Square OAuth

Tenants connected via OAuth before `GIFTCARDS_*` scopes were added must
re-authorize so the stored token includes gift card permissions. Env-token
tenants (e.g. Samurai) need those scopes on the app / token in Square Dashboard.
