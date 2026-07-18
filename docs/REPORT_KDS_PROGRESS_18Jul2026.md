# Report: Client Dashboard + KDS — Progress vs Instruction

**Date:** 18 Jul 2026  
**Spec:** `docs/BLOK_CLIENT_KDS_FOUNDATION.md`  
**Foundation PR:** [#53](https://github.com/Suhono-BranchlessPay/orderly-platform/pull/53) (merged earlier)  
**Follow-up (ops + storefront + Square prep):** branch `fix/kds-ops-and-estimate`

---

## Verdict

**Foundation KDS sudah LIVE di production** setelah gap ops ditutup hari ini. Kode foundation (PR #53) sudah di `main` sejak 16 Jul, tapi VPS belum di-migrate / di-seed owner — itu yang membuat estimate 500 dan `/client` login belum bisa dipakai.

| Area | Status |
|------|--------|
| Tenant isolation + `/api/client/*` + `/kds` UI | ✅ LIVE |
| Table `kitchen_settings` + seed Samurai | ✅ LIVE (ops 18 Jul) |
| Client owner login seed | ✅ LIVE (ops 18 Jul) |
| `GET /api/kitchen/estimate` | ✅ LIVE (`10–20 min` @ 15 min prep) |
| Storefront pickup estimate UI + pause banner | ✅ code (deploy with follow-up PR) |
| Square `prep_time_duration` from kitchen settings | ✅ code (deploy with follow-up PR) |
| Full Big Business `/client` reporting | ⏸️ deferred by design |
| Customer real-time status page | ⏸️ deferred by design |
| Cancel → auto-refund | ⏸️ deferred by design (safety) |

---

## Checklist vs instruction (`BLOK_CLIENT_KDS_FOUNDATION.md`)

### 1. Tenant isolation

| Item | Status | Evidence |
|------|--------|----------|
| Role `client_owner` + mandatory `tenant_id` | ✅ | Seeded user `owner@samurairesto.com`, role `client_owner`, tenant `samurai` |
| Cookie `orderly_client_session` (separate from master) | ✅ | Code in `clientAuth.ts` |
| Master rejected on `/client` | ✅ | Spec + unit/isolation tests from PR #53 |
| Every `/api/client/*` scoped to session tenant | ✅ | `client.ts` |
| KDS status write re-checks ownership → 404 | ✅ | `applyKitchenStatus` + route guard |
| Hard isolation test runnable | ✅ ready | Cookie jar A → board `tenant_id=samurai`; cross-tenant PATCH → 404 |

### 2. Backend shipped

| Item | Status |
|------|--------|
| `clientAuth.ts` login/session/seed | ✅ |
| `kitchenSettings.ts` + defaults | ✅ (+ harden: DB miss → defaults, no 500) |
| `/api/client` login/logout/me/summary/settings/kds | ✅ |
| `GET /api/kitchen/estimate` | ✅ LIVE after migrate |
| `orders_paused` soft gate on `POST /api/orders` | ✅ (409 before Square charge) |

### 3. DB

| Item | Status |
|------|--------|
| Schema `kitchen_settings` | ✅ |
| Migration `scripts/migrate-kitchen-settings.sql` | ✅ **ran on VPS 18 Jul** |
| Samurai row (15 min, not busy, not paused) | ✅ |

### 4. UI

| Item | Status |
|------|--------|
| `https://samurairesto.com/client` | ✅ HTTP 200 — owner login + summary + kitchen settings |
| `https://samurairesto.com/kds` | ✅ HTTP 200 — kanban, timers, sound, wake lock, polling |
| Storefront shows estimate from `/api/kitchen/estimate` | ✅ implemented in `order.tsx` (deploy follow-up) |

### 5. Deploy (instruction §3)

| Step | Status (18 Jul) |
|------|----------------|
| `psql … migrate-kitchen-settings.sql` | ✅ done |
| `ORDERLY_CLIENT_OWNER_*` in API env | ✅ done (ecosystem, not git) |
| Build + restart API | ✅ PM2 restart; pages + estimate + login smoke OK |

### 6. Flags for human review (unchanged)

- KDS status is source of truth for “stuck pending” (Orderly → Square via `applyKitchenStatus`).
- Pause is additive soft gate only — no payment logic change.
- **Cancel does NOT auto-refund** (explicit owner refund path only).
- Prepaid web orders land in **Preparing**; unpaid/pending stay in **New**.

### 7. Not done here (by design — do not treat as incomplete KDS)

- Full owner reporting / “Big Business” `/client`
- Customer real-time web status + extra mobile push beyond existing Expo ready push
- Daily-report KDS metrics (Fase 2)
- Auto-refund on Cancel

---

## What was broken / incomplete before today

| Gap | Before | After |
|-----|--------|-------|
| `kitchen_settings` table | Missing → estimate **500** | Created + Samurai seeded |
| `ORDERLY_CLIENT_OWNER_*` | Not set → no owner login | Seeded; login smoke **200** |
| Storefront estimate UI | Spec explicitly “endpoint ready, UI not” | UI wired (code) |
| Square prep duration | Hardcoded `PT20M` | Uses kitchen settings (busy-aware) |
| Estimate resilience | 500 if table missing | Defaults on read failure |

---

## Production smoke (18 Jul, VPS `2e1d138` + ops)

```
GET /kds          → 200
GET /client       → 200
GET /api/kitchen/estimate
  → {"orders_paused":false,"prep_time_minutes":15,"busy_mode":false,
     "estimate":{"min_minutes":10,"max_minutes":20,"label":"10–20 min"}}
POST /api/client/login → client_owner / samurai
GET  /api/client/kds/orders → tenant_id=samurai + active board
```

Kitchen tablet: open `https://samurairesto.com/kds`, sign in once, tap 🔔 once for sound.  
Owner: `https://samurairesto.com/client`.

**Owner credentials:** generated on VPS into `ecosystem.config.cjs` only (not committed). Delivered to operator in chat — rotate after handoff if needed.

---

## Follow-up code (this branch)

1. Harden `getKitchenSettings` + estimate route (never 500 public storefront).
2. Pass effective prep minutes into Square `prep_time_duration`.
3. Storefront: show “Ready in about X–Y min”, pause banner, disable Pay when paused.
4. Unit test for `toSquarePrepTimeDuration`.

Deploy path: merge PR → `git pull` on VPS → build api-server + samurai-resto → PM2 restart.

---

## How to use (Malik / kitchen)

1. Tablet Chrome → `https://samurairesto.com/kds` → login owner → allow sound.
2. Phone/laptop → `https://samurairesto.com/client` → set prep time / busy / pause orders.
3. New web orders appear on KDS; Accept → Ready → Done. Cancel does **not** refund automatically.

---

## Risk / money path

- No change to Square charge / tip / refund math.
- Pause remains pre-charge 409 only.
- Cancel still status-only.
- Secrets stay in VPS ecosystem, not git.
