# Orderly — End-of-Day Report (14 Jul 2026)

**Audience:** Verry + Malik  
**Repo:** `orderly-platform` · `main` @ `857c510`  
**Prod VPS:** `46.202.179.234` · `samurairesto.com` · PM2 `samurai-api`  
**Console:** `https://orderlyfoods.com/dashboard`

---

## Verdict

Gelombang kode 14 Jul (gift cards foundation, social posting Stage 1, bot-filter ROI, **legal pages**, **Blok 4.2 GBP skeleton**) sudah **merged & deployed**. Jalur uang Samurai tidak diubah. **Meta Publish** dan **Apple membership Active → EAS/TestFlight** masih **ops / menunggu email** — bukan blocker kode yang belum di-merge.

---

## PR #31 (legal pages) — DONE

| Item | Status |
|------|--------|
| PR [#31](https://github.com/Suhono-BranchlessPay/orderly-platform/pull/31) | ✅ Merged `857c510` (14 Jul ~22:45 UTC) |
| Deploy VPS | ✅ Pull + rebuild API + storefront |
| Live URLs | ✅ `https://samurairesto.com/privacy` · `/terms` · `/data-deletion` |

Pakai URL di atas untuk Meta App settings **sekarang** (Privacy Policy + Data deletion), lalu Publish.

---

## Status instruksi (checklist lengkap)

### ✅ Selesai (kode + deploy)

| Blok / item | Status | Catatan |
|-------------|--------|---------|
| **1.x** Dashboard / QR / Anchor / refund test | ✅ LIVE | Tidak berubah hari ini |
| **3.1** Square OAuth sandbox skeleton | ✅ LIVE | Samurai tetap env token; jangan timpa live |
| **3.2 / 3.3** Support KB + i18n | ✅ LIVE | th/my/ne/ar masih butuh review penutur asli |
| **4.1** Social inbox Meta | ✅ LIVE (gated) | Draft→approve OK (simulasi); `SOCIAL_SEND_ENABLED=0` |
| Social posting Stage 1 | ✅ LIVE | Manual draft→approve→mark posted; crabmeat post live |
| Bot filter ROI clicks | ✅ LIVE | Human vs bot di QR / social performance |
| Square Gift Cards foundation | ✅ LIVE | Engine **off** (`ORDERLY_GIFT_CARDS_ENABLED=0`) — legal HOLD |
| **Legal pages** (PR #31) | ✅ LIVE | Privacy / Terms / Data deletion |
| **4.2** GBP inbox skeleton (PR #32 + #33) | ✅ LIVE (gated) | Draft→approve OK (simulasi); send stub / Stage 2 OAuth |
| **5** Multi-vertical seams | ✅ Migrated | Samurai tetap restaurant |

### 📋 Ops Malik — belum selesai (bukan gap kode)

| Item | Status | Apa yang menunggu |
|------|--------|-------------------|
| **Meta Publish** (Dev → Live) | ⏳ BELUM | Isi Privacy + Data deletion URL → Publish. Tanpa ini komentar Page publik sering tidak masuk webhook. App Review untuk Page **klien** = belakangan. |
| **Apple membership Active** | ⏳ BELUM (Pending) | Receipt $98.99 sudah ada; portal masih **sri suhono (Pending)** + “purchase may take up to 48 hours”. Belum ada email **membership confirmation**. Team ID enrollment: `K4SAA2F25A`. |
| **EAS / TestFlight** | ⏸️ BLOKIR Apple | Bundle `com.orderly.samurai.martinsville`; checklist `docs/BLOK6_IOS_STORE_PREP.md`. Mulai setelah Pending hilang. |
| Square OAuth sandbox E2E | ⏳ Ops | Uji sampai `square.connected: true` — jangan timpa token Samurai live |
| i18n native review | ⏳ Ops | th / my / ne / ar |
| Meta Graph send smoke | ⏸️ Sengaja off | Hanya setelah webhook komentar asli + window terkendali |

### ⏸️ HOLD (jangan dikerjakan sebagai bug)

- Kirin / Samurai Linton — Health Dept + foto menu (C1)  
- Stripe Connect / delivery / payouts  
- C5 marketing SEND — consent + lawyer  
- Gift cards **enable** — legal HOLD  
- AI Forecast / metrik palsu  
- GBP Stage 2 (Google OAuth + real reply API)  
- Meta App Review untuk Page klien (bukan milik sendiri)

---

## Yang dikerjakan 14 Jul (gelombang sore)

1. Meta inbox ops: token Page diperbaiki; simulasi “do you have ramen” → draft→approve; send gate dimatikan lagi.  
2. Legal pages + footer storefront → PR #31.  
3. Blok 4.2 GBP skeleton → PR #32; i18n fix → PR #33; simulasi review → draft→approve.  
4. Apple: payment receipt ada; membership **belum Active** (tunggu email / hingga ~48 jam).

### Smoke VPS (saat laporan)

- `HEAD` = `857c510`  
- `/api/social/health` → `send_globally_enabled: false`, `meta_token_configured: true`  
- `/api/gbp/health` → `send_globally_enabled: false`, trial samurai  
- `/privacy` + `/data-deletion` → HTTP 200  

---

## Console sekarang

`https://orderlyfoods.com/dashboard`:

- Live orders, anchors, payments, QR, customers, support KB  
- **Social inbox (trial)** — Meta, human approve  
- **Google reviews (trial)** — GBP, human approve  
- Social posts Stage 1 panel (jika enabled di UI)  
- Coming soon jujur — tidak dikarang  

---

## Aksi Malik berikutnya (urutan)

1. **Meta (bisa sekarang, tanpa tunggu Apple)**  
   - Privacy: `https://samurairesto.com/privacy`  
   - Data deletion: `https://samurairesto.com/data-deletion`  
   - Publish app → komentar baru di Page → cek Social inbox  

2. **Apple (tunggu email / hingga 48 jam)**  
   - Refresh developer.apple.com/account sampai **bukan Pending**  
   - Certificates / App Store Connect jalan tanpa error Team ID  
   - Lalu: App ID + ASC app + `eas build --platform ios --profile preview` → TestFlight  
   - Detail: `docs/BLOK6_IOS_STORE_PREP.md`  

3. Ops sekunder: Square OAuth sandbox E2E; i18n native review  

---

## Aturan yang tetap dipegang

- Branch + PR; tidak push secret  
- Tidak ubah jalur uang tanpa review manusia  
- Tidak mengarang metrik  
- Social/GBP send tetap **off** sampai smoke terkendali  
- AI support = retrieval KB + escalate  

---

## Dokumen terkait

- `docs/BLOK4_SOCIAL_TRIAL.md`  
- `docs/BLOK4_GBP_TRIAL.md`  
- `docs/BLOK6_IOS_STORE_PREP.md`  
- `docs/BLOK_C1_GOOGLE_ORDER_ONLINE.md`  
- `docs/C7_Meta_API_Registration_Checklist.md`  
- `docs/REPORT_ORDERLY_14Jul2026.md` (laporan siang — digantikan status oleh EOD ini)

---

*Laporan EOD 14 Jul 2026. Meta Publish + Apple Active = satu-satunya blocker ops utama sebelum TestFlight dan webhook komentar publik.*
