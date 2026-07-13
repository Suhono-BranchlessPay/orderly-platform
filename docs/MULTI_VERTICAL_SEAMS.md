# Block 5 — Multi-Vertical Seams (additive + nullable)

**Status:** seams only, nothing built. **Behavior change for existing
tenants (Samurai / Kirin / Linton): zero.**

This block exists so the platform's schema and interfaces are not
architecturally locked to "restaurant with pickup/delivery". It does **not**
add grocery inventory, shipping, search, or any other real feature — see
"Explicitly NOT built" below.

## What changed

### 1. `menu_items` ("catalog_items" conceptually)

The physical table is **not renamed** (renaming is breaking — every route,
Drizzle query, and dashboard report currently reads/writes `menu_items`).
Instead:

- `menu_items` now carries a SQL comment documenting it as the platform's
  catalog table.
- An optional read-only view `catalog_items` (`CREATE OR REPLACE VIEW
  catalog_items AS SELECT * FROM menu_items;`) is available for
  forward-looking code that wants "catalog" naming. No route uses it yet.
- New nullable seam columns (all unused by current code, all safe defaults):

  | Column | Type | Default | Notes |
  |---|---|---|---|
  | `price_unit` | text | null | e.g. `"each"`, `"lb"`, `"kg"` |
  | `item_type` | text | null | e.g. `"food"`, `"grocery"`, `"retail"` |
  | `tax_category` | text | null | non-restaurant tax classification |
  | `track_inventory` | boolean | `false` | stock tracking on/off |
  | `stock_qty` | integer | null | only meaningful when tracked |
  | `barcode` | text | null | UPC/EAN |
  | `brand` | text | null | manufacturer/brand |
  | `expiry_date` | timestamp | null | perishables |
  | `search_keywords` | text | null | catalog search seam |
  | `shippable` | boolean | `false` | ship-to-address eligibility |
  | `ship_class` | text | null | carrier rate class |
  | `weight_grams` | integer | null | shipping weight |
  | `age_restricted` | boolean | `false` | e.g. alcohol/tobacco |

  Every existing menu item row gets `false`/`null` for these columns via
  `DEFAULT`, so existing menu APIs, dashboard reports, and storefronts keep
  working unmodified.

### 2. `menu_categories.parent_id`

Nullable self-referencing FK (`REFERENCES menu_categories(id)`). Restaurants
stay flat — existing categories keep `parent_id = NULL`. This only unlocks
department/sub-department hierarchy for a future non-restaurant vertical.

### 3. `tenants.business_type`

`text NOT NULL DEFAULT 'restaurant'`. Every existing tenant row is
backfilled to `'restaurant'` by the column default at migration time — no
manual backfill needed, no behavior change.

### 4. `tenants.fulfillment_modes`

`jsonb NOT NULL DEFAULT '["pickup"]'::jsonb` — matches the existing
jsonb-array style already used by `tenants.languages`. Every tenant defaults
to `["pickup"]`. The real DoorDash delivery path (`/api/delivery/quote`,
`src/integrations/doordash.ts`) is **unchanged** and does not read this
column — it is a seam for future fulfillment-mode gating, not a rewire of
the current delivery flow.

### 5. `FulfillmentProvider` interface (api-server)

`artifacts/api-server/src/lib/fulfillment/`:

- `types.ts` — the `FulfillmentProvider` interface (`isConfigured`,
  `quote`, `dispatch`), plus shared input/result types. Money stays in
  integer cents, consistent with `lib/money.ts`.
- `pickup.ts` — `PickupFulfillmentProvider`, the **only** real
  implementation (zero fee, no external dispatch — same as current
  behavior for every tenant today).
- `doordash.ts`, `shipping.ts` — stubs implementing the interface but
  throwing `FulfillmentNotImplementedError`. They do **not** touch the real
  DoorDash integration (`integrations/doordash.ts`) or `/delivery` routes,
  which remain the production delivery path.
- `index.ts` — a small `getFulfillmentProvider(mode)` registry.

**Nothing imports this module from any existing route.** Wiring a provider
into order-create/checkout is a separate, later change, intentionally not
part of Block 5.

### 6. `merchants` table + `tenants.merchant_id`

New thin `merchants` table (`id`, `name`, `email`, `created_at`) so one
merchant can eventually own many storefronts (tenants) — no 1:1 lock-in.
`tenants.merchant_id` is a nullable FK to `merchants.id`. **Existing tenants
are not auto-migrated** into merchants; `merchant_id` stays `NULL` for
Samurai/Kirin/Linton (and any other current tenant) until someone
deliberately assigns one.

## Explicitly NOT built (out of scope for Block 5)

- Grocery inventory management (receiving, counting, reorder points).
- Shipping (carrier rate shopping, label printing, tracking webhooks).
- Catalog / product search (keyword, faceted, or otherwise).
- Any UI for the new columns (dashboard, storefront, mobile).
- Any automatic backfill of `merchant_id` for existing tenants.
- Any change to money/order totals, Square, or DoorDash live behavior.

## Files touched

- `scripts/migrate-block5-multi-vertical-seams.sql` — idempotent migration.
- `lib/db/src/schema/menu.ts` — `menu_items` + `menu_categories` seam columns.
- `lib/db/src/schema/tenants.ts` — `business_type`, `fulfillment_modes`,
  `merchant_id`.
- `lib/db/src/schema/merchants.ts` — new `merchants` table schema.
- `lib/db/src/schema/index.ts` — export `merchants` schema.
- `artifacts/api-server/src/lib/fulfillment/{types,pickup,doordash,shipping,index}.ts`.

## Verification SQL (run on VPS after migration)

```sql
-- menu_items seam columns present
\d menu_items

-- catalog_items view resolves to the same data
SELECT count(*) FROM catalog_items;
SELECT count(*) FROM menu_items;

-- all existing menu items keep safe seam defaults
SELECT count(*) FROM menu_items
WHERE track_inventory IS DISTINCT FROM false
   OR shippable IS DISTINCT FROM false
   OR age_restricted IS DISTINCT FROM false;
-- expect: 0

-- menu_categories hierarchy column, flat for existing rows
SELECT count(*) FROM menu_categories WHERE parent_id IS NOT NULL;
-- expect: 0 (until a future vertical uses it)

-- tenants seam columns + defaults
SELECT id, slug, business_type, fulfillment_modes, merchant_id FROM tenants;
-- expect: business_type = 'restaurant', fulfillment_modes = ["pickup"],
--         merchant_id = NULL for every existing tenant

-- merchants table exists and is empty (no auto-backfill)
SELECT count(*) FROM merchants;
-- expect: 0

-- sanity: existing restaurant queries still work
SELECT id, name, price, available FROM menu_items LIMIT 5;
```
