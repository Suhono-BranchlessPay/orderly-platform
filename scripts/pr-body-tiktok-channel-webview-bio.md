## Summary
- Expand WebView Continue escape beyond Meta to TikTok and Instagram in-app browsers (`TTWebView` / Instagram UA), so Square checkout is not blocked the same way as Facebook.
- Add `tiktok` to content calendar / social post platforms; generator uses shorter hooks (≤5 words) and tighter captions for vertical.
- Src conventions: permanent `tiktok-bio` / `ig-bio`; campaign `tiktok-{item}-{YYYYMMDD}`.
- New `/bio` (alias `/links`) link-in-bio page reuses `/s/{slug}?src=…` tracking + the same Continue gate.
- Documented: TikTok Content Posting API is publish-only (`disable_comment` at create); no organic comment read/reply → do not build a Meta-style TikTok social inbox.

## Deploy note
Until this PR is merged + `samurai-api` restarted, `/bio` falls through to the storefront SPA homepage (what you see today). After deploy, expect a dark item list (or Continue in TikTok UA) — not "Fresh Sushi / Order Pickup".

## Test plan
- [ ] `curl -sA "TikTok TTWebView" "https://samurairesto.com/bio?src=tiktok-bio"` → Continue HTML (not full bio list / not homepage)
- [ ] Same URL with Safari UA → bio page listing items → links contain `/s/…?src=tiktok-bio`
- [ ] From TikTok app on phone (after deploy): open `/bio?src=tiktok-bio` → Continue → Safari → `src=tiktok-bio` preserved
- [ ] Tap an item from bio → `/s/{slug}` records one scan for `tiktok-bio` (no double-count after Continue)
- [ ] Calendar generate can emit `platform: tiktok` with short hooks and `tiktok-…-YYYYMMDD` src
- [ ] Do **not** put bio link on TikTok profile until phone escape + src + scan count are verified

## Bio URLs (after merge + deploy)
- TikTok: `https://samurairesto.com/bio?src=tiktok-bio`
- Instagram: `https://samurairesto.com/bio?src=ig-bio`
