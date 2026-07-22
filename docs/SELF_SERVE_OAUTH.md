# Self-serve OAuth (Square + Meta Page)

## Square — dashboard Connect (existing tenants)

Closes the “ops pastes TENANT_*_SQUARE_*” gap that slowed Kirin.

1. Sign in at `https://orderlyfoods.com/dashboard`
2. Pick tenant (e.g. `samurai-linton` / draft outlet)
3. **Connections → Connect Square**
4. Authorize on Square → callback `/api/onboarding/square/callback` (shared URI)
5. Encrypted tokens land in `square_oauth_connections` with `tenant_id` set
6. Menu sync triggers automatically

**Precedence:** `TENANT_{SLUG}_SQUARE_*` env still wins at charge time if present (Samurai/Kirin live path unchanged). Dashboard **blocks Connect Square** while env is set (`env_wins` / HTTP 409) so “Connected” cannot silently mean the wrong merchant.

**Env:** `SQUARE_OAUTH_APPLICATION_ID`, `SQUARE_OAUTH_APPLICATION_SECRET`, `SQUARE_OAUTH_REDIRECT_URI`, `ORDERLY_TOKEN_ENCRYPTION_KEY`, optional `SQUARE_OAUTH_SUCCESS_REDIRECT`.

Wizard onboarding (`/onboarding`) still works for brand-new restaurants.

## Meta Page — development / allow-list only

Ready to store Page tokens via OAuth; **not** for third-party client Pages until Advanced Access.

| Flag | Meaning |
|------|---------|
| `META_PAGE_OAUTH_ENABLED=1` | Turn on start/callback |
| `META_PAGE_OAUTH_ALLOWLIST=samurai,kirin` | Default allow-list |
| `META_PAGE_OAUTH_PUBLIC=1` | **Do not set** until App Review Advanced Access |

**Before any Page connect:** confirm Meta App Dashboard → **App Mode = Development** (code gates ≠ Live/Dev switch). If the app was flipped Live for an earlier FB smoke, allow-list alone does not keep OAuth tester-only.

1. Confirm App Mode = Development
2. Register redirect `https://samurairesto.com/api/meta/oauth/callback` on the Meta app
3. Migrate: `psql "$DATABASE_URL" -f scripts/migrate-meta-oauth.sql`
4. Enable flags for allow-list only
5. Dashboard → **Connect Facebook Page** (one Page first: Samurai **or** Kirin)
6. After connect: confirm Graph Page id, then update `META_PAGE_ID_TENANT_MAP_JSON` + subscribe webhooks

**Token resolve for send/inbox (fail-closed):**
1. Encrypted Page token in `meta_oauth_connections` for that tenant wins
2. Else `TENANT_{ID}_META_PAGE_ACCESS_TOKEN` only
3. Never use global `META_PAGE_ACCESS_TOKEN` (cross-tenant identity bug) — missing token ⇒ refuse send

## GSC ops token

`GSC_OAUTH_OPS_TOKEN` unset ⇒ **fail-closed** (reject all). Timing-safe compare only applies when the token is set. Local opt-in: `GSC_OAUTH_ALLOW_UNAUTH=1`. Prod VPS currently has the token set.

## Load test (staging)

```bash
STAGING_BASE=https://staging.example.com OUTLETS=27 CONCURRENCY=54 DURATION_S=60 \
  node scripts/loadtest-peak-sim.mjs
```

Refuses known production hosts unless `ALLOW_PROD_LOADTEST=1`. That is a **script guard only** — not proof a separate staging host exists. On VPS `srv1813501` there is no staging dir / `STAGING_BASE`; do not run peak sim against the same box as Samurai/Kirin traffic.

## Pre-smoke order (tightened)

1. Confirm Meta App Mode (Dev/Live) in App Dashboard
2. Deploy PR + `migrate-meta-oauth.sql`
3. Square → Linton (sandbox): confirm env-wins block if env present; otherwise Connect
4. Enable Meta flag; connect **one** Page; keep App in Development
5. Loadtest only on a host confirmed separate from prod VPS
6. Hardcode class audit (results below)

## Hardcode class audit (same bug class as 7% tax)

| Value | Status | Where |
|-------|--------|--------|
| Tax 0.07 | Fixed (mobile) | Was `CartScreen`/`CheckoutScreen`; now `/api/config/checkout` fail-closed |
| Timezone | **Fallback hardcode** | `America/Indiana/Indianapolis` in `dailyReport.ts`, `dailyReportRun.ts` when env/tenant unset |
| Default hours | **Samurai hardcode** | `DEFAULT_HOURS` 11AM–8:30PM in `samurai-resto/.../tenant.tsx` (storefront fallback) |
| KDS / Square prep | **Two defaults** | DB/schema default **15** min; `orders.ts` fallback **15**; Square integration `DEFAULT_PREP_TIME_MINUTES = **20**` if null |
| Anchor per tenant | **Samurai special-case** | Offline fallback in `tenant.ts`: `id === "samurai" ? "pos-native" : "platform"` |

These are not all charge-path bugs, but they are the same pattern: silent platform default ≠ per-tenant truth.

## Deploy sole path

Production Samurai: **only** `bash scripts/deploy-samurai-main.sh`.  
Legacy `deploy/deploy-*.sh` and `scripts/deploy-from-github.sh` / `deploy-vps-fix.sh` exit 1.
