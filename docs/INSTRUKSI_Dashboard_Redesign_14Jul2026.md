# INSTRUKSI ORDERLY — DASHBOARD REDESIGN + PEKERJAAN SELAGI MENUNGGU (14 Jul malam)

Konteks: Restoran tutup malam ini → tes order tunggu besok. Isi waktu dengan pekerjaan
yang TIDAK butuh order baru. Meta verification & Apple membership = tunggu pihak ketiga.

**ATURAN TETAP:** branch + PR (jangan push main) · secrets tidak di kode/git · jangan ubah
jalur uang tanpa review · JANGAN mengarang metrik.

---

## BLOK 1 — DASHBOARD REDESIGN (permintaan Malik — prioritas)

Masalah: dashboard terlalu panjang, scroll tak berujung. Semua panel tumpuk vertikal.

### 1.1 TAB NAVIGATION

Ganti scroll panjang → tab di atas. Usulan pengelompokan:

| Tab | Isi |
|-----|-----|
| **Overview** | KPI cards + Live Orders ringkas (10 teratas) |
| **Orders** | Live orders board + tabel order (pagination) |
| **Anchor** | Anchor verification + explorer + health + Sync from BP |
| **Menu & Sync** | Square menu sync + Top items · By category |
| **Customers** | Customer intelligence + tabel (pagination) |
| **Marketing** | QR scans · Social posts · Social inbox · Google reviews |
| **Growth** | Loyalty · Gift cards · Support assistant + KB |
| **Reports** | By hour/day · Payments & tips · Export CSV · Coming soon |

Prinsip: yang sering dilihat di depan, yang jarang di tab terpisah.

### 1.2 PAGINATION / LIMIT

Semua tabel panjang (orders, customers, anchor, QR scans) WAJIB:

- Dropdown "Show: 10 / 20 / 50 / 100" (default 10)
- Pagination (Prev / Next / halaman) ATAU "Load more"
- Jangan render semua baris sekaligus
- Simpan preferensi user (mis. pilih 20 → tetap 20)

### 1.3 RESPONSIVE

- Tab bisa di-scroll horizontal di mobile
- KPI cards: grid rapi di desktop, stack di mobile
- Tabel: horizontal scroll di mobile

### 1.4 STATE PERSISTENCE

- Tab aktif tersimpan (refresh tidak kembali ke tab awal)
- Range & tenant picker tetap di atas (global, di semua tab)

### Verifikasi

- Tidak ada scroll vertikal ekstrem — tiap tab muat dalam 1–2 layar
- Tabel default 10 baris + bisa diubah
- Tab tersimpan saat refresh
- Rapi di mobile & desktop

---

## BLOK 2 — FIX "ANCHOR HEALTH: Unavailable"

Dashboard menampilkan "Anchor health: Unavailable". Kartu MOAT — tidak boleh kosong.

- Cari kenapa Unavailable
- Tampilkan: pending >1 jam, rate 24 jam, status webhook BP
- Kalau butuh env var → dokumentasikan untuk VPS

*(Diperbaiki 15 Jul: typo `anchored_24h` vs `anchored24h` di `anchorAlerts.ts`.)*

---

## BLOK 3 — BACKFILL ANCHOR (6 pending + 3 untracked)

- 6 pending: Sync anchors from BP; kalau BP tidak punya record → tandai jujur
- 3 untracked: legacy OK; jangan hitung sebagai "gagal"
- Tujuan: order BARU ~100% anchored; order lama tak bisa backfill = wajar

---

## BLOK 4 — LIVE ORDERS: status dapur (known gap)

Semua order "pending" — Square kitchen → Orderly belum sync.

- Riset Square fulfillment/kitchen status
- Kalau ADA: sync Square → Orderly
- Kalau TIDAK: manual di dashboard ATAU auto-complete setelah X jam (catatan jujur)
- JANGAN karang status

---

## BLOK 5 — DEEP LINK KE ITEM

- `/r/samurai?src=...&item={id}` → scroll/highlight + siap Add
- Social posting Stage 1 generate `item=` otomatis

*(Kerja di branch `feat/social-item-deeplink` — stash siap dilanjutkan.)*

---

## BLOK 6 — SELF-SERVE E2E (Square OAuth sandbox)

- Sandbox sampai `square.connected: true`
- Tenant DEMO dari nol → menu auto-import → publish
- JANGAN timpa token/Location Samurai LIVE

---

## BLOK 7 — GOOGLE "ORDER ONLINE" LINK

- Doc `docs/BLOK_C1_GOOGLE_ORDER_ONLINE.md`
- Set food ordering link GBP → samurairesto.com (+ UTM)
- Channel `google` · go-live checklist tiap tenant

*(Ops GBP: user set URL; tunggu propagasi Google.)*

---

## BLOK 8 — SEO PROGRAMATIK (fondasi)

SSR menu · Schema.org · sitemap · robots · judul formula · /tags · /places  
⚠️ Thin/doorway pages dihukum Google.

---

## BLOK 9 — POLISH KECIL

- Alexis Wirch · 0 orders — perjelas / sembunyikan
- Tip selector visibility di checkout
- Refund $2.68 — verifikasi anchor refund negatif

---

## URUTAN DISARANKAN

1. BLOK 1 — Dashboard redesign  
2. BLOK 2 — Anchor health  
3. BLOK 5 — Deep link  
4. BLOK 4 — Live orders status  
5. BLOK 7 — Google Order Online  
6. BLOK 6 — Self-serve E2E  
7. BLOK 8 — SEO fondasi  
8. BLOK 3 & 9 — Backfill + polish  

## TETAP HOLD

Kirin/Linton · Stripe/delivery/payouts · C5 marketing SEND · Gift/Loyalty ENABLE · GBP Stage 2 send · AI Forecast
