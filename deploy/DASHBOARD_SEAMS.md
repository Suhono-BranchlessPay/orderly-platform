# Dashboard seams + tip checkout

Additive schema for funnel/channel/kitchen time, plus tip at checkout (restaurant-owned).

## Migrate (prod)

```bash
psql "$DATABASE_URL" -f scripts/migrate-dashboard-seams.sql
```

Adds:
- `orders.channel`, `orders.source_detail`
- `orders.paid_at`, `accepted_at`, `in_progress_at`, `ready_at`, `completed_at`
- `analytics_events` table

Paid historical orders without channel → backfilled as `web` (website-first era; not inventing android/ios).

## Tip

Checkout (web + Android) offers 15% / 18% / 20% / custom / no tip.
Charged via Square `tip_money` (100% restaurant). Included in `orders.tip_cents`.

## Analytics

`POST /api/analytics/events` — `page_view` | `menu_view` | `add_to_cart` | `checkout_start` | `paid`

## Not in this PR

Gelombang 1 Live Orders cards, social Meta/GBP infra — next after seams collect data.
