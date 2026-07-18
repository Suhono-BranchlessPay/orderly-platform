## Summary
- Daily report language support: `en` | `id` | `es` via `language` on run/preview APIs
- UI chrome + attention/supply/insights localized; AI narrative follows `language_instruction`
- Subject tagged with `· ID` / `· ES` for trial comparison

## Test plan
- [x] `pnpm --filter @workspace/api-server test -- dailyReport`
- [ ] Deploy + send Indonesian trial email
- [ ] Send Spanish trial email
