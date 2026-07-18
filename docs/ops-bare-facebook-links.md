# Ops: tag bare Facebook links (Samurai)

Goal: every Facebook surface that sends traffic to the storefront must use a tracked URL (`?src=…`), not a naked `https://samurairesto.com` / `/order`.

## Checklist (Meta Page)

- [ ] **Page CTA button** (Order Online / Book Now) → tracked short or `/r/samurai?src=fb-page-cta-YYYYMMDD`
- [ ] **About → Website** → same tracked pattern (or `fb-about-YYYYMMDD`)
- [ ] **Pinned / recent organic posts** with a link → edit or comment with tracked URL; prefer `/s/{slug}?src=fb-{item}-YYYYMMDD&item=…` for menu posts
- [ ] **Ads / boosts** → landing URL must keep `src=` (Facebook may append `fbclid`; storefront now falls back if `src` is missing)

## Code paths (already tracked)

- New social **posts** from Orderly: `PROMPT_Social_Post_Draft` requires exact `{order_url}` with `?src=`
- Inbox **drafts**: `social-reply-YYYYMMDD`; bare storefront URLs are rewritten to the tracked link before save
- Storefront: `fbclid` without `src`/`utm` → `facebook_organic_fbclid`

## Suggested src tags

| Surface | Example `src` |
|--------|----------------|
| Page CTA | `fb-page-cta-20260718` |
| About website | `fb-about-20260718` |
| Organic menu post | `fb-hibachichicken-20260718` |
| Inbox reply | `social-reply-20260718` (auto) |
