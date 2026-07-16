# Orderly — Full Status Report (16 Jul 2026)

**Audience:** Verry + Malik (Orderly)
**Repo:** `orderly-platform` · `main` @ `6b7ae02` (+ PR #60 open)
**Prod VPS:** `46.202.179.234` · `samurairesto.com` · PM2 `samurai-api`
**Console:** `https://orderlyfoods.com/dashboard`
**Supersedes:** `docs/REPORT_ORDERLY_15Jul2026.md`

---

## Verdict

Blocker Meta terbesar **terbuka**: `pages_read_user_content` + `pages_manage_engagement` sekarang **aktif (Standard Access)**, Page token sudah **long-lived**, dan siklus komentar Facebook **terbukti end-to-end live** (komentar baru → klasifikasi → draft AI → `pending_approval`). Selain itu seluruh backlog dev 15 Jul (dashboard redesign, deep-link item, live-orders kitchen status, SEO, test+CI, monitoring, mobile UX, client/KDS, i18n tab + RTL Arab) **sudah merged ke `main`**. Yang tersisa murni **blocker pihak ketiga / ops** (Apple build, Google GBP API quota) dan item HOLD. Jalur uang Samurai **tidak disentuh**.

---

## 🎯 Fokus gelombang ini — Facebook comment pipeline PULIH (16 Jul)

Ini menuntaskan blocker #1 dari laporan 15 Jul ("Business Verification / `pages_read_user_content`").

### Yang dikerjakan & bukti

| Langkah | Hasil | Bukti |
|--------|-------|-------|
| Tambah izin `pages_read_user_content` + `pages_manage_engagement` | ✅ Standard Access ("Ready for testing") di app `samuraimartinsville` | Graph API Explorer permission list |
| Regenerasi Page token dengan scope baru | ✅ | `Page token identity: Samuraimartinsville (1031895316670551)` |
| Tukar → **long-lived** (praktis permanen) | ✅ `Long-lived OK` | `META_APP_ID` + `META_APP_SECRET` dipakai untuk `fb_exchange_token` |
| Backfill komentar lama | ✅ `{"ok":true,"fetched":230,...}` | 230 komentar terbaca (semua sudah ada di DB → `duplicates:230`) |
| Webhook `feed` masih tersubscribe | ✅ | `subscribed_fields:["feed"]` untuk app `943965434886796` |
| **Uji end-to-end komentar baru** | ✅ **Terbukti live** | Komentar *"shrimp bento its my family favorite"* → `classification: praise` → `status: pending_approval` + draft AI personal → Approve/Skip |

### Akar masalah yang ditemukan & diperbaiki

1. **Token mati (Meta error 190)** — Page token lama sudah invalid. Diganti via `scripts/meta-get-page-token.mjs`.
2. **`pm2 restart <name>` tidak memuat ulang env** — harus `pm2 restart ecosystem.config.cjs --update-env` agar token baru terbaca oleh proses.
3. **Token semula short-lived** — `META_APP_ID` belum ada di ecosystem sehingga long-lived exchange gagal. Sekarang `META_APP_ID=943965434886796` **di-persist** → token long-lived.
4. **Data historis `blocked/unknown`** — 33 komentar lama masuk status `blocked` dengan `classification: unknown` dan tanpa nama pengomentar. Ini **artefak historis** (di-ingest sebelum AI classifier/webhook berjalan benar; backfill lama tak memetakan nama). Komentar baru **tidak** kena masalah ini (lihat bukti "shrimp bento": nama + klasifikasi + draft benar).

### Guard keamanan Meta (PR #59 — merged hari ini)

Karena Business Manager sempat kena restrict "automation / Account Integrity", seluruh trafik Graph keluar kini melewati `lib/metaGuard.ts`:

| Knob | Efek |
|------|------|
| `META_GLOBAL_KILL_SWITCH=1` | Panic button — hentikan **semua** call Graph (reply, backfill, CAPI) seketika |
| `META_MIN_CALL_GAP_MS` (default 1200) | Jeda minimum antar-call (anti-burst) |
| `META_CALL_JITTER_MS` (default 400) | Jitter acak agar pacing tidak terlihat seperti bot |

Balasan tetap **human-gated** (`SOCIAL_SEND_ENABLED` + approve manual per baris). Kill-switch dicek **ulang tiap baris** saat flush CAPI (fix Bugbot).

---

## Ringkasan eksekutif

| Area | Status | Detail |
|------|--------|--------|
| Engine Samurai (order / pay / refund) | ✅ LIVE | Tidak diubah gelombang ini |
| Console dashboard Blok 1.x | ✅ LIVE | Orders, anchors, QR, payments, customers |
| **Facebook comment pipeline** | ✅ **LIVE (gated send)** | Baca + klasifikasi + draft AI terbukti; izin `pages_read_user_content`/`pages_manage_engagement` aktif; token long-lived |
| Social inbox Meta (4.1) | ✅ LIVE | Webhook nyata + draft Claude; human-approve |
| AI Gateway + Router + Claude `social_draft` | ✅ LIVE | Tak berubah sejak 15 Jul |
| **Dashboard redesign (tab + pagination)** | ✅ **MERGED** | PR #42 — bukan lagi scroll panjang |
| **Deep-link item (closed-loop promo)** | ✅ **MERGED** | PR #44 — post 1 item → landing item, bukan katalog |
| **Live Orders kitchen status** | ✅ **MERGED** | Tab + kitchen status controls (branch `live-orders`) |
| **SEO (SSR /menu + JSON-LD + title)** | ✅ **MERGED** | PR #45 |
| **Test framework + CI (Postgres)** | ✅ **MERGED** | PR #54 — Jest + jalur kritis; CI tiap PR |
| **Monitoring `/healthz` + `/readyz`** | ✅ **MERGED** | PR #55 |
| **PG pool tunable (`PG_POOL_MAX`)** | ✅ **MERGED** | PR #56 — default 10 aman |
| **Client Dashboard + KDS foundation** | ✅ **MERGED** | PR #53 — isolasi tenant teruji |
| **Dashboard i18n tab + RTL Arab** | ✅ **MERGED** | PR #57 |
| **Mobile UX elegant (fonts, a11y, skeleton, push-tap)** | ✅ **MERGED** | PR #58 |
| **Meta Graph global guard + throttle** | ✅ **MERGED** | PR #59 (hari ini) |
| Mobile EAS/iOS config + kirin PNG fix | 🔄 **PR #60 open** | Link EAS project id + export-compliance flag |
| Apple → TestFlight | ⏳ Ops | Membership aktif; build via EAS Cloud (jalan) |
| Google GBP review pull | ⛔ Blocked | Nunggu allow-list/quota Google (form) |
| Kirin / Linton / Stripe / C5 / gift enable | ⏸️ HOLD | Bukan bug |

---

## Status per instruksi Orderly (E → C → B → D + SISA)

| Blok | Instruksi | Status |
|------|-----------|--------|
| **E** | SEO programatik / multilingual | ✅ MERGED (PR #45 + SEO multilingual) |
| **C** | RTL Arabic + i18n audit | ✅ MERGED (PR #57 — tab i18n + verify RTL) |
| **B** | Mobile UX elegant | ✅ MERGED (PR #58) + config EAS/iOS (PR #60) |
| **D** | iOS build prep | ✅ Kode siap (EAS project linked, export-compliance); build via **EAS Cloud** (ops) |
| **SISA 1** | Self-serve OAuth Production | ⏸️ **Ditunda sengaja** — onboard manual dulu untuk kontrol kualitas fase awal (tak sentuh token LIVE) |
| **SISA 2** | Facebook `pages_read_user_content` | ✅ **SELESAI hari ini** (lihat fokus gelombang) |
| **SISA 3** | Mobile UX (fonts/a11y/dll) | ✅ MERGED (PR #58) |

---

## PR sejak laporan 15 Jul

| PR | Judul | Status |
|----|-------|--------|
| [#53](https://github.com/Suhono-BranchlessPay/orderly-platform/pull/53) | Client dashboard + KDS foundation (isolasi tenant) | ✅ merged |
| [#54](https://github.com/Suhono-BranchlessPay/orderly-platform/pull/54) | Jest + critical-path tests (isolation, money, anchor, menu sync, deep-link) | ✅ merged |
| [#55](https://github.com/Suhono-BranchlessPay/orderly-platform/pull/55) | `/healthz` + `/readyz` operational probes | ✅ merged |
| [#56](https://github.com/Suhono-BranchlessPay/orderly-platform/pull/56) | Tunable `PG_POOL_MAX` + catatan load experiment | ✅ merged |
| [#57](https://github.com/Suhono-BranchlessPay/orderly-platform/pull/57) | Dashboard i18n tab + verify Arabic RTL | ✅ merged (hari ini) |
| [#58](https://github.com/Suhono-BranchlessPay/orderly-platform/pull/58) | Mobile UX elegant pass | ✅ merged (hari ini) |
| [#59](https://github.com/Suhono-BranchlessPay/orderly-platform/pull/59) | Meta Graph global kill-switch + throttle | ✅ merged (hari ini) |
| [#60](https://github.com/Suhono-BranchlessPay/orderly-platform/pull/60) | Mobile EAS project link + iOS export-compliance + kirin PNG fix | 🔄 open |

> Catatan: dashboard redesign (#42), deep-link item (#44), SEO+iOS prep (#45), fix menu photos (#48), lead-segment customers (#49) juga sudah pada `main`.

---

## Env prod yang di-set gelombang ini (VPS `ecosystem.config.cjs`)

- `META_PAGE_ACCESS_TOKEN` → **long-lived** (diperbarui, scope `pages_read_user_content` + `pages_manage_engagement`)
- `META_APP_ID=943965434886796` → **di-persist** (agar long-lived exchange satu langkah ke depan)
- `META_APP_SECRET` → sudah ada (dipakai signature webhook + long-lived exchange)
- `SOCIAL_INTERNAL_API_KEY` → dipakai untuk trigger backfill internal (bukan untuk browser/klien)
- Guard baru (opsional, default aman): `META_GLOBAL_KILL_SWITCH` (jangan diset/`0`), `META_MIN_CALL_GAP_MS`, `META_CALL_JITTER_MS`

---

## Yang benar-benar tersisa

### ⏳ Ops / pihak ketiga (bukan bug kode)

| # | Item | Pihak | Aksi buka |
|---|------|-------|-----------|
| 1 | iOS build → TestFlight | Apple/EAS | Lanjutkan **EAS Cloud build** (kredensial via Apple login/ASC API key) |
| 2 | Google review pull | Google | Allow-list Business Profile API + quota (form request access) |
| 3 | Meta **Advanced Access** (opsional) | Meta | Hanya jika perlu kelola Page **milik klien lain** / skala publik — Standard Access sudah cukup untuk Samurai sekarang |

### 🔎 Follow-up kecil (dev, opsional)

- **Smoke send balasan FB** — klik **Approve** pada 1 draft (mis. "shrimp bento") untuk memverifikasi jalur kirim (`pages_manage_engagement`) end-to-end. Lakukan **1 dulu**, tidak massal (akun baru lepas restrict).
- **Re-klasifikasi batch komentar historis `blocked/unknown`** (33 baris) — opsional; isinya komentar positif biasa, aman dibiarkan.
- **Nama pengomentar pada backfill lama** kosong — hanya data historis; komentar baru sudah benar.

### ⏸️ HOLD (jangan dikerjakan sebagai bug)

Kirin / Samurai Linton (Health Dept), Stripe Connect / payouts / delivery, C5 marketing SEND, Gift cards / Loyalty **enable**, AI Forecast / metrik palsu.

---

## Aturan yang tetap dipegang

- Branch + PR; tidak commit secret (token Meta tidak pernah masuk chat/repo — diproses di VPS)
- Tidak ubah jalur uang tanpa review manusia
- Tidak mengarang metrik
- Social send **human-approve**; ada kill-switch + throttle global Meta
- AI social = draft + human-approve; allergy/spam hard-block sebelum LLM

---

## Satu kalimat untuk Verry / Malik

**Blocker Facebook (`pages_read_user_content`) tuntas — token long-lived, backfill jalan, siklus komentar→klasifikasi→draft→approve terbukti live; seluruh backlog dev 15 Jul (dashboard redesign, deep-link, live-orders, SEO, test+CI, monitoring, client/KDS, i18n+RTL, mobile UX, Meta guard) sudah di `main`; sisanya murni Apple/Google/HOLD.**

---

*Laporan 16 Jul 2026. PR hari ini: #57, #58, #59 merged; #60 open (mobile config). Fokus: resolusi Meta comment pipeline + konsolidasi status.*
