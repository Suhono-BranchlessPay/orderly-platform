# Tenant onboarding checklist (formal)

**Source of truth for outlet #3–#27.** Written after Kirin’s near-miss: missing Square creds fail-opened into Samurai’s global `SQUARE_*` and would have taken real money.

Use with [`GO_LIVE_CHECKLIST.md`](./GO_LIVE_CHECKLIST.md). Do not invent “ready.”

---

## P0 — money isolation (fail-closed)

| # | Check | How to verify |
|---|--------|----------------|
| 1 | **Square credentials are tenant-scoped** | `TENANT_{SLUG}_SQUARE_ACCESS_TOKEN`, `_LOCATION_ID`, `_APPLICATION_ID`, `_ENVIRONMENT` **or** a `square_oauth_connections` row for that tenant. **Never** rely on bare `SQUARE_*`. |
| 2 | **No credential borrow** | `curl -H "Host: <domain>" …/api/square/config` → `enabled:false` until that tenant’s creds exist. Must **not** return another outlet’s `locationId`. |
| 3 | **OAuth scopes (if OAuth path)** | `ITEMS_READ`, `ITEMS_WRITE`, `ORDERS_READ`, `ORDERS_WRITE`, `PAYMENTS_READ`, `PAYMENTS_WRITE`, `MERCHANT_PROFILE_READ`, `REPORTING_READ` |
| 4 | **Tax rate on tenant row** | `tenants.tax_rate` set (decimal). NULL → checkout refuses (`tax_rate_unconfigured`); storefront shows “online ordering isn’t available yet” (not a raw server-error page). **Never** copy Indiana 7% onto a Kentucky (or other) outlet. **Never** copy Morgan County (Samurai Martinsville) onto Greene County (Samurai Linton) without verifying the local rate. |
| 5 | **Paid smoke (4 checks)** | Cellular → pay small order on **this host** → (1) Square Order Hub = **this** merchant/location, (2) tax cents = local rate, (3) BP anchor for **this** `tenant_id`, (4) KDS shows order under **this** tenant. |

Stop condition: any unexplained money/tax mismatch → no further outlets until root cause is known.

---

## P0 — identity & host

| # | Check |
|---|--------|
| 6 | Tenant DB row: `slug`, `name`, `domain`, `status=active`, `anchor_mode` intentional |
| 7 | DNS A/CNAME → prod VPS; TLS cert valid |
| 8 | Nginx proxies HTML + `/api` with `Host` preserved (not static SPA-only) |
| 9 | SEO title/canonical/OG match **this** restaurant (not Samurai) |
| 10 | Deploy only via `bash scripts/deploy-samurai-main.sh` |

---

## P1 — catalog & storefront

| # | Check |
|---|--------|
| 11 | Catalog in Square (SKU convention `{OUTLET}-{CAT}-{NNN}`; Samurai exempt) |
| 12 | Menu sync → Orderly; every item has SKU; prices human-checked |
| 13 | Required choices = Square modifiers (not description prose) |
| 14 | Hours in `tenants.hours` / theme (not TBD) |
| 15 | Brand assets: logo, favicon, hero, og (paths exist on disk) |
| 16 | Photos for sellable items (or honest “needs photo” ops plan) |

---

## P1 — ops access

| # | Check |
|---|--------|
| 17 | `orderlyfoods.com/dashboard`: master sees tenant; manager/client_owner scoped to this `tenant_id` |
| 18 | `/client` + `/kds` login works on **restaurant host** |
| 19 | Owner refund path known (Cancel ≠ auto-refund) — written SOP |
| 20 | Pause orders / 86 path known |

---

## P2 — growth & reports

| # | Check |
|---|--------|
| 21 | Daily report tenant entry (`DAILY_REPORT_TENANTS`) + verified FROM domain |
| 22 | Meta page map / CAPI only via `TENANT_{ID}_META_*` (fail-closed — already) |
| 23 | GBP / GSC properties for this domain when in scope |
| 24 | Mobile tenant pack if app is in scope |

---

## Anti-patterns (do not ship)

1. **Fail-open credentials** — missing `TENANT_{SLUG}_SQUARE_*` falling back to global `SQUARE_*`.
2. **Fail-open tax** — hardcoded `0.07` for every host.
3. **Clone Samurai menu** into another tenant.
4. **Ad-hoc VPS deploy** that skips `deploy-samurai-main.sh` (silent asset loss).
5. **Declare go-live** without a paid test on the restaurant’s own Square location + tax.
6. **Tax dual-source silence** — Orderly `tenants.tax_rate` (order-scoped Square tax) and Square catalog tax must agree. CreateOrder now reconciles `total_tax_money` vs Orderly cents **before charge**; mismatch cancels the unpaid Square order and logs `square_tax_mismatch` (fail loud).

---

## Kirin snapshot (20 Jul 2026)

| Item | Status |
|------|--------|
| Domain / SSL / SEO shell | Done (`kirinhibachiexpress.com`) |
| Square / `TENANT_KIRIN_SQUARE_*` | Live — smoke `2DAD9ECA` Orderly=Square tax 6% |
| `tax_rate` KY | **0.06** |
| Catalog / menu sync | 70 SKUs live |
| Hours | Set (Mon closed; Tue–Thu/Sun 11–9; Fri–Sat 11–10) |
| Health Dept | Cleared — preparing to open |
| Ops user `/client`+`/kds`, hero/OG, menu photos | Still open for soft open |
| Samurai Linton `tax_rate` | **NULL** — Greene County IN; do **not** assume = Morgan County 7% |

### Deploy safety (env before code)

`scripts/deploy-samurai-main.sh` now: pull → **preflight** `TENANT_SAMURAI_SQUARE_*` → build → assets → `pm2 delete`+`start` → postflight `enabled:true`.  
For 27 outlets: install new env → verify readable → only then activate code that requires it.

---

*Last updated: 20 Jul 2026 — incident window + deploy preflight + Steak/Linton tax notes.*
