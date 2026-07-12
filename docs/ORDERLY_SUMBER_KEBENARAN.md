# ORDERLY — SUMBER KEBENARAN (Status, Prioritas, Aturan Arsitektur)

**Versi:** 12 Juli 2026  
**Untuk:** Verry + agent automation  
**Sifat:** Dokumen ini **MENGGANTIKAN** instruksi-instruksi lama. Kalau ada konflik, dokumen ini menang.  
**Lokasi:** `docs/` di repo `orderly-platform`

---

## 0. ATURAN UNTUK AGENT AUTOMATION (baca dulu — wajib)

- ❌ **JANGAN PERNAH** push ke `main`. Hanya branch + Pull Request. Verry yang review & merge.
- ❌ **JANGAN** commit secret (API key, token, kredensial). Semua di secrets/env.
- ❌ **JANGAN** ubah jalur uang (pembayaran, refund, anchor, Square) tanpa review manusia.
- ✅ **Trigger:** webhook / manual (dipicu Malik). Trigger PR = review/komentar saja, bukan menulis & push.
- ✅ Kalau ragu → buka PR dengan pertanyaan, jangan ambil keputusan sendiri.
- ✅ Kerjakan **HANYA** yang ada di §3 (Prioritas Aktif). Jangan kerjakan yang di §2 (sudah selesai).

---

## 1. APA ITU ORDERLY (konteks singkat)

Platform multi-tenant (ala Shopify) untuk restoran: website + mobile app ordering, POS-agnostic,
dengan BP Audit Shield (anchoring transaksi ke blockchain Monad = bukti tak terbantahkan).

Satu codebase, banyak restoran. Tambah restoran = tambah config, **BUKAN** tulis/salin kode.

- **Repo:** github.com/Suhono-BranchlessPay/orderly-platform
- **Server:** VPS Hostinger, PM2 `samurai-api`, PostgreSQL, nginx per domain
- **Tenant aktif:** `samurai` (Martinsville), `kirin` (Henderson KY), `samurai-linton` (Linton IN)

---

## 2. SUDAH SELESAI — JANGAN DIKERJAKAN ULANG

| Item | Bukti |
|------|--------|
| Multi-tenant refactor | 3 tenant jalan dari satu codebase; Linton dibuat hanya dengan config (tanpa kode baru) |
| Isolasi data per tenant | order/customer/menu terpisah (row-level) |
| Meta/SEO per host (server-side) | curl membuktikan title & canonical benar per domain |
| Storefront variants | Hero/section berbeda per tenant (Samurai full-image, Kirin split, Linton minimal-center) |
| Anchor BP — mode pos-native | Samurai via Square; terbukti on-chain (`chain_tx_hash` nyata) |
| Anchor BP — mode platform | `ORDERLY_BP_API_KEY` (satu key + `tenant_id`); sudah dites, bukti on-chain |
| Audit aliran uang | Semua charge lewat Square; ongkir DoorDash ditagih terpisah (titik yang menunggu Stripe) |
| Delivery OFF | `order_types=["pickup"]` semua tenant; kode DoorDash TIDAK dihapus (push `1d82e52`) |
| Mobile app Android (build) | `com.orderly.samurai.martinsville` build sukses |
| **P1 Mobile transaction evidence** | **SELESAI 12 Jul 2026:** Stage 1 sandbox + Stage 2 live card → Square Order Hub → kitchen → on-chain (`0x356a195e…`, Monad testnet status 1) |

---

## 3. PRIORITAS AKTIF (kerjakan ini)

### P1 — Mobile App transaction evidence — ✅ SELESAI (pindah ke §2)

### P-ENGINE — Backend / Dashboard / Report / AI infra (aktif saat Kirin/Linton hold)

Branch: `feature/engine-phase-c1-menu-from-photo`. Specs: `docs/Spec_OrderlyFoods_API_Bridge.md`, `docs/Spec_OrderlyFoods_MenuFromPhoto.md`.

1. **A** money cents + customers/consent + API Bridge — done (merged PR #1)  
2. **B** dashboard + report v1 (data Samurai nyata saja — no fake metrics) — done (merged PR #2 via #1)  
3. **C1** Menu-from-photo (prioritas AI) — in progress → C2 review → C3 intel → C4 upsell  
4. C5 marketing **TAHAN** (consent + lawyer); C6 SEO; C7 ajukan Meta API  

Kirin & Linton: **HOLD** (Health Dept) — bukan blocker teknis.

### P2 — Kirin & Samurai Linton: menunggu data / izin klien (HOLD)

Sistem sudah siap; yang kurang data & kredensial + izin Health Department:

- **Kirin:** menu (via Square Kirin), foto, kredensial Square Kirin, jam buka.
- **Linton:** kredensial Square Linton, foto, alamat/jam/telepon, nama pas.

**Aturan:** menu tiap tenant HARUS dari Square catalog tenant itu sendiri.  
**JANGAN** salin menu/kredensial/foto Samurai Martinsville ke Kirin/Linton.  
Sampai lengkap: tampilkan placeholder yang RAPI (jangan ruang kosong menganga).

### P3 — QR Dinamis (untuk kemasan & flyer)

- Endpoint `GET /r/:tenantSlug` → redirect ke halaman order tenant (tujuan dari config, bisa diubah tanpa cetak ulang QR).
- Catat tiap scan (tenant, timestamp) untuk analitik.
- Generate gambar QR (SVG/PNG hi-res) per tenant. Mulai dari `samurai`.

### P4 — Stripe Connect (MENUNGGU LEGAL — jangan aktifkan)

Entitas legal Orderly belum selesai (Stripe Atlas, ~2–3 minggu) + butuh CPA & pengacara fintech.

Boleh siapkan kerangka test-mode (Express accounts, `stripe_account_id` per tenant,
direct charges + `application_fee_amount`), **TAPI JANGAN** proses pembayaran live.

Delivery diaktifkan kembali **HANYA** setelah Stripe live.

---

## 4. ATURAN ARSITEKTUR (jangan dilanggar)

### 4.1 Multi-tenant

- Tambah restoran = tambah config (theme, varian, menu, kredensial). Bukan salin kode.
- Isolasi data row-level: tenant A tidak boleh pernah membaca data tenant B.
- Tenant dideteksi dari domain (`Host`) di server.

### 4.2 Urutan uang (WAJIB — jangan dibalik)

```
bayar CARD sukses → buat order → (delivery: DoorDash) → anchor BP
```

- **JANGAN PERNAH** buat order / fire kitchen / anchor sebelum pembayaran sukses.
- Kartu sungguhan (Square Web Payments SDK). Jangan `source_id = "EXTERNAL"`.
- Square: Source = `"Orderly Order Hub"`; type = `"Pickup"`/`"Delivery"` (**BUKAN** `"In store"`).

### 4.3 Anchor BP Audit Shield (per tenant)

| Tenant | `anchor_mode` | Cara |
|--------|---------------|------|
| `samurai` (Martinsville) | `pos-native` | Square yang anchor (sudah konek BP). Website **TIDAK** anchor ulang. |
| `kirin`, `samurai-linton`, tenant baru | `platform` | Website anchor via `ORDERLY_BP_API_KEY` (satu key + `tenant_id`). |

- ❌ Cegah double-anchor. Satu transaksi = satu anchor.
- Anchor hanya untuk transaksi **SUKSES & TERBAYAR**. Jangan anchor order gagal.
- Refund → anchor sebagai REFUND (nilai negatif).

### 4.4 Keamanan

- Kredensial (Square/DoorDash/BP/Stripe) hanya di secrets/env. Tidak di kode, frontend, app, atau Git.
- Repo private; branch protection di `main`; secret scanning aktif.
- Mobile app tidak boleh memegang kredensial apa pun.

### 4.5 Pencatatan uang (fondasi laporan)

Tiap order mencatat komponen **TERPISAH** (integer cents):

`subtotal`, `tax`, `tip`, `platform_fee`, `delivery_fee`, `processing_fee`, `total`.

- Tip 100% milik restoran — bukan bagian fee Orderly.
- Ongkir dibayar customer — bukan biaya restoran/Orderly.

### 4.6 AI (AI-ROS) — jangan tulis ulang engine

AI-ROS (Python/FastAPI) = service **TERPISAH**. Bicara ke Orderly hanya lewat API Bridge.

- ❌ **JANGAN** tulis ulang engine order/payment/POS ke Python.
- ❌ **JANGAN** beri AI akses langsung ke database Orderly.
- API Bridge (nanti, setelah P1–P3): Menu API, Customer API, Order webhook, Coupon API.
- Webhook order wajib membawa bukti anchor (`chain_tx_hash`) — ini pembeda Orderly.
- Marketing SMS/Email wajib consent (TCPA/CAN-SPAM).

---

## 5. BELUM WAKTUNYA (jangan dikerjakan sekarang)

- Laporan/dashboard ala Owner (Payouts, Fees, Tips) → setelah Stripe live.
- Marketing automation → butuh consent + pengacara.
- Loyalty, gift card, social media AI, predictive AI → fase berikutnya.
- Kafka, multi-agent orchestrator, knowledge graph → tunda (Redis cukup).
- Submit banyak mobile app ke store → 1 app pilot dulu (Samurai), buktikan lolos review.

---

## 6. KALAU RAGU

- Jangan tebak pada hal yang menyentuh uang → tanya Malik/Verry.
- Jangan anggap "sudah jalan" tanpa bukti (transaksi test, curl, log, on-chain).
- Buka PR, jelaskan, tunggu review. **Jangan** push ke `main`.
