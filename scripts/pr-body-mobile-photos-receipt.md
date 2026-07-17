## Summary
- **Photos (blocker):** Live Square name matching + family fallbacks (~73/100 items hit a real food photo); `chicken-bento` wired; branded `ImageFallback` (logo + item name + accent); skeleton uses primary wash instead of gray
- **Zero crypto UX:** Confirmation → **View receipt** opens in-app `ReceiptScreen` (items/total/#order). Removed explorer / “View record” / blockchain a11y copy from consumer UI
- **Modifier test path:** Dev fixture on Hibachi Chicken / California Roll / Chicken Bento (`EXPO_PUBLIC_MODIFIER_FIXTURE`); `scripts/test-modifiers-cart.mjs` covers parse → price → lineId → checkout note
- **Brief:** `docs/INSTRUKSI_Verry_Mobile_Phase4_Submission.md` — login = none (no SIWA/delete-account yet); photo source = Square URL → bundle map → fallback

## Test plan
- [ ] Home: rolls/hibachi/bento show food photos; sides show branded fallback (not gray)
- [ ] Confirmation → View receipt → readable struk; no explorer link
- [ ] Dev: Hibachi Chicken modifiers → live CTA price → cart note → checkout payload
- [ ] `node artifacts/orderly-mobile/scripts/test-modifiers-cart.mjs`
- [ ] Grep `src/` for blockchain/crypto/View record → none
