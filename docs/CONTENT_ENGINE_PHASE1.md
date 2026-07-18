# Content Engine — Phase 1

Monthly content calendar driven by real Square + Orderly + inbox data. Human approve before anything ships. No Canva/Meta auto-publish in Phase 1.

## What shipped

- Tables: `content_calendar`, `content_calendar_config` (`scripts/migrate-content-calendar.sql`)
- AI Gateway task: `content_calendar`
- Auto `src_slug` + tracked `/s/{slug}?src=` on every draft
- Dashboard → Marketing → **Content calendar** (generate / approve / edit / skip / reschedule / mark posted)
- Daily report block: calendar performance with **14-day lookback**

## Deploy

```bash
psql "$DATABASE_URL" -f scripts/migrate-content-calendar.sql
# then rebuild/restart api-server (dashboard HTML is served from api-server/public)
```

## Ops flow (Samurai trial)

1. Ensure top sellers have menu photos (visual posts require `image_url`).
2. Dashboard → pick tenant → Content calendar → set month → **Generate month**.
3. Review each card → Approve → Copy caption + link → design in Canva → post manually → **Mark posted**.
4. Next day / Performance: human clicks + paid orders by `src` (multi-day).

## Config (per tenant)

`content_calendar_config`: `n_posts` (default 14 ≈ 3–4/week), `pillar_mix`, tone, language, cuisine, `local_events`.

## Out of scope (later phases)

Canva Autofill, auto-schedule via Meta Guard, SEO article + GBP triple-publish, month-over-month learning loop.
