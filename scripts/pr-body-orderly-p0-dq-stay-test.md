## Summary
Closes Orderly open items **#1–#4** from the 19 Jul answers:

1. **Content Engine learning** — exclude Facebook campaign performance posted on/before `2026-07-18` (pre–PR #86 WebView checkout break), in addition to the existing Jul 16–18 attribution DQ window. Covers `fb-crabmeatbento-20260714`, `fb-beefbento`, `fb-steakbento-20260715`, etc.
2. **`stay=1` harden** — Continue gate is driven by IAB UA only. Shared `?stay=1` links no longer skip the handoff inside Facebook/IG/TikTok WebViews (Safari after handoff still skips naturally).
3. **Auto-flag test orders** — on create, `src` matching `test-*` / `*-test` / `*probe*` sets `source_detail.is_test=true` + `test_reason=auto_src_test_pattern`. SQL exclusion expanded to match.
4. **QR dashboard** — test/probe src rows hidden from `by_src` + `recent` by default (`hide_test_src=0` to show). Totals still include all scans; UI notes hidden count.

## Test plan
- [ ] Unit: `contentCalendar` pre-WebView FB filter; `opsTestSrc`; `shouldServeWebviewEscape` with Instagram UA + `stay=1`
- [ ] `curl -A "Instagram" "…/bio?src=ig-bio&stay=1"` → Continue HTML (not bio list)
- [ ] `curl -A "Safari" "…/bio?src=ig-bio&stay=1"` → bio list
- [ ] Create order with `source_detail.src=tiktok-test` → row has `is_test=true`
- [ ] Dashboard QR scans: test/probe srcs absent from By src; `hidden_test_src_rows` > 0 when present
