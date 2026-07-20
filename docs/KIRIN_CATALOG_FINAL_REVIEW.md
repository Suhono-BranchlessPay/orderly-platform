# Kirin Hibachi Express — review draf katalog final

**Sumber:** draf untuk Square (merchant `MLRNMQAJ7ERYC`, lokasi `LRKJ8G89JNNTR`, Henderson KY, `America/Chicago`)  
**Status draf:** BELUM DIEKSEKUSI — menunggu persetujuan Malik  
**Reviewer:** Orderly / engineering check (20 Jul 2026)  
**Verdict:** **Layak dieksekusi setelah Malik menutup 3 keputusan terbuka di bawah.** Hitungan & SKU bersih; tidak ada blocker struktural.

---

## 1. Verifikasi angka (lulus)

| Cek | Draf | Hasil review |
|-----|------|--------------|
| Total item | 70 | ✅ 70 |
| SKU unik | 70 | ✅ 70 |
| Nama unik | 70 | ✅ 70 |
| Item tanpa kategori | 0 | ✅ 11 kategori terisi |
| Modifier Soup or Salad | 33 item | ✅ 10+9+4+4+6 = 33 |
| Modifier Lo Mein or Fried Rice | 5 item | ✅ 029–033 |
| NDL tanpa modifier | 034, 035 | ✅ sesuai catatan |
| Typo Shirmp / Cheescake / dll. | diperbaiki | ✅ |
| Ringkasan kategori | 10+9+9+7+4+7+6+5+4+6+3 | ✅ = 70 |

SKU format `KRN-{CAT}-{NNN}` + nomor global 001–070: konsisten dan cocok dengan aturan Orderly (match by SKU, bukan fuzzy nama).

---

## 2. Cocok dengan Orderly (setelah Square + sync)

| Kebutuhan platform | Draf ini |
|--------------------|----------|
| Setiap item punya SKU | ✅ |
| Nama berdiri sendiri di struk/KDS | ✅ konvensi bagus |
| Pilihan wajib = modifier Square (bukan teks deskripsi) | ✅ Soup/Salad + Lo Mein/FR |
| Hindari swap nama mirip (Hibachi Chicken vs … & Scallop) | ✅ nama beda; **Orderly sudah match SKU dulu** — substring overlap tetap ada (lihat §4) tapi tidak memblokir |
| Samurai `SKU001` tidak disentuh | ✅ keluar jalur Kirin |

**Setelah eksekusi Square (wajib, berurutan):**

1. Set `TENANT_KIRIN_SQUARE_*` (atau OAuth) ke lokasi **`LRKJ8G89JNNTR`** — jangan biarkan fallback ke Square Samurai.
2. Sync menu Kirin → Orderly (harus 70 item, SKU sama).
3. Smoke: satu order berbayar kecil di `kirinhibachiexpress.com` → muncul di Square **Kirin**, bukan Samurai.
4. Pertimbangkan `exclude_from_content = true` untuk **Extra Protein**, dan opsional Side / À La Carte (jarang jadi konten sosmed).

---

## 3. Keputusan Malik (20 Jul 2026) — masuk eksekusi

### A. Fillet — **samakan menjadi Fillet**

Pakai ejaan **Fillet** (bukan Filet) di semua item terkait:

| SKU | Nama final |
|-----|------------|
| KRN-HIB-007 | Hibachi Fillet Mignon |
| KRN-CMB-018 | Hibachi Fillet Mignon & Shrimp |
| KRN-CMB-019 | Hibachi Fillet Mignon & Scallop |
| KRN-XTR-045 | **Extra Fillet Mignon** (bukan hanya “Extra Fillet”) |
| KRN-ALC-057 | **Fillet Mignon À La Carte** (bukan hanya “Fillet À La Carte”) |

### B. Steak — pelanggan memilih 4 oz atau 8 oz (HARGA — wajib diputuskan sebelum eksekusi)

Acuan harga di draf:

| Item | Oz | Harga |
|------|-----|-------|
| `KRN-HIB-005` Hibachi New York Strip (4 oz) | 4 oz | **$14.00** |
| `KRN-SPC-058` Hibachi Steak Combo (8 oz) | 8 oz | **$18.99** |

Selisih **$4.99** antara 4 oz plate dan 8 oz special. Itu berarti ukuran **bukan** modifier gratis.

**Aturan eksekusi Square (jangan salah):**

1. Kalau combo / bento / extra / à la carte boleh pilih 4 oz **atau** 8 oz **dan** harganya beda → pakai **priced variation** (dua variation / dua SKU) atau modifier dengan **price delta** (mis. +$4.99 untuk 8 oz). Modifier $0 untuk kedua ukuran = kehilangan uang tiap pesanan 8 oz.
2. Kalau Malik ingin satu harga flat di combo/bento (ukuran hanya instruksi dapur) → dokumentasikan harga flat itu secara eksplisit; jangan meniru selisih plate↔special tanpa sengaja.
3. Plate tetap item 4 oz; Special 8 oz tetap item sendiri. Pilihan ukuran di item lain harus **jelas di Square** — jangan biarkan dapur menebak.

**Keputusan terbuka untuk Malik sebelum katalog dibangun:** untuk tiap SKU yang menyebut Steak (CMB/BNT/XTR/ALC), apakah 4/8 oz punya selisih harga, atau ukuran hanya preferensi tanpa delta?

### C. Spring Roll — tambah qty

- `KRN-APP-028` → **Spring Roll (2)** (selaras Egg Roll / Soft Shell).

---

## 4. Bukan blocker — catatan operasional

### Nama yang saling mengandung (Content Engine / pencarian)

Contoh: `Hibachi Chicken` ⊂ `Hibachi Chicken & Shrimp`, `Hibachi Chicken Katsu`, dll.  
Ini **disengaja** oleh konvensi nama. Aman selama deep-link & kalender konten memakai **SKU/id**, bukan fuzzy nama saja (sudah di Orderly). Jangan andalkan match nama untuk promo.

### Deskripsi yang masih tipis

- **Combination Lo Mein or Fried Rice** — kombinasi protein apa? Satu kalimat deskripsi membantu dapur & online.  
- **Pineapple Fried Rice** / **Seafood Yaki Udon** — OK tanpa modifier; pastikan dapur tidak ditanya “lo mein atau fried rice?”.

### Ejaan gaya

- “Side **Steam** Rice” → umum di menu AS; alternatif “Steamed Rice” (kosmetik).  
- Karakter **À** di À La Carte — pastikan Square/printer KDS UTF-8 (biasanya OK).

### Eksekusi Square (risiko)

Urutan draf (hapus 134 → hapus Food Truck 1 → buat Extra Protein → 70 item → modifier) benar. Sebelum hapus massal:

- Tidak ada open ticket / favorit kasir yang bergantung item lama, atau ada daftar mapping lama→baru untuk staf.
- Setelah selesai: hitung 70, SKU unik, 33+5 modifier terpasang (sesuai checklist draf).

---

## 5. Checklist tanda tangan Malik

- [ ] Setuju hitungan 70 / 11 kategori / 2 modifier set  
- [ ] Keputusan **Fillet vs Filet** (dan konsistensi Extra/ALC)  
- [ ] Keputusan **Steak 4/8 oz** di combo–bento–extra: priced variation / price delta, atau flat (tulis harga)  

- [ ] Qty **Spring Roll** (opsional tapi disarankan)  
- [ ] Harga final OK (terutama special $19.25 / $19.50 / $20.00)  
- [ ] Izinkan hapus 134 item POS lama + kategori Food Truck 1  
- [ ] Setelah Square: beritahu Orderly untuk wire lokasi `LRKJ8G89JNNTR` + sync (jangan pakai Square Samurai)

---

## 6. Setelah approve — urutan teknis singkat

1. **OAuth Square Kirin** (scope lengkap) → lokasi **`LRKJ8G89JNNTR`** / merchant `MLRNMQAJ7ERYC` — pasang env/`oauth` dulu, verifikasi `/api/square/config` `enabled:true` + location Kirin, **baru** aktifkan jalur bayar.  
2. Eksekusi katalog 70 item di Square (draf ini).  
3. Menu sync → verifikasi **70 SKU** terbaca Orderly.  
4. Set `tenants.tax_rate = 0.06` (Kentucky — confirmed; bukan Indiana 0.07).  
5. Smoke bayar kecil di `kirinhibachiexpress.com` — verifikasi **empat** sekaligus:  
   - uang masuk Square **Kirin** (bukan Samurai `L1XA1D2Q249NH`)  
   - pajak = tarif Kentucky  
   - anchor on-chain jalan untuk tenant `kirin`  
   - order muncul di KDS dengan tenant `kirin`  
6. Isi jam + hero/OG + seed user `/client`+`/kds` (boleh paralel dengan 2–4 jika tidak menyentuh money path).

---

*Draf katalog milik Malik/ops. File ini hanya review — bukan perintah eksekusi.*
