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

- Push “ready for pickup” (`expo-notifications` + device token store)
- Coupon engine yang benar-benar mengurangi total
- Slot schedule yang sync ke Square/kitchen (sekarang: note + `source_detail.requested_pickup_at`)

---

## Definisi selesai (kode)

- [x] Channel native benar
- [x] Checkout tip transparan + tip 100% resto
- [x] Status pickup + ETA + maps/call
- [x] Upsell C4 wire (skipable; kosong = kosong)
- [x] Skeleton / empty / touch targets
- [ ] Store listing + TestFlight — Malik

---

*Push notifications & Apple submit are ops/follow-up — not blockers for merging this UX slice.*
