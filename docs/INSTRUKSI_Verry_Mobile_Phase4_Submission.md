# INSTRUKSI Verry — Mobile Phase 4: Submission Readiness (+ blocker sebelumnya)

**Status:** aktif · **Pilot:** Samurai Martinsville (`com.orderly.samurai.martinsville`)  
**Depends on:** Phase 1–3 Visual Food Feed (merged / in flight) + branch foto/receipt/modifiers-test

---

## Keputusan yang tidak boleh ditebak

### (a) Login di app?
**TIDAK ada sistem login / akun pengguna.**  
Checkout = guest (nama / HP / email disimpan lokal di device). Tidak ada OAuth, Sign in with Apple, atau session server.

**Implikasi store:**
- **Account deletion in-app** → **TIDAK wajib** untuk submit saat ini (tidak ada account).
- **Sign in with Apple** → **TIDAK wajib** (tidak ada login pihak ketiga).
- Kalau nanti ditambah login: keduanya jadi blocker sebelum resubmit.

### (b) Sumber foto menu?
**Hybrid, prioritas:**
1. **Square / API `imageUrl`** (kalau merch sudah upload di Square / dashboard upload) — mobile pakai remote dulu.
2. **Bundled tenant assets** + `menuImageMap` + family matching di `resolveMenuImage` (Martinsville punya 12 foto lokal).
3. **ImageFallback ber-brand** (logo + nama item + primary wash) — jangan kotak abu.

**Siapa upload?** Tenant (restoran) lewat Square atau Orderly dashboard upload. Mobile **tidak** punya pipeline upload. Orderly bisa bantu shoot / map nama Square → file, tapi sumber kebenaran foto = Square/API + bundle tenant.

---

## Prioritas eksekusi (urut)

### P0 — Foto makanan + ImageFallback (BLOCKER store)
- Feed harus terlihat seperti restoran sungguhan di screenshot Review.
- Nama Square live harus match (bukan nama lama `* Bento Box`).
- Loading skeleton jangan abu netral — pakai warna brand.
- Sides/sauces/drinks tanpa foto → fallback brand OK; rolls/hibachi/bento harus terisi foto/family.

**Done when:** Home screenshot pertama tidak didominasi kotak abu; ≥70% item “makanan utama” punya foto nyata atau family photo.

### P1 — Order status bahasa manusia + nol crypto
- UI: **View receipt →** struk in-app (items, total, #order, alamat).
- **Dilarang** di string / a11y / screenshot / store listing: crypto, blockchain, explorer, “View record”, hash tx.
- Anchor BP tetap di backend; invisible di konsumen.

**Done when:** grep mobile UI = 0 hit `blockchain|crypto|View record`; Confirmation hanya “View receipt”.

### P2 — Uji modifier dengan data nyata / fixture
- Live Samurai: `squareModifiers = []` untuk semua item.
- Dev fixture (`EXPO_PUBLIC_MODIFIER_FIXTURE` / `__DEV__`) pada Hibachi Chicken / California Roll / Chicken Bento.
- Script: `node artifacts/orderly-mobile/scripts/test-modifiers-cart.mjs`
- Manual: pilih protein+sauce → harga CTA naik → cart `lineId` terpisah → checkout `specialInstructions` memuat mod.

**Done when:** script hijau + 1 jalur manual cart/checkout terdokumentasi.

### P3 — Phase 4 Submission Readiness (gerbang store)
Checklist submit (tanpa login → skip SIWA / delete account):

| Item | Owner | Notes |
|------|--------|--------|
| App icon + Android adaptive | Verry | Brand Samurai, bukan placeholder Expo |
| Screenshot set iPhone + Phone | Verry / Malik | Visual feed + Explore + receipt (bukan gray) |
| Privacy Nutrition Label (Apple) | Malik + Verry | Data: order contact, payment via Square SDK, push optional |
| Data safety (Google) | sama | Selaras Apple |
| WCAG AA contrast lintas tenant | Verry | Samurai dark + primary red; cek Kirin light |
| Store listing copy | Malik | Nol crypto; pickup-first; no fake ratings |
| EAS production build | Verry | iOS + Android pilot |

### P4 — Sisa polish brief
- Badge atribut/alergen di sheet **hanya** jika ada field data per item (jangan invent).
- Explore: Copy-Code + countdown + segment sudah ada Phase 2/3 — verifikasi dengan config Samurai.
- Konfirmasi Hero / story bubbles / skeleton branded.

### P5 — Kunci token D5 & D6 (sebelum submit)
- **D5 Fonts:** heading = Playfair (serif) · body = DM Sans — sudah di token; jangan ganti per screen.
- **D6 Theme:** Samurai **dark locked** untuk pilot (`#0F0F0F`); Kirin boleh light. Jangan flip Samurai ke light tanpa keputusan Malik.

---

## File kunci

| Area | Path |
|------|------|
| Image resolve | `artifacts/orderly-mobile/src/theme/images.ts` |
| Fallback | `…/components/ImageFallback.tsx` |
| Map foto | `tenants/samurai-martinsville/config.json` → `menuImageMap` |
| Receipt | `…/screens/ReceiptScreen.tsx`, `ConfirmationScreen.tsx` |
| Modifier fixture | `…/lib/modifierFixture.ts` |
| Modifier test | `…/scripts/test-modifiers-cart.mjs` |

---

## Test plan singkat (Verry)

1. `npm run tenant:martinsville` → Home: hero + cards ber-foto; item side → fallback brand (bukan abu).
2. Order test → Confirmation → **View receipt** → struk items/total; tidak ada link explorer.
3. Dev build: buka Hibachi Chicken → checklist Protein/Sauce → Add to Cart harga benar → Checkout note berisi mod.
4. `node scripts/test-modifiers-cart.mjs` dari folder `orderly-mobile`.
5. Grep: `blockchain|crypto|View record` di `src/` = kosong (kecuali field API internal yang tidak di-render).
