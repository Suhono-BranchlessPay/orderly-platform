## SISA 3 — Mobile UX polish (elegant, white-label, no copying)

Quality pass on the RN/Expo customer app. Functional patterns only (industry-standard); all copy is Orderly's own. No competitor brand names, layouts, palettes, or copy.

### What changed
- **Brand fonts (white-label):** load `PlayfairDisplay` (headings) + `DMSans` (body) via `@expo-google-fonts` keyed to `tenant.theme.fontHeading/fontBody`. Unknown/absent tenant fonts fall back to the system font (`headingFont()`/`bodyFont()` return undefined until a family is actually loaded). App holds on the brand background until fonts resolve — no extra `expo-splash-screen` dependency.
- **Accessibility pass:** `accessibilityRole`/`accessibilityLabel`/`accessibilityState` on interactive elements across Home, Cart, Checkout, Confirmation, and Upsell (menu cards, add buttons, qty steppers, tip/pickup chips, remove, cart bar, modal, blockchain link). Item modal is now a proper modal (`accessibilityViewIsModal`, `onRequestClose`).
- **Skeleton loading:** payment-availability skeleton on Checkout while Square config loads; total skeleton on Confirmation until the order total is known.
- **Push tap → order:** tapping a "ready for pickup" push now navigates straight to that order's status screen (shared `navigationRef`; `Confirmation.total` made optional and fetched on mount so a push-tap open works without a total).
- **Invisible-blockchain fallback:** Confirmation badge shows a shortened, selectable record ID when no explorer URL is present (previously the record was hidden entirely).
- **Native schedule-ahead:** `@react-native-community/datetimepicker` adds a "Pick a time…" option alongside the preset pickup chips (kept as a request to the kitchen, unchanged behavior).

### Copyright guardrails
- Reused only functional patterns: transparent price breakdown, preset tip selector showing `% · $`, pickup status + ETA, cart summary, pre-pay upsell.
- Tip copy remains Orderly's: "100% goes to the restaurant."
- No money-path changes.

### Test plan
- [x] `tsc --noEmit` passes for the mobile app
- [ ] Bugbot review
- [ ] CI green
- [ ] Manual device smoke after merge: fonts render, VoiceOver/TalkBack reads controls, push tap opens order, date picker works
- [ ] Release APK build (after merge)
