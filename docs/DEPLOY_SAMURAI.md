# Samurai VPS deploy (sole path)

**One command. No parallel flows.**

```bash
# On VPS (root), after the change is merged to origin/main:
cd /var/www/samurai-resto
bash scripts/deploy-samurai-main.sh
```

Fixed order inside the script (learned 20 Jul 2026 — fail-closed Square):

1. `git fetch` + `reset --hard origin/main` (disk only — does **not** kill payments)
2. **PREFLIGHT money env** — `node scripts/deploy-preflight-tenant-money.mjs`  
   mirrors `SQUARE_*` → `TENANT_SAMURAI_SQUARE_*` if needed and **refuses** to continue if keys missing
3. Build `@workspace/api-server`
4. **Always** restore storefront images from `dist` → `attached_assets/` (fails if restore yields zero files)
5. `pm2 delete samurai-api` + `pm2 start ecosystem.config.cjs`  
   (**not** `restart --update-env` — that previously left new keys unloaded)
6. **POSTFLIGHT** — `Host: samurairesto.com` `/api/square/config` must be `enabled:true` (else exit 1)

Do **not**:

- Run ad-hoc `tmp-deploy-*.sh` for production
- `git pull` + build + PM2 without the script
- Call `deploy-samurai-assets.sh` by hand as “the deploy” (it is an internal helper only)
- Activate code that needs new env keys **before** those keys are verified in `ecosystem.config.cjs`

Host: `46.202.179.234` · app dir `/var/www/samurai-resto` · PM2 app `samurai-api`

### Square money path (fail-closed)

Payments use **`TENANT_{SLUG}_SQUARE_*` only** (or that tenant’s OAuth row). Global `SQUARE_*` is not a fallback.

Safe order for any env-structure change (27 outlets later):

1. Install / mirror new keys on disk  
2. Verify they parse in ecosystem  
3. Only then recreate the process with code that requires them  

Before/after deploying fail-closed money code, ensure Samurai has:

```text
TENANT_SAMURAI_SQUARE_ACCESS_TOKEN
TENANT_SAMURAI_SQUARE_LOCATION_ID
TENANT_SAMURAI_SQUARE_APPLICATION_ID
TENANT_SAMURAI_SQUARE_ENVIRONMENT=production
```

(mirror the former unprefixed `SQUARE_*` values). New outlets (Kirin, …) never share those keys.

Tax: `tenants.tax_rate` per outlet — see `scripts/migrate-tenant-tax-rate.sql`.  
Onboarding: `docs/TENANT_ONBOARDING_CHECKLIST.md`.

### Incident — 20 Jul 2026 (Samurai payments briefly off)

| | |
|--|--|
| Cause | Fail-closed Square code restarted **before** `TENANT_SAMURAI_SQUARE_*` was loaded into the PM2 process (`restart --update-env` missed keys). |
| Window | **~55 seconds** — PM2 online `05:00:44` → recreate `05:01:39` UTC (mirror bak `04:59`). |
| Failed checkouts | **None** — 0 `orders` rows in window; 0 `POST /api/orders` in nginx; no `/api/square/config` hits from samurairesto.com during the window. |
| Customer UX if hit | Storefront would disable pay (`enabled:false`) with a call-to-order message — **not** a raw browser 503. (Samurai still had `tax_rate`.) |

Prevention: preflight + `pm2 delete`/`start` + postflight in this script.
