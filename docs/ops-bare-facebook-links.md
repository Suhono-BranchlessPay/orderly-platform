# Ops: tag bare Facebook links (Samurai)

Goal: every Facebook surface that sends traffic to the storefront must use a tracked URL (`?src=…`), not a naked `https://samurairesto.com` / `/order`.

## Checklist (Meta Page)

- [x] **Page CTA button** (Start order) → `https://samurairesto.com/r/samurai?src=fb-page-cta-20260718` (done 2026-07-18)
- [x] **About → Website / Links** → `https://samurairesto.com/r/samurai?src=fb-about-20260718` (label: Order Online; done 2026-07-18)
- [x] **Pinned / recent organic posts** with a link → captions already tracked (verified 2026-07-18):
  - Hibachi Chicken → `src=fb-hibachichicken-20260718&item=SKU017`
  - Shrimp Bento → `src=fb-shrimpbento-20260716&item=SKU015`
  - Crab Meat Bento → `src=fb-crabmeatbento-20260714`
  - Note: OG preview cards still *display* as `samurairesto.com`, but caption links include `?src=`
- [x] **Ads / boosts** → audited 2026-07-18: **no Samurai ads to fix**
  - Page Ad Center (All ads): empty — “Metrics… once you get started”
  - Meta Ad Library (`view_all_page_id=61588499377259`): “No ads match your search criteria”
  - Ads Manager opened from Ad Center (`act=836339601942971`, classic `page_id=1031895316670551`) shows other restaurants (Yuki Poke / Pho / etc.), not Samurai landing URLs
  - When creating the first boost/ad, use e.g. `https://samurairesto.com/r/samurai?src=fb-ad-YYYYMMDD` (Facebook may append `fbclid`)

## Code paths (already tracked)

- New social **posts** from Orderly: `PROMPT_Social_Post_Draft` requires exact `{order_url}` with `?src=`
- Inbox **drafts**: `social-reply-YYYYMMDD`; bare storefront URLs are rewritten to the tracked link before save
- Storefront: `fbclid` without `src`/`utm` → `facebook_organic_fbclid`

## Suggested src tags

| Surface | Example `src` |
|--------|----------------|
| Page CTA (evergreen) | `fb-page-cta` — **prefer this for new links** (no date) |
| Page CTA (Samurai live) | `fb-page-cta-20260718` — do **not** rename; splits history |
| About website | `fb-about` (new) / `fb-about-20260718` (live Samurai) |
| Organic menu post | `fb-hibachichicken-20260718` (dated campaign) |
| Inbox reply | `social-reply-20260718` (auto) |

Content Engine: Page CTA / About / bio are **non-content** surfaces. An order with `src=fb-page-cta*` must not be credited to a nearby campaign post (exact `src` match only).
