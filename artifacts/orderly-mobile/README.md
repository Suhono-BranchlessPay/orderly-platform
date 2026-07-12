# Orderly Mobile — Samurai Martinsville (pilot Android)

White-label Opsi B. Satu codebase; app branded per lokasi.

**Prioritas aktif:** `docs/ORDERLY_SUMBER_KEBENARAN.md` §3 P1  
**Runbook Stage 1→2:** `docs/P1_STAGE1_STAGE2_RUNBOOK.md`

## Dua lokasi Samurai (jangan tertukar)

| App variant (`tenants/`) | Store name | Backend slug | Package |
|--------------------------|------------|--------------|---------|
| **samurai-martinsville** (pilot) | Samurai Martinsville | `samurai` → samurairesto.com | `com.orderly.samurai.martinsville` |
| **samurai-linton** (nanti) | Samurai Linton | `samurai-linton` (TBD) | `com.orderly.samurai.linton` |

## Stage 1 (sandbox) — Android Studio

```bash
cd artifacts/orderly-mobile
npm ci
npm run tenant:martinsville
# Edit .env — REQUIRED for Stage 1:
#   EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8080   # emulator → local API
# Local/staging API must use SQUARE_ENVIRONMENT=sandbox (never flip production).
npm run prebuild:android
npm run studio
```

## EAS profiles

| Profile | API target | Use |
|---------|------------|-----|
| `sandbox` | **Requires** `EXPO_PUBLIC_API_BASE_URL` (staging/LAN) | Stage 1 |
| `preview` / `development` | Optional override via env | Dev |
| `production` | **Forbids** override (uses config.json → samurairesto.com) | Stage 2 |

```bash
eas build -p android --profile sandbox     # after setting real staging URL
eas build -p android --profile production  # only after Stage 1 passes + EAS account
```

## Keamanan

- Tidak ada secret Square/BP di app — hanya public `applicationId` dari `/api/square/config`.
- Tidak ada `EXPO_PUBLIC_SQUARE_TEST_NONCE` / fake payment.
- Jangan ubah Square env di server produksi untuk testing.
