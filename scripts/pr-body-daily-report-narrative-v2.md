## Summary
- Narrative daily report via AI Gateway task `daily_report` (Claude primary, fact-only fallback if AI unavailable)
- Richer Orderly slices: QR scans (human/bot), social posts progress, unanswered inbox highlight, GBP when present
- Level-1 supply reminder from Square product mix (usage from sales only — no inventory predictions)
- HTML reordered: warm narrative + one idea first; numbers detail below; anti double-count unchanged

## Out of scope (next)
- Per-tenant `owner_email` / `report_enabled` from DB (after format trial)
- Food vs drink (blocked on Square Uncategorized menu)
- Dine-in vs pickup Square channel cube (needs dimension probe)
- Supply Level-2 (needs real stock tracking)

## Test plan
- [x] `pnpm --filter @workspace/api-server test -- dailyReport`
- [ ] Deploy API to VPS, dry-run preview for Samurai
- [ ] Send trial email to Resend-allowed address; confirm narrative + supply + unanswered sections
- [ ] Confirm Square totals still not summed with Orderly channel $
- [ ] Bugbot + CI green
