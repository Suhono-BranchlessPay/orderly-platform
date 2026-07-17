# Blok E — Mobile iOS + elegant UX (pickup)

**Scope:** RN/Expo white-label app (`artifacts/orderly-mobile`). Same backend as web. No marketplace.

---

## E1 — iOS / channel

| Item | Status |
|------|--------|
| Same Expo codebase for iOS + Android | ✅ |
| `orders.channel` = `ios` / `android` via `Platform.OS` (UTM still wins) | ✅ `src/channel.ts` |
| Production build refuses staging API override | ✅ `app.config.ts` |
| EAS iOS profiles (`preview` / `production`) | ✅ `eas.json` |
| Apple Developer Orderly ($99/th) | 📋 Malik |
| Submit pilot Samurai (Play → App Store) | 📋 Malik after EAS |

```bash
cd artifacts/orderly-mobile
# Internal iOS (needs Apple team on EAS)
eas build --platform ios --profile preview
# Production (no EXPO_PUBLIC_API_BASE_URL)
eas build --platform ios --profile production
```

---

## E2 — UX (kode)

| Layar | Yang diubah |
|-------|-------------|
| Home | Skeleton loading, empty states, ≥44px touch |
| Cart | Upsell C4 + clear money rows + tip note |
| Checkout | Tip **% · $**, copy **“100% goes to the restaurant.”**, cart summary, schedule-ahead slots, promo slot (pending engine), upsell |
| Confirmation | Pickup timeline Received → Preparing → Ready, ETA heuristic, big order #, Maps + Call, verified badge (quiet), polls `/api/orders/:id` |

**Design tokens:** `src/theme/tokens.ts` — warna dari `tenants/*/config.json` (white-label).

**Hak cipta:** pola fungsional saja; identitas visual dari brand tenant Orderly — tidak meniru app kompetitor.

### Belum (fase berikutnya)

- Coupon engine yang benar-benar mengurangi total
- Slot schedule yang sync ke Square/kitchen (sekarang: note + `source_detail.requested_pickup_at`)
- Apple Developer + EAS iOS submit — Malik

### Push “Siap diambil” ✅ (slice lanjutan)

| Layer | Detail |
|-------|--------|
| Mobile | `expo-notifications` + `registerForPickupPush()` at checkout/confirmation |
| API | Token di `orders.source_detail.expo_push_token` + `POST /api/orders/:id/push-token` |
| Trigger | Owner `PATCH .../status` → `ready` → Expo Push Service |
| Kill switch | `ORDERLY_PUSH_ENABLED=0` |

Requires **native/EAS build** (not Expo Go on Android). Set `EAS_PROJECT_ID` for reliable tokens.

---

## Definisi selesai (kode)

- [x] Channel native benar
- [x] Checkout tip transparan + tip 100% resto
- [x] Status pickup + ETA + maps/call
- [x] Upsell C4 wire (skipable; kosong = kosong)
- [x] Skeleton / empty / touch targets
- [x] Push when status → ready (Expo Push; needs EAS build + permission)
- [ ] Store listing + TestFlight — Malik (repo prep: adaptive icon, Profile legal links, privacy/data-safety + screenshot shot-list docs — see Phase 4)

---

*Push notifications & Apple submit are ops/follow-up — not blockers for merging this UX slice.*
