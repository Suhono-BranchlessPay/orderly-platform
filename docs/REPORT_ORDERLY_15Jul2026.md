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

Deploy tip prod: **`2087853`**. Smoke: healthz 200 · dashboard 200 · `verify:ai-router` pass · Meta sig bad/good 401/200 · `ai-health` anthropic=healthy.

---

## Bukti UI (console)

Social inbox (`orderlyfoods.com/dashboard`) menampilkan draft Claude:

1. **Red Bull (ada di menu)** → draft “Yes, we have… order link” · `pending_approval` · Approve / Skip  
2. **Ramen (tidak di menu)** → draft jujur “We don't currently have ramen…” · `pending_approval`  
3. Badge **Human approve only** tetap aktif  

Ini menggantikan kegagalan produksi sebelumnya: peer chat dapat template generik “team will follow up”.

---

## Aksi berikutnya (urutan)

1. **Apple** — tunggu membership Active → EAS / TestFlight (`docs/BLOK6_IOS_STORE_PREP.md`).  
2. **Social send** — hanya setelah operator siap; tetap gate ketat + audit.  
3. **Opsional AI** — A/B OpenAI vs Claude (data, bukan asumsi); dashboard distribusi provider (Fase 3).  
4. **Blok 4 sisa kode** — Page-ID→tenant registry; retry/backoff Meta `/send`.  
5. **HOLD tetap HOLD.**

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

**AI Gateway + Router live dengan Claude untuk draft social (peer=skip, menu=fakta, human-approve); Meta Live + signature webhook aman; send masih off; Apple masih Pending — jalur uang tidak disentuh.**

---

*Laporan 15 Jul 2026. Fokus gelombang: AI Gateway/Router + Meta Live security. Tidak ada gap kode mendesak untuk merge selain sisa Blok 4 opsional di atas.*
