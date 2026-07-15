# SPEC — AI Gateway Orderly (Otak Sentral, Vendor-Agnostic)

**Audience:** Verry  
**Status:** Fase 1 in progress (scaffold + `social_draft` via `ai.run` + dynamic router)  
**Related:** `docs/SPEC_AI_ROUTER.md` · `docs/prompts/PROMPT_Social_Inbox_Draft.txt` · `artifacts/api-server/src/lib/ai/`

---

## Tujuan

Satu lapisan abstraksi AI supaya:

1. Fitur tidak terkunci ke satu vendor  
2. Model bisa diganti tanpa mengubah fitur  
3. Biaya terkontrol  
4. Tugas berbeda pakai model tepat  

**Prinsip inti:** Fitur memanggil `ai.run(task, input)` — **bukan** `openai.chat()` / `anthropic.messages()` langsung. Vendor dipilih di belakang gateway, dari config.

⚠️ Platform long-tail tidak boleh terkunci ke satu vendor. Gateway = asuransi.

---

## 1. Aturan emas

| Aturan | Detail |
|--------|--------|
| ❌ Tidak ada SDK vendor di luar gateway | Import OpenAI/Anthropic/Google di luar `src/lib/ai/` → tolak di review |
| ✅ Model dipilih Router (policy dinamis) | Capability registry + filter/score — lihat `SPEC_AI_ROUTER.md` |
| ✅ API key hanya di secrets server | Tidak di frontend / app |
| ✅ Setiap panggilan di-log | task, model, token, biaya, latency, tenant |
| ✅ Fallback | Model utama gagal/timeout → cadangan |

---

## 2. Arsitektur

```
FITUR (social draft · menu-from-photo · classify · insight · …)
        │  ai.run({ task, tenantId, input, opts })
        ▼
AI GATEWAY
  1. Guardrails (pre): block terlarang (allergy/health)
  2. AI ROUTER → RequestProfile → FILTER → SCORE → provider
     (lihat docs/SPEC_AI_ROUTER.md — menggantikan routing task→YAML statis)
  3. Build request (prompt + params)
  4. Call provider adapter
  5. Guardrails (post): validasi output
  6. Log ai_usage_log (+ alasan keputusan router)
  7. Fallback chain dari ranking router
        │
   OpenAIAdapter · ClaudeAdapter · LocalAdapter · (Gemini later)
```

---

## 3. Interface

Lihat implementasi: `artifacts/api-server/src/lib/ai/types.ts` + `run.ts`.

Tasks Fase 1+:

| Task | Tujuan |
|------|--------|
| `social_draft` | Draft balasan sosmed (JSON classify+draft) |
| `review_draft` | Draft balasan Google review |
| `classify` | Klasifikasi cepat |
| `menu_from_photo` | Vision ekstrak menu |
| `menu_description` | Deskripsi item |
| `customer_insight` | Analisa (jarang, model kuat) |
| `upsell` | Saran pelengkap (utamakan non-LLM dulu) |
| `embedding` | Vektor semantic search |
| `support_answer` | Jawab dari KB |

---

## 4. Routing (DIGANTI — lihat SPEC_AI_ROUTER)

Routing **statis** task→provider **diganti** oleh AI Router dinamis:

- Capability registry: `config/ai-providers.json`  
- Bobot skor: `config/ai-router-weights.json`  
- Kode: `src/lib/ai/router/`  

**Filter (hard) dulu → Score (soft) kemudian.**  
Detail lengkap: [`docs/SPEC_AI_ROUTER.md`](./SPEC_AI_ROUTER.md).

---

## 5. Kontrol biaya

- Tabel `ai_usage_log` — setiap panggilan  
- Nanti: dashboard master biaya per tenant / task / hari  
- Budget cap, rate limit, cache, batch — Fase 2–3  
- Pakai model termurah yang cukup; LLM hanya saat butuh bahasa  

---

## 6. Guardrails

**Pre:** allergy/health/halal → jangan kirim ke vendor (sudah di `social.ts` + gateway pre).  
**Post:** JSON schema valid; draft kosong untuk skip/escalate; tidak klaim terlarang.  
**Publik:** human approve untuk sosmed — `SOCIAL_SEND_ENABLED` tetap off default.

---

## 7. Roadmap

### Fase 1 (sekarang)

- [x] SPEC + prompt di repo  
- [x] `ai.run()` + routing JSON  
- [x] Adapter local + OpenAI/Anthropic (fetch)  
- [x] `ai_usage_log` schema + migration  
- [x] Migrasi `social_draft` → `ai.run("social_draft")`  
- [x] Peer-to-peer SKIP (kasus produksi 14 Jul)  

### Fase 2

- Adapter Gemini  
- classify / menu_from_photo / review_draft / support_answer  
- Dashboard biaya AI  
- Cache + batch  

### Fase 3

- Budget cap per tenant  
- A/B `modelOverride`  
- Fallback chain matang  

---

## 8. Verifikasi

1. Tidak ada import vendor di luar `src/lib/ai/`  
2. Ganti model `social_draft` di JSON → perilaku berubah tanpa ubah fitur  
3. Panggilan tercatat di `ai_usage_log`  
4. Allergy/health tidak sampai ke vendor  
5. Provider utama down → fallback  
6. (Fase 2) Biaya per tenant di dashboard  

---

## 9. Env (Fase 1)

| Env | Default | Arti |
|-----|---------|------|
| `AI_GATEWAY_ENABLED` | `1` setelah deploy Fase 1 | `0` = social pakai path template lama (emergency) |
| `OPENAI_API_KEY` | unset | Aktifkan adapter OpenAI |
| `ANTHROPIC_API_KEY` | unset | Aktifkan adapter Anthropic |
| `AI_SOCIAL_DRAFT_PROVIDER` | `local` | Override primary provider untuk social_draft |

Tanpa API key, `local` rules+template tetap jalan (termasuk peer SKIP).

---

*SPEC diselaraskan dengan dokumen operasional Orderly 14 Jul 2026. Gateway = fondasi “otak sentral” tanpa vendor lock-in.*
