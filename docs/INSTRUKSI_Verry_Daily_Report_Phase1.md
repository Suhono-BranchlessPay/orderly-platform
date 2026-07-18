# INSTRUKSI Verry — Daily AI Orderly Report (Fase 1)

**Tanggal brief:** 17 Juli 2026  
**Branch:** `feat/daily-report-phase1`  
**Aturan:** branch + PR · secrets di env · jangan mengarang metrik · per-tenant · jangan sentuh jalur uang

## Tujuan Day 1 (trial)

Email HTML ke pemilik berisi penjualan Square (semua channel) + atribusi Orderly (subset) + reputasi + insight fakta. Jam 4 pagi **waktu lokal tenant**.

## Anti double-count

- **Total** = Square only  
- **Online per channel** = Orderly only (jangan dijumlah ke total Square)

## Env (VPS — jangan commit)

```bash
DAILY_REPORT_ENABLED=1
DAILY_REPORT_CRON_SECRET=<random>
DAILY_REPORT_TENANT_SLUG=samurai
DAILY_REPORT_TZ=America/Indiana/Indianapolis
DAILY_REPORT_TO=malik@example.com
DAILY_REPORT_FROM="Orderly Reports <reports@yourdomain>"
RESEND_API_KEY=re_...
# multi-tenant optional:
# DAILY_REPORT_TENANTS=samurai=America/Indiana/Indianapolis=a@x.com;kirin=America/Chicago=b@y.com
```

## Trial hari ini (manual)

```bash
# Preview HTML
curl -sS "https://samurairesto.com/api/internal/daily-report/preview?tenantSlug=samurai" \
  -H "X-Daily-Report-Secret: $DAILY_REPORT_CRON_SECRET" -o /tmp/daily.html

# Dry-run (assemble only)
curl -sS -X POST "https://samurairesto.com/api/internal/daily-report/run" \
  -H "Content-Type: application/json" \
  -H "X-Daily-Report-Secret: $DAILY_REPORT_CRON_SECRET" \
  -d '{"dryRun":true,"tenantSlug":"samurai"}'

# Send for real
curl -sS -X POST "https://samurairesto.com/api/internal/daily-report/run" \
  -H "Content-Type: application/json" \
  -H "X-Daily-Report-Secret: $DAILY_REPORT_CRON_SECRET" \
  -d '{"tenantSlug":"samurai"}'
```

## Square REPORTING_READ

- Scope ditambah di `SQUARE_OAUTH_SCOPES` → **merchant harus re-consent** OAuth agar token baru punya scope.
- Samurai env token (`TENANT_SAMURAI_SQUARE_ACCESS_TOKEN`): pastikan application/token punya akses Reporting di Square Dashboard. Kalau 403, tambah permission / regenerate token.

## File kunci

| Module | Path |
|--------|------|
| Square queries A/B/C | `artifacts/api-server/src/lib/squareReporting.ts` |
| Assemble + insights fakta | `…/dailyReportAssemble.ts` |
| HTML | `…/dailyReportHtml.ts` |
| Email (Resend) | `…/emailSend.ts` |
| Cron 4am | `…/dailyReportCron.ts` |
| Trigger | `…/routes/dailyReport.ts` |

## Status live (17 Jul 2026 malam)

- [x] PR #68 merged · VPS `samurai-resto` @ `16bf944` · API rebuilt
- [x] Square Reporting A + B **200** (real Samurai data)
- [x] Preview HTML/JSON generated for **2026-07-16** (lihat `docs/daily-reports/TRIAL_Samurai_2026-07-16.md`)
- [x] Anti double-count di HTML (Orderly subset terpisah)
- [x] `DAILY_REPORT_CRON_SECRET` di ecosystem VPS (file `/tmp/daily-report-secret.txt`)
- [ ] **Email:** set `RESEND_API_KEY` + `DAILY_REPORT_TO` + `DAILY_REPORT_FROM`, lalu POST `/api/internal/daily-report/run`
- [ ] `DAILY_REPORT_ENABLED=1` untuk cron 4am (setelah email proven)

## Definisi selesai Fase 1 (checklist)

- [x] REPORTING_READ / token bisa query A,B,C (data nyata)
- [x] Preview HTML menampilkan penjualan + produk + tren
- [ ] Email terkirim ke Malik (trial) — tunggu Resend + alamat
- [x] Anti double-count terlihat di copy
- [x] Per-tenant env (bukan hardcode email di kode)
- [x] CI + Bugbot hijau (#68)

## Belum di Day 1 (bertahap)

- AI Gateway task `daily_report` (Claude) — naratif hangat + fact bullets; fallback structured facts jika AI down
- Data tambahan: QR scans, social posts, unanswered inbox, GBP (jika ada), supply Level-1 dari product mix
- Per-tenant `owner_email` dari DB — belakangan (setelah format trial matang)
- CoItemSales / payment methods / KDS (Fase 2)
- Prediksi (Fase 3 — dilarang sekarang)
