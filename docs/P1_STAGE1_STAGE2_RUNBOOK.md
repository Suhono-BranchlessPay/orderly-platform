# P1 Stage 1 → Stage 2 runbook

**Branch:** `feature/p1-mobile-transaction-evidence`  
**Do not push to `main`.** Do not change production Square env on `samurairesto.com`.

Full checklists: [`P1_MOBILE_TRANSACTION_EVIDENCE.md`](./P1_MOBILE_TRANSACTION_EVIDENCE.md) · SDK notes: [`P1_SQUARE_SDK_CHOICE.md`](./P1_SQUARE_SDK_CHOICE.md)

---

## STAGE 1 — Sandbox (no real money)

### Setup

1. Backend **local or staging** with `SQUARE_ENVIRONMENT=sandbox`  
   Template: [`artifacts/api-server/.env.sandbox.example`](../artifacts/api-server/.env.sandbox.example)
2. Mobile `.env` (gitignored):

```bash
EXPO_PUBLIC_TENANT_SLUG=samurai-martinsville
EXPO_PUBLIC_PAYMENT_PROVIDER=square
# Emulator → host machine API:
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8080
# Physical device on same LAN → use your PC LAN IP, e.g. http://192.168.1.10:8080
```

3. Native build (Expo Go will not work):

```bash
cd artifacts/orderly-mobile
npm ci
npm run tenant:martinsville
# ensure .env has EXPO_PUBLIC_API_BASE_URL as above
npm run prebuild:android
npm run studio
# Android Studio → Run on emulator/device
```

Or EAS: `eas build -p android --profile sandbox` after replacing `SET_ME_TO_STAGING_OR_LAN_API` in `eas.json` / passing `--env`.

### Pass criteria

- [ ] Menu loads (Samurai)
- [ ] Pickup only (no delivery CTA)
- [ ] Real Square **card sheet** (not fake nonce)
- [ ] Official Square **sandbox test card** succeeds
- [ ] Order in **Square Sandbox** Dashboard: Source **Orderly Order Hub**, Type **Pickup**
- [ ] Pay succeeds **before** order create (server logs)
- [ ] No `TEST_NONCE` / fake payment in code

**If Stage 1 fails:** fix in sandbox. Do not “try on production.”

---

## STAGE 2 — Production (real card) — only after Stage 1 passes

### Build guard

- Profile **`production`** must **not** set `EXPO_PUBLIC_API_BASE_URL` (uses `tenants/.../config.json` → `https://samurairesto.com`).
- `app.config.ts` **throws** if `EAS_BUILD_PROFILE=production` and override is set.
- Needs Expo/EAS Orderly account (Malik).

```bash
eas build -p android --profile production
```

### Malik test protocol

- Restaurant **open** (morning) — order hits real kitchen
- Cheapest item; tell Joni/staff before test
- Decide: consume or refund after

### Anchor (Samurai = pos-native)

App may **not** show `chain_tx_hash` — that is normal. Verify separately in BP Audit Shield:

- Find `reference_id` = Orderly order id
- `status: anchored` + real `chain_tx_hash` + Monad explorer URL

Do **not** conclude anchor failed only because the app UI omitted the hash.

### Optional bonus

Refund the test order → confirm BP refund anchor (negative amount).

---

## After P1 passes

1. Verry merges PR to `main`
2. Move mobile item from SUMBER KEBENARAN §3 → §2 with evidence
3. Next: P2 (Kirin/Linton data) → P3 (QR) → P4 (Stripe legal)
4. Do not submit to Play Store yet (one pilot only)
