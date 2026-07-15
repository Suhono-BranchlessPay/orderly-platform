# SPEC — AI Router Orderly (Routing Dinamis Berbasis Kebijakan)

**Audience:** Verry  
**Menggantikan:** bagian routing statis di `docs/SPEC_AI_GATEWAY.md` (§4)  
**Sisa gateway** (adapter, logging, guardrails, cost) **TETAP berlaku.**

---

## Perubahan inti

| | |
|--|--|
| **LAMA** | Task → Config(YAML/JSON statis) → Provider |
| **BARU** | Task → **AI ROUTER** → Policy(dinamis) → Provider |

Router memilih provider berdasarkan kondisi runtime, bukan cuma jenis task:  
token · image · OCR · language · tenant plan · SLA · latency · budget · provider health.

---

## 1. Prinsip: HARD CONSTRAINT vs SOFT PREFERENCE

Keputusan routing = **DUA tahap**. Jangan dicampur (kalau dicampur → bug “model murah untuk gambar” padahal model itu tak bisa vision).

### Tahap 1 — FILTER (hard constraints)

Buang provider yang **TIDAK MAMPU**. Sifat wajib dari input. Tidak bisa dikompromi.

- image present → hanya provider dengan kapabilitas `vision`
- ocr needed → hanya provider OCR-kuat
- tokens > model_context_limit → hanya yang muat
- needs_embedding → hanya model embedding
- provider health = down → buang

Hasil: daftar kandidat yang MAMPU. Kalau kosong → error/fallback jelas (`NO_CANDIDATE`).

### Tahap 2 — SCORE (soft preferences)

Pilih **TERBAIK** dari kandidat. Preferensi bisnis & runtime. Bisa kompromi.

- budget tenant (sisa anggaran) → prefer murah kalau anggaran menipis
- tenant plan (free → murah; premium → kualitas)
- SLA / latency (premium → cepat)
- kualitas untuk task (writing → natural; classify → murah cukup)
- language (prefer model kuat di bahasa itu)
- cost per token

Hasil: provider dengan skor tertinggi.

⚠️ **ATURAN:** filter dulu (mampu?), baru skor (terbaik?). Jangan pernah skor sebelum filter.

---

## 2. Arsitektur

```
ai.run(task, tenantId, input, opts)
        │
        ▼
┌──────────────────────────────────────────────┐
│  AI ROUTER                                    │
│  1. Analisa input → RequestProfile            │
│  2. Muat context: plan, budget, SLA, health   │
│  3. FILTER (hard) → kandidat yang MAMPU       │
│  4. SCORE (soft) → ranking                    │
│  5. Pilih #1 (+ fallback dari sisa)           │
│  6. LOG keputusan + ALASAN                    │
└───────────────┬──────────────────────────────┘
                ▼
        Provider Adapter (gateway)
                ▼
        OpenAI · Claude · Gemini · DeepSeek · Local · …
                ▲
   ┌────────────┴────────────┐
   │  HEALTH MONITOR         │  circuit breaker (Fase 2)
   └─────────────────────────┘
```

Alur penuh gateway:  
`ai.run()` → guardrail pre → **ROUTER** → adapter → guardrail post → log.

---

## 3. RequestProfile

```ts
interface RequestProfile {
  task: AiTask;
  estimatedInputTokens: number;
  maxOutputTokens: number;
  hasImage: boolean;
  needsOcr: boolean;
  needsEmbedding: boolean;
  language: string;
  realtime: boolean;
}
```

---

## 4. RoutingContext

```ts
interface RoutingContext {
  tenantPlan: "free" | "standard" | "premium";
  budgetRemainingUsd: number;
  slaTier: "best_effort" | "standard" | "guaranteed";
  providerHealth: Record<string, ProviderHealth>;
}
// ProviderHealth: { status: "healthy"|"degraded"|"down", p95LatencyMs, errorRate }
```

---

## 5. Provider capability registry (DATA, bukan if-else)

File: `artifacts/api-server/config/ai-providers.json`  
(JSON zero-dep; ekuivalen YAML di SPEC asli.)

Menambah/ganti provider = ubah file ini. Router generik tidak berubah.  
Nama model = placeholder yang diuji Verry — kekuatan model berubah tiap bulan.

---

## 6–7. Logika filter + skor

Lihat implementasi: `artifacts/api-server/src/lib/ai/router/`.  
Bobot skor di `config/ai-router-weights.json` — tuning tanpa ubah kode.

---

## 8. Health monitor (Fase 2)

Komponen terpisah: error rate, p95 latency, circuit breaker → `healthy | degraded | down`.  
Tanpa ini, filter health tidak berfungsi. Fase 1: health = adapter `isAvailable()` + stub healthy.

---

## 9. Observability

Setiap keputusan di-log dengan **ALASAN**:

```json
{
  "task": "social_draft",
  "tenant": "samurai",
  "chosen": { "provider": "local", "model": "rules-v1" },
  "reason": "no image; local available; free-plan cost preference",
  "candidates_considered": ["local/rules-v1", "openai/gpt-4o-mini"],
  "fallbacks": ["openai/gpt-4o-mini"]
}
```

---

## 10. Testing (wajib)

Jalankan: `cd artifacts/api-server && node ./scripts/verify-ai-router.mjs`

- Unit filter: image → hanya vision; token besar → context besar; down → dibuang  
- Unit skor: free → murah; premium → kualitas; budget menipis → murah  
- Fallback: #1 gagal → #2 (chain di `run.ts`)  
- NO_CANDIDATE: error jelas  
- Golden cases di CI (Fase 3)

---

## 11. Contoh keputusan (ilustrasi)

| Input | Filter | Skor menang | Alasan |
|-------|--------|-------------|--------|
| Komentar sosmed, en, free | chat | murah natural | free → cost |
| Komentar, premium | chat | writing terbaik | premium → quality |
| Foto menu | vision only | vision sehat | image filter |
| OCR struk | OCR only | OCR terbaik | needsOcr |
| Klasifikasi spam | chat | termurah | cost |
| Provider utama down | utama dibuang | sehat berikutnya | health |

---

## 12. Hubungan dengan Gateway

| Layer | Peran |
|-------|--------|
| **Gateway** | Pintu `ai.run()`, adapter, logging, guardrails, cost |
| **Router** | Otak pemilih provider **di dalam** gateway (ganti §4 statis) |
| **Guardrails / human-approve** | Tetap dari gateway, berlaku apa pun provider yang dipilih |

---

## 13. Bertahap

### Fase 1 — Router dasar (sekarang)

- [x] RequestProfile + capability registry  
- [x] Filter (hard) + skor sederhana (cost + quality + plan)  
- [x] Logging keputusan + alasan  
- [x] 2–3 provider (local, openai, anthropic)

### Fase 2 — Runtime-aware

- Health monitor + circuit breaker (Fase 1: `adapter.isAvailable()` → healthy/down)  
- Budget-aware scoring per tenant (Fase 1: env default `AI_BUDGET_REMAINING_USD_DEFAULT`)  
- Fallback chain matang — **partial:** `run.ts` walks router fallbacks on adapter failure

### Fase 3 — Matang

- SLA/latency-aware  
- Tuning bobot dari data  
- Golden test CI + dashboard distribusi  

---

## 14. Ringkas untuk Malik

Router dinamis benar — routing statis terlalu kaku. Kunci desain:

1. **Filter dulu, skor kemudian** — jangan campur  
2. **Data-driven** — pengetahuan provider di config; router generik  
3. **Health monitor terpisah** — “provider health” hanya berfungsi kalau ada yang memantau  
4. **Setiap keputusan punya ALASAN** — bukan kotak hitam  

Dengan ini engine memilih AI terbaik per request/kondisi — tetap bisa di-debug, di-tuning, diganti tanpa membangun ulang.
