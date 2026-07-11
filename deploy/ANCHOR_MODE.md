# BP Audit Shield — Orderly platform key + tenants

## Model (agreed with BranchlessPay)

- **1 platform API key** for all Orderly restaurants (`BRANCHLESSPAY_LICENSE_KEY`)
- **No new API key** when adding a restaurant
- Restaurants are rows in **`tenants`** (not a separate `orderly_tenants` table)
- Each anchor request sends `merchant_id: "orderly"` + `metadata.tenant_id`

```
Authorization: Bearer bp_orderly_platform_...
POST /api/v1/anchor
{
  "reference_id": "<orderly order uuid>",
  "amount": 45.50,
  "currency": "USD",
  "merchant_id": "orderly",
  "metadata": {
    "tenant_id": "kirin",
    "restaurant_name": "Kirin Hibachi Express",
    "source": "website"
  }
}
```

## Add a new restaurant

1. Insert / upsert into `tenants` (`id`/`slug` = tenant_id, e.g. `shogun-henderson`)
2. Set `anchor_mode`:
   - `platform` — website anchors with platform key (default)
   - `pos-native` — POS already anchors (Samurai only today)
3. Domain + Square/DoorDash secrets as needed
4. **Do not** create a new BP API key

## VPS env (`ecosystem.config.cjs`)

```js
BRANCHLESSPAY_LICENSE_KEY: "bp_orderly_platform_...",  // master — all platform tenants
BRANCHLESSPAY_MERCHANT_ID: "orderly",                 // optional, default orderly
BRANCHLESSPAY_WEBHOOK_SECRET: "...",                  // for pos-native proof callback
```

Samurai stays `anchor_mode=pos-native` (Square↔BP already anchors; website stores proof only).

## Modes

| Mode | Who anchors | Tenants |
|------|-------------|---------|
| `platform` (default) | Orderly website + platform key | Kirin + new restos |
| `pos-native` | POS (Square) already on BP | Samurai |

## Migrate

```bash
cd /var/www/samurai-resto/lib/db
node <<'NODE'
const { Client } = require('pg');
const fs = require('fs');
const env = require('../../ecosystem.config.cjs').apps[0].env;
(async () => {
  const c = new Client({ connectionString: env.DATABASE_URL });
  await c.connect();
  await c.query(fs.readFileSync('../../scripts/migrate-anchor-mode.sql', 'utf8'));
  console.log('migrate-anchor-mode OK');
  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });
NODE
```
