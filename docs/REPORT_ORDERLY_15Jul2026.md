# Orderly — Full Status Report (15 Jul 2026)

**Audience:** Verry + Malik (Orderly)  
**Repo:** `orderly-platform` · `main` @ `2087853`  
**Prod VPS:** `46.202.179.234` · `samurairesto.com` · PM2 `samurai-api`  
**Console:** `https://orderlyfoods.com/dashboard`  
**Supersedes:** `docs/REPORT_ORDERLY_14Jul2026_NIGHT.md` · `docs/REPORT_ORDERLY_14Jul2026_EOD.md` · `docs/REPORT_ORDERLY_14Jul2026.md`

---

## Verdict

Gelombang malam 14→15 Jul: **Meta App Published (Live)** + webhook komentar publik terbukti; **AI Gateway + AI Router** live di prod dengan **Claude (Anthropic) `claude-sonnet-5`** untuk `social_draft`; human-approve tetap; **send tetap off**. Health monitor/circuit breaker + verifikasi `X-Hub-Signature-256` sudah di-deploy. Jalur uang Samurai **tidak disentuh**. Apple masih **Pending**.

---

## Ringkasan eksekutif

| Area | Status | Detail |
|------|--------|--------|
| Engine Samurai (order / pay / refund) | ✅ LIVE | Tidak diubah gelombang ini |
| Console dashboard Blok 1.x | ✅ LIVE | Orders, anchors, QR, payments, customers |
| Social inbox Meta (4.1) | ✅ LIVE (gated) | Webhook nyata + draft Claude; `SOCIAL_SEND_ENABLED=0` |
| **AI Gateway + Router** | ✅ LIVE | `ai.run()` · filter→score · Anthropic writing |
| Meta App | ✅ **Published / Live** | App ID `943965434886796` · Page `1031895316670551` |
| Meta webhook security | ✅ LIVE | `X-Hub-Signature-256` + raw body (PR #39) |
| Social posting Stage 1 | ✅ LIVE | Manual approve; tidak auto-post |
| GBP reviews trial (4.2) | ✅ LIVE (gated) | Send stub |
| Legal pages | ✅ LIVE | `/privacy` · `/terms` · `/data-deletion` |
| Apple → TestFlight | ⏳ Ops | Membership **Pending** · Team `K4SAA2F25A` |
| OpenAI A/B untuk draft | ⏸️ Skip dulu | Claude dipakai; bandingkan OpenAI nanti |
| Kirin / Linton / Stripe / C5 / gift enable | ⏸️ HOLD | Bukan bug |
| Dashboard redesign (tab/pagination) | ⏳ OPEN | Masih scroll panjang — lihat backlog |
| Live Orders kitchen sync | ⏳ OPEN | Paid tetap `pending` di DB |
| Anchor health panel | 🔧 Fixed | Typo `anchored_24h` (lihat backlog #2) |

---

## Fokus gelombang ini — AI Gateway & Router (laporan utama)

### Mengapa dikerjakan

Routing AI statis (task → YAML → provider) terlalu kaku. Spec baru:  
**Task → AI Router → Policy(dinamis) → Provider**, dengan **filter dulu (mampu?) lalu skor (terbaik?)**.

Dokumen: `docs/SPEC_AI_GATEWAY.md` · `docs/SPEC_AI_ROUTER.md`  
Prompt: `docs/prompts/PROMPT_Social_Inbox_Draft.txt` (+ salinan di `artifacts/api-server/config/prompts/`)

### Arsitektur yang live

```
ai.run(task, tenantId, input)
  → guardrail pre (allergy/spam hard block)
  → AI ROUTER: RequestProfile → FILTER → SCORE → reason log
  → Provider adapter (local / openai / anthropic / …)
  → guardrail post + ai_usage_log
```

**Hard filter (contoh):** vision / OCR / context limit / embedding / provider `down`.  
**Soft score (contoh):** quality·language·cost·plan·SLA·degraded penalty.  
**Data, bukan if-else raksasa:** `config/ai-providers.json` + `config/ai-router-weights.json`.

### Fase yang sudah jalan

| Fase | Isi | Status |
|------|-----|--------|
| **Fase 1** | Profile + registry + filter/score + log alasan + multi-provider | ✅ |
| **Fase 2 (partial)** | Health dari `ai_usage_log` + circuit breaker; fallback chain di `run.ts` | ✅ |
| **Fase 3** | Dashboard distribusi provider / tuning bobot dari data / golden CI penuh | ⏳ Belum |

Ops health: `GET /api/social/ai-health` (auth dashboard / internal key) → `providerHealth` + breakers.

### Social draft — perilaku prod (bukti)

| Input | Hasil | Provider |
|-------|--------|----------|
| `Joni Haryono lets try tomorrow` | **skipped** (peer-to-peer — bukan “team will follow up”) | anthropic / `claude-sonnet-5` |
| `do you have ramen` (tidak di menu) | **pending_approval** + draft jujur “tidak ada di menu…” | sama |
| `Do you have 8 Oz Red Bull Energy?` | **pending_approval** + draft natural + order link | sama |

Router (tanpa env force): skor `anthropic/claude-sonnet-5` ≈ **14.3** > `local/rules-v1` ≈ **10** (strength `writing`).  
`AI_SOCIAL_DRAFT_PROVIDER` di prod **di-off** — keputusan lewat router.

### Observability & biaya (sampel uji)

- Setiap keputusan: log JSON `event=ai_router_decision` + **reason**.  
- Setiap call: baris `ai_usage_log` (tenant, task, provider, model, tokens, cost, latency, status).  
- Uji Claude: ~**$0.02 / draft**, latency ~**1.5–3 s**.  
- Human-approve **wajib**; `/send` tetap gated (`SOCIAL_SEND_ENABLED=0`).

### Rollback darurat

| Knob | Efek |
|------|------|
| `AI_GATEWAY_ENABLED=0` | Kembali ke template legacy saja |
| Cabut / invalid `ANTHROPIC_API_KEY` | Adapter anthropic `down` → fallback local (peer-skip tetap) |
| `SOCIAL_SEND_ENABLED` | Biarkan `0` sampai smoke send disetujui |

### Spec vs implementasi

| Spec | Implementasi |
|------|----------------|
| Pintu tunggal `ai.run()` | `artifacts/api-server/src/lib/ai/run.ts` |
| Filter lalu score | `src/lib/ai/router/{filter,score,route}.ts` |
| Capability registry | `config/ai-providers.json` |
| Bobot skor | `config/ai-router-weights.json` |
| Usage log | tabel `ai_usage_log` + `scripts/migrate-ai-usage-log.sql` |
| Wire social inbox | `draftReplyForRow()` → gateway (menu/lokasi tenant ikut ke prompt) |
| Verify unit/golden | `pnpm --filter @workspace/api-server run verify:ai-router` |

---

## Meta (ops + keamanan) — update sejak laporan malam 14 Jul

| Item | Status | Catatan |
|------|--------|---------|
| Basic settings (Privacy / Terms / Data deletion / Icon / Category) | ✅ | App `samuraimartinsville` |
| Identity verification | ✅ (ops) | Verified → Publish dimungkinkan |
| **Publish Dev → Live** | ✅ | Badge Published |
| Webhook komentar Page publik | ✅ | Contoh peer chat masuk `social_inbox` |
| Callback | ✅ | `https://samurairesto.com/api/social/webhooks/meta` |
| **X-Hub-Signature-256** | ✅ LIVE | Raw body + HMAC; bad→401 / good→200 (PR #39) |
| Graph **send** dari inbox | ⏸️ Off | Sengaja; human-approve saja |

**Page ID:** `1031895316670551` · **App ID:** `943965434886796`

---

## Checklist Blok vs instruksi (ringkas)

### ✅ Live / selesai (kode + deploy relevan)

| Blok | Status |
|------|--------|
| 1.x Dashboard / QR / Anchor / refund | ✅ |
| 3.1–3.3 OAuth skeleton / Support KB / i18n | ✅ |
| 4.1 Social inbox + posting Stage 1 | ✅ (send off) |
| 4.2 GBP skeleton | ✅ (send stub) |
| Legal pages | ✅ |
| **AI Gateway + Router + Claude social_draft** | ✅ **baru** |
| Meta signature webhook | ✅ **baru** |

### ⏳ Ops / pihak ketiga

| Item | Status |
|------|--------|
| Apple membership Active → EAS / TestFlight | ⏳ Pending |
| Square OAuth sandbox E2E (jangan timpa token live) | ⏳ |
| i18n native review th/my/ne/ar | ⏳ |
| Meta Graph send smoke (setelah approve operator) | ⏸️ Off |
| OpenAI A/B vs Claude untuk `social_draft` | ⏸️ Skip dulu |

### ⏸️ HOLD

- Kirin / Samurai Linton (Health Dept + foto menu)  
- Stripe Connect / delivery / payouts  
- C5 marketing SEND  
- Gift cards **enable**  
- GBP Stage 2 (Google OAuth)  
- Meta App Review untuk Page **klien**  
- AI Forecast / metrik palsu  

---

## PR masuk `main` (gelombang AI + Meta security)

| PR | Judul | Tip |
|----|-------|-----|
| [#35](https://github.com/Suhono-BranchlessPay/orderly-platform/pull/35) | AI Gateway + dynamic policy router | `71a19bd` |
| [#36](https://github.com/Suhono-BranchlessPay/orderly-platform/pull/36) | Fix Anthropic model `claude-sonnet-5` (+ no forbidden temperature) | `b4cbdf5` |
| — | Menu/lokasi tenant ke `social_draft` context | `d5be40b` |
| [#37](https://github.com/Suhono-BranchlessPay/orderly-platform/pull/37) | Honest “not on menu” reply (bukan escalate kosong) | `13d0fc5` |
| [#38](https://github.com/Suhono-BranchlessPay/orderly-platform/pull/38) | AI Router Fase 2 health monitor + circuit breaker | `7492259` |
| [#39](https://github.com/Suhono-BranchlessPay/orderly-platform/pull/39) | Meta webhook `X-Hub-Signature-256` | `2087853` |
| [#40](https://github.com/Suhono-BranchlessPay/orderly-platform/pull/40) | Laporan 15 Jul (awal) | `e9c9f61` |
| (amandemen) | Fix Anchor Health + backlog 7 item di laporan | tip setelah merge |

Deploy tip sebelumnya: `2087853`. Setelah amandemen ini: tip commit merge terbaru.

---

## Bukti UI (console)

Social inbox (`orderlyfoods.com/dashboard`) menampilkan draft Claude:

1. **Red Bull (ada di menu)** → draft “Yes, we have… order link” · `pending_approval` · Approve / Skip  
2. **Ramen (tidak di menu)** → draft jujur “We don't currently have ramen…” · `pending_approval`  
3. Badge **Human approve only** tetap aktif  

Ini menggantikan kegagalan produksi sebelumnya: peer chat dapat template generik “team will follow up”.

---

## Backlog yang sempat terlewat di draf laporan awal (dicek 15 Jul)

| # | Item | Status faktual (kode/prod) | Catatan |
|---|------|----------------------------|---------|
| 1 | **Dashboard redesign** (tab + pagination) — `INSTRUKSI_Dashboard_Redesign` | ⏳ **Belum** | Instruksi tidak ada di repo; `public/dashboard/index.html` masih satu halaman panjang (tanpa tab/pagination). Console masih “scroll panjang”. |
| 2 | **Anchor health: Unavailable** | 🔧 **Bug ditemukan → diperbaiki** | Root cause: typo `anchored_24h` (undefined) vs `anchored24h` di `anchorAlerts.ts` → API `/reports/anchor-health` 500. Fix di PR amandemen laporan ini. |
| 3 | **Live Orders semua “pending”** | ⏳ **Gap nyata** | Prod 14 hari: **24 paid** masih `status=pending` (hanya 1 completed). Board baca `orders.status` lokal; sync **Orderly→Square** ada (`syncSquareOrderFromOwnerStatus`), **Square dapur→Orderly belum** (tidak ada pull/webhook fulfillment state). |
| 4 | **Deep link ke item** (closed-loop promo) | ⏳ **Belum** | Social post pakai `/r/{slug}?src=…` → menu umum, **bukan** deep-link item (`socialPostDraft.buildTrackedUrl`). Post 1 item → landing katalog. |
| 5 | **Menu sync Square + import saat OAuth** | ✅ Sync live · ✅ OAuth trigger ada | ~**99** item available Samurai. Self-serve: `triggerMenuSyncForTenantId(..., "square_oauth_callback")` saat OAuth sudah punya `tenantId`; draft session sync di `/publish`. E2E “tenant baru dari nol” masih perlu smoke ops. |
| 6 | **Google Order Online** | ✅ Kode atribusi · ⏳ Ops GBP | Doc `BLOK_C1_GOOGLE_ORDER_ONLINE.md`; storefront first-touch UTM + `channel=google` sudah ada. **Link di Google Business Profile = aksi Malik** (bukan API). Belum dikonfirmasi apakah URL Orderly sudah dipasang di GBP. |
| 7 | **Alexis Wirch · 0 orders** | ⏳ Anomali terbuka | Customer `88a23450-…` · Alexis Wirch · phone `7792478099` · `order_count=0` · created `2026-07-08`. Belum dibersihkan (bisa orphan dari checkout gagal / customer row tanpa order ter-link). |

---

## Aksi berikutnya (urutan — diperbarui)

1. **Deploy fix Anchor Health** (bug #2) — verifikasi panel tidak lagi “Unavailable”.  
2. **Apple** — tunggu membership Active → EAS / TestFlight.  
3. **Prioritas produk terbuka (tanya Malik urutan):**  
   - Dashboard redesign (tab + pagination)  
   - Square fulfillment → Orderly status sync (Live Orders)  
   - Deep-link item di social/QR closed-loop  
   - Konfirmasi GBP Order Online URL (ops 5 menit)  
   - Bersihkan / investigasi Alexis Wirch  
4. **Social send** — hanya setelah operator siap.  
5. **Opsional AI** — A/B OpenAI; dashboard distribusi provider.  
6. **HOLD tetap HOLD.**

---

## Aturan yang tetap dipegang

- Branch + PR; tidak commit secret  
- Tidak ubah jalur uang tanpa review manusia  
- Tidak mengarang metrik  
- Social / GBP send **off** sampai smoke terkendali  
- AI social = draft + human-approve; allergy/spam hard-block sebelum LLM  

---

## Dokumen terkait

- `docs/SPEC_AI_GATEWAY.md`  
- `docs/SPEC_AI_ROUTER.md`  
- `docs/prompts/PROMPT_Social_Inbox_Draft.txt`  
- `docs/BLOK4_SOCIAL_TRIAL.md`  
- `docs/BLOK4_GBP_TRIAL.md`  
- `docs/BLOK6_IOS_STORE_PREP.md`  
- `docs/C7_Meta_API_Registration_Checklist.md`  
- `docs/ORDERLY_SUMBER_KEBENARAN.md`  

---

## Satu kalimat untuk Verry / Malik

**AI Gateway + Claude social draft live (human-approve); Meta Live + signature OK; send off; Apple Pending — dan backlog terbuka: dashboard masih scroll panjang, Live Orders stuck pending (belum sync dapur Square), deep-link item belum, GBP Order Online perlu konfirmasi ops, plus bug Anchor Health yang baru diperbaiki.**

---

*Laporan 15 Jul 2026 (amandemen backlog). Fokus gelombang AI/Meta tetap; tujuh item terlewat kini punya status faktual di tabel di atas.*
