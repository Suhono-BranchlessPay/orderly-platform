# P1 §A — Square SDK choice (verified against current docs)

**Date:** 12 Juli 2026  
**Decision:** Use **Square In-App Payments SDK** via official React Native plugin `react-native-square-in-app-payments`.

## Why this SDK (not the other ones)

| Product | Use case | Status for Orderly mobile customer checkout |
|---------|----------|-----------------------------------------------|
| **In-App Payments SDK** + RN plugin | Buyer types/taps card **in the app**; SDK returns a **nonce**; backend charges via Payments API / existing order path | **Correct** — matches web Web Payments flow |
| **Mobile Payments SDK** | In-person / Square Reader / Tap to Pay (merchant device) | **Wrong** — for POS hardware, not customer-facing online ordering |
| **Reader SDK** | Legacy reader | **Retired** (end of 2025) — do not use |
| Hardcoded `cnon:…` / `EXPO_PUBLIC_SQUARE_TEST_NONCE` | Fake success without SDK | **Forbidden** — same class of bug as `source_id=EXTERNAL` |

Sources (current Square docs):

- [In-App Payments SDK overview](https://developer.squareup.com/docs/in-app-payments-sdk/what-it-does)
- [React Native plugin](https://developer.squareup.com/docs/in-app-payments-sdk/react-native)
- [RN get-started](https://github.com/square/in-app-payments-react-native-plugin/blob/master/docs/get-started.md)
- Mobile Payments / Reader retirement notes on Square developer site

## Architecture (matches §4.2 / §4.4)

```
App (public Application ID only)
  → SQIPCardEntry.startCardEntryFlow
  → nonce (cardDetails.nonce)
  → POST /api/orders { squarePaymentSourceId: nonce, orderType: "pickup" }
  → Backend (secret access token) charges + creates Square order + kitchen + anchor
```

- App **never** holds Square access tokens / BP secrets.
- Sandbox vs Production is determined by **backend** credentials + the Application ID returned from `GET /api/square/config` (already used by web).
- Expo Go **cannot** run this native module → need **EAS development / preview / production builds** (Android Studio local `expo run:android` / prebuild also OK).

## Stages

1. **Sandbox:** real SDK UI + Square sandbox Application ID + Square test cards (not hardcoded nonce).
2. **Production:** same wiring; Samurai production Application ID from live backend; APK to Malik for real card.
