# Jawaban untuk Orderly — status git + 10 pertanyaan terbuka
**Tanggal:** 19 Jul 2026 · **Tenant:** Samurai Martinsville · **VPS HEAD:** `5a33688`

---

## A. Status git — `feat/tiktok-channel-webview-bio`

| Item | Status |
|------|--------|
| Branch | `feat/tiktok-channel-webview-bio` |
| PR | **[#88](https://github.com/Suhono-BranchlessPay/orderly-platform/pull/88)** — **MERGED** 19 Jul 2026 05:45 UTC |
| Merge commit | `5a33688` |
| VPS `/var/www/samurai-resto` | `5a33688` (sama dengan `origin/main`) |
| Scope PR | TikTok/IG WebView escape · `tiktok` di content calendar · `/bio` link-in-bio · docs nginx `/bio` |

**Bukti jalur live (setelah merge + deploy):**

| Channel | Scan src | Order | Total | Flag |
|---------|----------|-------|-------|------|
| Instagram | `ig-bio` (1 human) | `72EDD5D4` | $1.34 | `is_test` · `ops_ig_bio_path_proof` |
| TikTok | `tiktok-test` (1 human) | `009994BF` | $1.34 | `is_test` · `ops_tiktok_path_proof` |

**Catatan pola “hidup dulu, git belakangan”:** Untuk gelombang TikTok/IG kali ini, urutan sudah **PR → merge → deploy VPS**. Hotfix lokal di VPS sebelum `git pull` masih terjadi di gelombang sebelumnya (FB WebView); untuk #88, dirty tree VPS di-stash lalu `reset --hard origin/main` ke `5a33688`. Disiplin yang dipegang ke depan: tidak ada fitur baru di prod tanpa PR merged.

---

## B. Sepuluh pertanyaan — jawaban faktual + status

### 1. Perluasan flag DQ ke seluruh klik→order Facebook sebelum PR #86

| | |
|--|--|
| **Status** | **BELUM** (hanya jendela 16–18 Jul untuk alasan atribusi, bukan WebView) |
| **Fakta kode** | `ATTRIBUTION_INCOMPLETE_WINDOW = { start: "2026-07-16", end: "2026-07-18" }` di `dailyReportDataQuality.ts`. Alasan: bare FB link / first-touch / fbclid — **bukan** “iPhone tidak bisa bayar di WebView”. |
| **Implikasi Orderly** | `fb-crabmeatbento-20260714`, `fb-beefbento`, `fb-steakbento-20260715` **tidak** masuk filter DQ itu. Kalau masuk `past_content_performance`, CE bisa belajar “FB → 0 order” padahal checkout WebView rusak sampai #86 (18 Jul malam). |
| **Keputusan yang diminta** | Perluas DQ / exclude learning untuk post Facebook dengan `posted_at` **sebelum** WebView handoff live (`≤ 2026-07-18` malam, atau `src` FB campaign sebelum #86). **Belum diimplementasi** — siap PR terpisah setelah Orderly set cutoff. |

---

### 2. Validasi `stay=1`

| | |
|--|--|
| **Status** | **DIJAWAB** — cukup parameter; UA tidak di-recheck |
| **Fakta kode** | `bio.ts` / `qr.ts`: escape hanya jika `shouldEscapeInAppBrowser(ua) && req.query.stay !== "1"`. Setelah `stay=1`, Continue dilewati **meski UA masih WebView**. |
| **Risiko** | Tautan yang dibagikan dengan `?stay=1` bisa membuka bio/menu **di dalam** WebView dan menabrak Square lagi. |
| **Mitigasi diusulkan (belum ship)** | (a) `stay=1` hanya honor kalau UA **bukan** IAB, atau (b) signed short-lived token, atau (c) di IAB + `stay=1` tetap tampilkan Continue lembut (bukan skip total). |

---

### 3. Auto-flag order tes

| | |
|--|--|
| **Status** | **PARSIAL** — filter query ada; auto-set `is_test` saat create **tidak** |
| **Fakta kode** | `sqlExcludeOpsTestOrders()` mengecualikan `is_test=true`, `src LIKE 'test-%'`, `test-manual`. Create order **tidak** men-set `is_test` otomatis. Empat order proof (`d1434a2a`, `88e7876e`, `72edd5d4`, `009994bf`) di-flag **manual SQL**. |
| **Celan** | `tiktok-test` / `ig-bio` ops proof tidak cocok pola `test-%` kecuali di-flag; `probe-*` tidak di-exclude. |
| **Usulan** | Saat create: jika `src` match `/(^|-)(test\|probe)(-|$)/i` atau `*-test` / `test-*` → set `is_test=true` + `test_reason=auto_src`. |

---

### 4. Saring src tes dari tampilan QR scans

| | |
|--|--|
| **Status** | **BELUM** |
| **Fakta** | Dashboard QR aggregasi semua `meta.src`; hanya filter bot UA. Sembilan dari ~18 src di jendela adalah tes/probe. |
| **Usulan** | Toggle “Hide test/probe src” (default ON) di `buildQrScanReport`: exclude `test*`, `*probe*`, `*-test`, ops-known `tiktok-test` (atau hanya `is_test` orders’ src — terpisah dari scan). |

---

### 5. Pencocokan berbasis SKU, bukan nama

| | |
|--|--|
| **Status** | **BELUM** — sekarang **nama / id** |
| **Fakta kode** | `contentCalendarGenerate.ts` → `matchMenuItem` / `matchMenuItemFromText`: exact/includes **name**, atau id equality. Caption text mengalahkan AI `target_item_*`. **SKU tidak dipakai.** |
| **Risiko** | “Hibachi Chicken & Scallop” vs “Hibachi Steak & Chicken”; “Crab Meat Bento” vs “Chicken Bento”; “Crab Rangoon (4 Pcs)” vs “Crab Rangoon Roll”. |
| **Usulan** | Generator + approve wajib `target_item_id` = SKU/PK; name hanya display. Match caption → kandidat SKU, bukan substring nama longgar. |

---

### 6. `exclude_from_content` untuk produk bermerek pihak ketiga

| | |
|--|--|
| **Status** | **BELUM diimplementasi** (kebijakan sudah diputuskan; kolom/flag tidak ada) |
| **Fakta** | Tidak ada `exclude_from_content` di schema `menu_items` atau filter Content Engine. |
| **Usulan** | Kolom boolean `exclude_from_content` (default false) + filter di `contentCalendarGenerate` catalog + dashboard badge. |

---

### 7. `photo_needed` di kartu dashboard sebelum approve

| | |
|--|--|
| **Status** | **SUDAH** |
| **Fakta** | Dashboard list: kolom Photo = **Needs photo** / **Ready**. Preview: banner peringatan. Approve: `confirm(...)` jika `photo_needed`. Di-set generate: `photo_needed: !links.photoAssetId`. |
| **Catatan** | Soft gate (confirm browser), bukan hard block server. Cukup untuk “jangan approve lalu buntu di Canva” jika operator baca UI. |

---

### 8. Skrip deploy — “aset dipulihkan dari dist”

| | |
|--|--|
| **Status** | **DONE** — `scripts/deploy-samurai-main.sh` (satu-satunya jalur; restore aset wajib + fail-closed) |
| **Fakta** | Urutan tetap: pull → build API → `STRICT_ASSETS=1` restore dist→`attached_assets/` → PM2. Docs: `docs/DEPLOY_SAMURAI.md`. Helper internal: `deploy-samurai-assets.sh`. |
| **Risiko tertutup** | Deploy tanpa memikirkan aset tetap memanggil restore; zero restore → abort sebelum restart. |

---

### 9. `/bio` perlu noindex?

| | |
|--|--|
| **Status** | **SUDAH untuk `/bio`** |
| **Fakta** | `bio.ts` mengirim `<meta name="robots" content="noindex"/>`. Escape HTML juga `noindex`. `/s/` normal = **302 redirect** (tidak render HTML menu); hanya halaman Continue yang noindex. |
| **Kesimpulan** | Duplikasi konten menu dari `/bio` sudah di-noindex. Tidak ada gap SEO kritis di sini. Opsional: tambah `X-Robots-Tag: noindex` header HTTP (belt-and-suspenders). |

---

### 10. Klaim kedaluwarsa (“most-ordered” generate hari ini, terbit minggu depan)

| | |
|--|--|
| **Status** | **PARSIAL** — flag UI saja, tidak di-block saat terbit |
| **Fakta** | Generate set `claim_recheck` jika caption match most-ordered / #1 / top-seller. Dashboard tampilkan badge. `captionHasBannedClaim` **tidak** mencakup “most-ordered”. Approve / mark posted **tidak** revalidate penjualan live. |
| **Usulan** | Saat Approve atau Mark posted: jika `claim_recheck`, wajib recompute ranking 7d/30d atau strip klaim; hard-block jika item bukan top-N lagi. |

---

## Ringkasan untuk Orderly (satu tabel)

| # | Topik | Status | Butuh PR? |
|---|--------|--------|-----------|
| A | Git / PR #88 | **MERGED + VPS = `5a33688`** | — |
| 1 | DQ FB sebelum WebView #86 | **SHIPPED** (PR follow-up) — CE excludes `fb-*` posted ≤2026-07-18 | — |
| 2 | `stay=1` | **SHIPPED** — IAB UA always Continue; stay ignored in WebView | — |
| 3 | Auto-flag tes | **SHIPPED** — create sets `is_test` for test/probe src | — |
| 4 | Saring src tes di QR UI | **SHIPPED** — `hide_test_src=1` default | — |
| 5 | Match SKU | Belum (name/id) | Ya |
| 6 | `exclude_from_content` | Belum | Ya |
| 7 | `photo_needed` UI | **Sudah** | Soft→hard opsional |
| 8 | Restore assets deploy | tmp-script only | Ya — formalize |
| 9 | `/bio` noindex | **Sudah** | Opsional header |
| 10 | Claim recheck at publish | Flag saja | Ya — hard gate |

---

## Bukti jalur sosial (konteks tes 19 Jul)

- FB WebView path: PR **#86** + order proof `88e7876e` / `d1434a2a` (`is_test`).
- IG bio: `/bio?src=ig-bio` → Continue → Safari → order **`72EDD5D4`** (`instagram` / `ig-bio`).
- TikTok: `/bio?src=tiktok-test` → scan human + order **`009994BF`** (`tiktok` / `tiktok-test`). UA TikTok sering **tanpa** string `TikTok`/`TTWebView` → Continue/`x-safari-https` **belum** terbukti di jalur itu; atribusi + pay terbukti.

---

*Laporan ini untuk balasan Orderly. Item “Belum” = backlog eksplisit, bukan diam-diam dianggap selesai.*
