## Summary
- **Android adaptive icons** with safe-zone inset for Martinsville / Linton / Kirin (`adaptive-icon.png` + `app.config.ts`)
- **In-app legal links** on Profile → Privacy / Terms / Data deletion (tenant domain)
- **WCAG AA:** `tokens.color.link` for small text (Samurai primary failed AA); Kirin accent darkened to `#7A5A12`; `scripts/check-contrast.mjs`
- **D5/D6 locked in tokens comments** (Playfair+DMSans; Samurai dark / Kirin light)
- **Store docs:** Privacy Nutrition + Play Data safety answers; screenshot shot-list; listing copy
- **Explore polish:** real Copy Code via `expo-clipboard` + Copied! feedback; hide empty deal/partner segments

## Test plan
- [ ] `python scripts/make-adaptive-icon.py` (idempotent) · adaptive assets present
- [ ] `node scripts/check-contrast.mjs` exits 0
- [ ] Profile → Privacy / Terms / Data deletion open samurairesto.com pages
- [ ] Cart Remove / View receipt / Maps links use link (accent) color
- [ ] Explore → Copy Code → button shows Copied!; countdown still works
- [ ] No login / SIWA / delete-account UI (still guest-only)
