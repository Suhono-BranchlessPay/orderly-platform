# P1 — Mobile transaction evidence checklist

**Source of truth:** [`ORDERLY_SUMBER_KEBENARAN.md`](./ORDERLY_SUMBER_KEBENARAN.md) §3 P1  
**Pilot app:** Samurai Martinsville (`com.orderly.samurai.martinsville`)  
**Backend:** `https://samurairesto.com` (same API as web) · tenant slug `samurai` · `anchor_mode=pos-native`

## Goal

Prove on a **physical phone** (not “looks fine in Expo Go”):

menu → cart → checkout **PICKUP** → pay **CARD** → Square order (Source `"Orderly Order Hub"`, type `"Pickup"`) → kitchen fire → BP anchor.

## Evidence required (Malik)

| # | Evidence | Status |
|---|----------|--------|
| 1 | APK installed on Malik’s phone | ☐ |
| 2 | Samurai branding correct (name/logo/colors); **no delivery** UI | ☐ |
| 3 | Paid pickup order visible in Square Dashboard | ☐ |
| 4 | Square Source = Orderly Order Hub, Type = Pickup | ☐ |
| 5 | Kitchen ticket / auto-fire observed | ☐ |
| 6 | Anchor proof (`chain_tx_hash` / explorer) for Samurai pos-native path | ☐ |
| 7 | Spot-check: no secrets in app bundle (decompile / string scan) | ☐ |

## Build & send APK (Verry / agent)

```bash
cd artifacts/orderly-mobile
npm ci
npm run tenant:martinsville
npx eas-cli login   # Orderly Expo account
npx eas-cli build -p android --profile preview
```

Send the EAS download link / APK to Malik. **Do not** commit APKs or signing keys to git.

### Important — real SDK only

Fake `EXPO_PUBLIC_SQUARE_TEST_NONCE` / hardcoded `cnon:…` are **removed**.

- Stage 1: Square **sandbox** Application ID from backend + official Square test cards in the In-App Payments UI.
- Stage 2: Square **production** Application ID from backend + real card on Malik’s phone.

See [`P1_SQUARE_SDK_CHOICE.md`](./P1_SQUARE_SDK_CHOICE.md).

## Agent / PR notes

- App must call public `/api/square/config` only — never embed Square/BP secrets.
- Checkout forces `orderType: "pickup"` and **pay (SDK nonce) → then create order**.
- Samurai = `pos-native` → do not double-anchor from the app.
- Do **not** push to `main`. Feature branch + PR only.
