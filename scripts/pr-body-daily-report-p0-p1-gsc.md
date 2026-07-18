## Summary

- **P0 reputation:** praise count and praise quotes now share the same report-day window (no more “Praise 0” with quotes underneath).
- **P0 AI:** daily-report narrative retries AI twice; on failure logs + posts `ORDERLY_ALERT_WEBHOOK_URL` (`daily_report_ai_fail`) so silent multi-day template fallback is visible.
- **P1 narrative:** strong days open with celebration (sales + tips); online attribution copy clarifies Orderly-tracked vs Square dine-in; Square 7d window label on HTML; click→order gaps age-gated to last 3 local days.
- **Closed-loop:** metrics = any paid order with `src` + promoted-item subset; storefront attribution upgrades empty first-touch and maps `fb-` / `ig-` / `social-reply-`.
- **GSC SEO block:** Search Analytics API + per-tenant OAuth (`/api/gsc/oauth/*`), honest warming-up / not-connected notes, Map Pack deferred note (no empty columns). Never invents positions.
- **Social:** new `ordering_interest` intent with tracked `?src=social-reply-YYYYMMDD` short link; draft sanitize keeps emoji (NFC + strip U+FFFD/controls only).

### Brian Haggard order (2026-07-18)
Checked on VPS: order **did not** carry `src=fb-hibachichicken-20260718` (first-touch was empty homepage). Attribution fix addresses that path for future clicks. Report now shows both “any item via link” and “promoted item” when `src` is present.

### Ops after merge
1. Run `scripts/migrate-gsc-oauth.sql` on VPS.
2. Connect GSC: `/api/gsc/oauth/start?tenantSlug=samurai&siteUrl=https://samurairesto.com/` (needs `GOOGLE_OAUTH_*` + `ORDERLY_TOKEN_ENCRYPTION_KEY`; optional `GSC_OAUTH_REDIRECT_URI`).
3. Ensure `ORDERLY_ALERT_WEBHOOK_URL` is set for AI-fail alerts.
4. Deploy api-server + samurai-resto; smoke daily-report preview.

## Test plan
- [x] `pnpm --filter @workspace/api-server test -- --testPathPattern="dailyReport|socialClassify"`
- [ ] Preview daily report HTML: praise count matches quotes; GSC note when not connected; square window label present
- [ ] Strong-day fixture ($ high / tips ≥ $200) opens with celebration copy
- [ ] Click gap: post older than 3 local days does not appear
- [ ] Classify “Yay! Online ordering!!” → `ordering_interest` with `src=` in draft
- [ ] GSC OAuth start redirects; callback persists connection; report shows warming-up until data exists
- [ ] Confirm Brian-style empty first-touch upgrade on storefront (new visit with `?src=fb-…`)
