# P1 — Mobile transaction evidence checklist

**Source of truth:** [`ORDERLY_SUMBER_KEBENARAN.md`](./ORDERLY_SUMBER_KEBENARAN.md) §3 P1  
**Pilot app:** Samurai Martinsville (`com.orderly.samurai.martinsville`)  
**SDK choice / maintenance:** [`P1_SQUARE_SDK_CHOICE.md`](./P1_SQUARE_SDK_CHOICE.md)

## Safety — production is LIVE

**Do not change `SQUARE_ENVIRONMENT` (or Square secrets) on `samurairesto.com`.** That host receives real orders.

| Stage | Target | Rule |
|-------|--------|------|
| Stage 1 (SDK + sandbox test cards) | Local API / separate staging / sandbox-only tenant | Sandbox Square credentials **only** on that backend |
| Stage 2 (real card evidence) | `https://samurairesto.com` as today | Production Square already live — **no env flip**; APK + real card |

Mobile override for Stage 1:

```bash
# .env (gitignored) — emulator example talking to host machine API
EXPO_PUBLIC_TENANT_SLUG=samurai-martinsville
EXPO_PUBLIC_PAYMENT_PROVIDER=square
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8080
```

Default config still points at `https://samurairesto.com` for Stage 2 / normal builds.

## Goal (Stage 2 / P1 DoD)

Prove on a **physical phone**:

menu → cart → checkout **PICKUP** → pay **CARD** → Square order (Source `"Orderly Order Hub"`, type `"Pickup"`) → kitchen fire → BP anchor.

## Evidence required (Malik) — Stage 2

| # | Evidence | Status |
|---|----------|--------|
| 1 | APK installed on Malik’s phone | ☐ |
| 2 | Samurai branding correct (name/logo/colors); **no delivery** UI | ☐ |
| 3 | Paid pickup order visible in Square Dashboard | ☐ |
| 4 | Square Source = Orderly Order Hub, Type = Pickup | ☐ |
| 5 | Kitchen ticket / auto-fire observed | ☐ |
| 6 | Anchor proof (`chain_tx_hash` / explorer) for Samurai pos-native path | ☐ |
| 7 | Spot-check: no secrets in app bundle (decompile / string scan) | ☐ |

## Stage 1 evidence (SDK wiring — before real money)

| # | Evidence | Status |
|---|----------|--------|
| A | Backend = local/staging with **sandbox** Square (not production env flip) | ☐ |
| B | Real In-App Payments UI (not fake nonce) + Square sandbox test card succeeds | ☐ |
| C | Order appears in Square **Sandbox** Dashboard | ☐ |

## Build & send APK (Verry / agent)

```bash
cd artifacts/orderly-mobile
npm ci
npm run tenant:martinsville
# Stage 1: set EXPO_PUBLIC_API_BASE_URL to staging/local first
npx eas-cli login   # Orderly Expo account (Malik provides access)
npx eas-cli build -p android --profile preview
```

Or Android Studio: `npm run prebuild:android` → `npm run studio` → Run.

Send the EAS download link / APK to Malik. **Do not** commit APKs or signing keys to git.

### Important — real SDK only

Fake `EXPO_PUBLIC_SQUARE_TEST_NONCE` / hardcoded `cnon:…` are **removed**.

See [`P1_SQUARE_SDK_CHOICE.md`](./P1_SQUARE_SDK_CHOICE.md) for maintenance status (IAP **not** deprecated; Reader SDK was).

**Full Stage 1 → 2 procedure:** [`P1_STAGE1_STAGE2_RUNBOOK.md`](./P1_STAGE1_STAGE2_RUNBOOK.md)

### Anchor note (Stage 2)

Samurai = **pos-native** → anchor via Square↔BP. App may omit `chain_tx_hash`; verify in BP dashboard separately.

## Agent / PR notes

- App must call public `/api/square/config` only — never embed Square/BP secrets.
- Checkout forces `orderType: "pickup"` and **pay (SDK nonce) → then create order**.
- Samurai = `pos-native` → do not double-anchor from the app.
- Do **not** push to `main`. Feature branch + PR only.
- Do **not** modify production Square environment variables for testing.
- `eas` profile `production` refuses builds if `EXPO_PUBLIC_API_BASE_URL` is set.