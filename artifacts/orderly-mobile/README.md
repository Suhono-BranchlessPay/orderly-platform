# Orderly Mobile — Samurai Martinsville (pilot Android)

White-label Opsi B. Satu codebase; app branded per lokasi.

**Prioritas aktif:** see repo `docs/ORDERLY_SUMBER_KEBENARAN.md` §3 P1 and `docs/P1_MOBILE_TRANSACTION_EVIDENCE.md`.

## Dua lokasi Samurai (jangan tertukar)

| App variant (`tenants/`) | Store name | Backend slug | Package |
|--------------------------|------------|--------------|---------|
| **samurai-martinsville** (pilot) | Samurai Martinsville | `samurai` → samurairesto.com | `com.orderly.samurai.martinsville` |
| **samurai-linton** (nanti) | Samurai Linton | `samurai-linton` (TBD) | `com.orderly.samurai.linton` |

## Jalankan Android (Martinsville)

```bash
cd artifacts/orderly-mobile
npm ci
npm run tenant:martinsville
npx expo start --android
```

Butuh Android Studio emulator atau device USB. **Expo Go tidak cukup** (Square In-App Payments = native module).

## Build APK (EAS) — kirim ke Malik

```bash
npm i -g eas-cli
eas login   # akun Expo/EAS Orderly (Malik menyediakan akses)
npm run tenant:martinsville
eas build -p android --profile preview   # Stage 1: sandbox Application ID from live backend config
eas build -p android --profile production  # Stage 2: after sandbox proven + production Square on server
```

Atau lokal dengan Android Studio:

```bash
npm run tenant:martinsville
npx expo prebuild --platform android
# buka android/ di Android Studio → Run on emulator/device
```

**Kartu:** SDK In-App Payments sungguhan (bukan test nonce). Sandbox vs production mengikuti `GET /api/square/config` dari backend Samurai.

## Aset Martinsville

Logo + 12 foto menu dari `Samurai Project` / storefront public.

## Keamanan

- Tidak ada secret Square/BP/Stripe di app — hanya public `applicationId` dari `/api/square/config`.
- `.env` lokal di-gitignore. Pakai `.env.example` sebagai template.
- Tidak ada `EXPO_PUBLIC_SQUARE_TEST_NONCE` / fake payment.
