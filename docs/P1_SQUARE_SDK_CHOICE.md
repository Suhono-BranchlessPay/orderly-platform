# P1 §A — Square SDK choice (verified against current docs)

**Date:** 12 Juli 2026 (maintenance re-check same day)  
**Decision:** Use **Square In-App Payments SDK** via official React Native plugin `react-native-square-in-app-payments@2.0.1`.

## Maintenance / deprecation check (re-verified)

| Question | Finding |
|----------|---------|
| Is **In-App Payments SDK** deprecated? | **No.** Still documented as the product for in-app card entry → nonce → backend Payments API. |
| What *was* retired? | **Reader SDK** (+ Mobile Authorization) → replaced by **Mobile Payments SDK** (in-person / readers / Tap to Pay). Different product. |
| RN plugin freshness | `2.0.1` (Jun 2026) bumps native IAP to **iOS 1.6.7 / Android 1.6.8**; Square changelog **2026-06-05** explicitly patches iOS IAP **to unblock the React Native plugin**. |
| Risk of building on a sunset SDK? | **Low for now.** Active docs + recent native + RN releases. Watch Square Mobile SDK changelogs; do **not** migrate to Mobile Payments SDK for customer online checkout. |

Sources:

- [In-App Payments SDK overview](https://developer.squareup.com/docs/in-app-payments-sdk/what-it-does) (still current product page)
- [React Native plugin](https://developer.squareup.com/docs/in-app-payments-sdk/react-native)
- [Mobile SDKs 2026-06-05 changelog](https://developer.squareup.com/docs/changelog/mobile-logs/2026-06-05) (IAP 1.6.7 for RN)
- [RN plugin PR #263](https://github.com/square/in-app-payments-react-native-plugin/pull/263) (`2.0.1`)
- Reader retirement notes (Mobile Payments SDK) — not applicable to this flow

**Verry:** treat IAP as the maintained path for Orderly mobile; revisit only if Square publishes an IAP deprecation notice (none found as of this check).

## Why this SDK (not the other ones)

| Product | Use case | Status for Orderly mobile customer checkout |
|---------|----------|-----------------------------------------------|
| **In-App Payments SDK** + RN plugin | Buyer types/taps card **in the app**; SDK returns a **nonce**; backend charges via Payments API / existing order path | **Correct** — matches web Web Payments flow |
| **Mobile Payments SDK** | In-person / Square Reader / Tap to Pay (merchant device) | **Wrong** — for POS hardware, not customer-facing online ordering |
| **Reader SDK** | Legacy reader | **Retired** — do not use |
| Hardcoded `cnon:…` / `EXPO_PUBLIC_SQUARE_TEST_NONCE` | Fake success without SDK | **Forbidden** — same class of bug as `source_id=EXTERNAL` |

## Architecture (matches §4.2 / §4.4)

```
App (public Application ID only)
  → SQIPCardEntry.startCardEntryFlow
  → nonce (cardDetails.nonce)
  → POST /api/orders { squarePaymentSourceId: nonce, orderType: "pickup" }
  → Backend (secret access token) charges + creates Square order + kitchen + anchor
```

- App **never** holds Square access tokens / BP secrets.
- Expo Go **cannot** run this native module → need **EAS / Android Studio** builds.

## Stages — DO NOT touch live production Square env

**`samurairesto.com` is LIVE.** Never flip `SQUARE_ENVIRONMENT` (or live Square secrets) on that server for Stage 1.

| Stage | Backend | Square | App `apiBaseUrl` |
|-------|---------|--------|------------------|
| **1 — SDK wiring** | Local API **or** separate staging host **or** sandbox-only tenant | Square **sandbox** Application ID + sandbox access token + official test cards | Override with `EXPO_PUBLIC_API_BASE_URL` (e.g. `http://10.0.2.2:8080` emulator → local) — **not** production unless production is already sandbox (it is not) |
| **2 — P1 evidence** | Production `https://samurairesto.com` unchanged | Production Square (already live) | Default Martinsville config |

Stage 1 checklist for Verry:

1. Run `artifacts/api-server` locally (or staging) with **sandbox** Square secrets for tenant `samurai` (or a dedicated sandbox tenant).
2. Mobile: `EXPO_PUBLIC_API_BASE_URL=<staging-or-local>` + Android Studio / EAS build.
3. Pay with [Square sandbox test cards](https://developer.squareup.com/docs/devtools/sandbox/payments) in the real In-App Payments UI.
4. Only after Stage 1 passes → Stage 2 against live (real card, production APK).
