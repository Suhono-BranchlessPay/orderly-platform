# Client Dashboard (/client) + Kitchen Display (KDS) — Foundation

**Branch:** `feat/client-dashboard-kds-foundation`
**Scope:** Foundation only (tenant isolation + skeleton + prep settings + KDS).
Full `/client` "Big Business" features are intentionally **deferred** until the
vision is defined — do not build them here (avoid 2x work).

Rules honored: branch + PR · no secrets in code · money path not changed
(one additive, reversible pause guard, flagged below) · no invented metrics ·
**tenant isolation enforced in the backend**.

---

## 1. Tenant isolation (the critical part)

- New role **`client_owner`** in the existing `dashboard_users` table, with a
  **mandatory** `tenant_id`. Sessions reuse `dashboard_sessions`.
- Separate cookie **`orderly_client_session`** (never shared with the master
  console cookie `orderly_dashboard_session`).
- **`master` is rejected on /client** — no null-tenant / "see everything" path
  exists in client auth. Master uses `/dashboard`.
- **Every** `/api/client/*` query is scoped to `session.tenantId` ONLY. The
  tenant is never read from a URL/query/body param.
- KDS status writes re-check ownership: the order must belong to the session's
  tenant, else **404** (before any mutation), plus `applyKitchenStatus` filters
  by `tenantId` again (defense in depth).
- `/api/client/*` is exempt from the Host tenant middleware — session is the
  single source of truth.

### Hard isolation test (run before go-live)

```bash
# Owner A logs in (tenant samurai) → cookie jar A.
curl -sic cookiesA.txt -X POST https://HOST/api/client/login \
  -H 'content-type: application/json' \
  -d '{"email":"ownerA@...","password":"..."}'

# 1) Can only see own tenant's board:
curl -s -b cookiesA.txt https://HOST/api/client/kds/orders | jq '.tenant_id'   # == samurai

# 2) Cannot mutate another tenant's order (use a kirin order id):
curl -s -b cookiesA.txt -X PATCH https://HOST/api/client/kds/orders/<KIRIN_ORDER_ID>/status \
  -H 'content-type: application/json' -d '{"status":"ready"}'
# EXPECT: 404 {"error":"Order not found"}

# 3) A master account cannot log into /client:
curl -s -X POST https://HOST/api/client/login -H 'content-type: application/json' \
  -d '{"email":"master@...","password":"..."}'
# EXPECT: 401
```

---

## 2. What shipped

### Backend (`artifacts/api-server`)
- `src/lib/clientAuth.ts` — client_owner login/session/seed (reuses dashboard tables).
- `src/lib/kitchenSettings.ts` — per-tenant prep settings + pickup estimate.
- `src/routes/client.ts` — `/api/client`:
  - `POST /login`, `POST /logout`, `GET /me`
  - `GET /summary?range=today|7d|28d|30d` — today's orders/sales/tips + live counts (scoped)
  - `GET|PATCH /settings/kitchen` — prep time / busy mode / pause
  - `GET /kds/orders` — active board (pending/preparing/ready) with lines (scoped)
  - `PATCH /kds/orders/:id/status` — Accept/Ready/Done/Cancel (reuses `applyKitchenStatus`)
- `GET /api/kitchen/estimate` — public, Host-scoped pickup estimate for the storefront.
- Additive `orders_paused` guard in `POST /api/orders` (see §4).

### DB (`lib/db`)
- `kitchen_settings` table (`schema/kitchenSettings.ts`).
- Migration: `scripts/migrate-kitchen-settings.sql` (additive, `CREATE TABLE IF NOT EXISTS`).

### UI (static pages served by Express, host-agnostic, `noindex`)
- `public/client/index.html` — owner login + today summary + kitchen settings.
- `public/kds/index.html` — kanban (New/Preparing/Ready), big cards, running
  timers (green→yellow→red vs estimate), **sound on new order** (WebAudio),
  **wake lock**, 8s polling, one-tap Accept/Ready/Done/Cancel, channel icons.

---

## 3. Deploy

```bash
# 1) Migrate (additive)
psql "$DATABASE_URL" -f scripts/migrate-kitchen-settings.sql

# 2) Seed a client owner (env on the API process), then restart:
ORDERLY_CLIENT_OWNER_EMAIL="owner@samurairesto.com"
ORDERLY_CLIENT_OWNER_PASSWORD="<strong>"
ORDERLY_CLIENT_OWNER_NAME="Samurai Owner"
ORDERLY_CLIENT_OWNER_TENANT_ID="samurai"

# 3) Build + restart API. Pages resolve from artifacts/api-server/public/{client,kds}.
```

Kitchen tablet: open `https://samurairesto.com/kds`, sign in once, tap 🔔 once
to unlock sound. Owner: `https://samurairesto.com/client`.

---

## 4. Flags for human review

- **Live Orders / KDS solves the "stuck pending" gap** the honest way: status is
  set from the KDS in Orderly (not waiting for a Square kitchen→Orderly sync).
  Setting Ready/Done still pushes to Square via the existing `applyKitchenStatus`.
- **Pause orders touches the order path (additively).** `POST /api/orders`
  returns **409 `orders_paused`** BEFORE any Square charge or DB write when the
  owner has paused. No payment logic changed; fully reversible via the toggle.
- **KDS "Cancel" sets status `cancelled` but does NOT auto-refund.** Refund stays
  the explicit owner action (`POST /api/owner/orders/:id/refund`) so a tablet tap
  can't move real money. Wire auto-refund only after review if desired.
- Online prepaid orders are created at status `preparing`, so they appear in the
  **Preparing** column immediately; the **New** column holds anything still `pending`.

## 5. Not done here (by design)
- Full owner reporting / settings (waiting on "Big Business" vision).
- Customer real-time web status page + mobile push wiring for "Ready" beyond the
  existing Expo push already fired by `applyKitchenStatus`.
- Storefront UI display of the pickup estimate (endpoint is ready: `/api/kitchen/estimate`).
