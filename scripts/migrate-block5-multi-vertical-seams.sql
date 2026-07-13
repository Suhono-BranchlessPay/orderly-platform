-- Block 5 — multi-vertical SEAMS only (additive + nullable).
-- Goal: unlock the schema from "restaurant-only" WITHOUT building grocery
-- inventory/shipping/search features and WITHOUT any behavior change for
-- existing Samurai / Kirin / Linton restaurant tenants.
--
-- Safe to run multiple times (idempotent). Safe to run on live prod DB:
-- every ADD COLUMN uses IF NOT EXISTS, no column is dropped/renamed/typed
-- differently, no NOT NULL is added without a DEFAULT, no data is deleted.
--
-- Run: psql "$DATABASE_URL" -f scripts/migrate-block5-multi-vertical-seams.sql

BEGIN;

-- ============================================================================
-- 1) menu_items → conceptually "catalog_items". Table NOT renamed (breaking).
--    All new columns nullable (or boolean default false) — restaurants keep
--    using only the original columns exactly as before.
-- ============================================================================

COMMENT ON TABLE menu_items IS
  'Platform catalog table (conceptually "catalog_items"). Kept as menu_items '
  'to avoid a breaking rename — see docs/MULTI_VERTICAL_SEAMS.md. Restaurant '
  'tenants (Samurai/Kirin/Linton) use only the original food-menu columns; '
  'Block 5 added nullable seam columns below for future non-restaurant '
  'verticals (retail/grocery/etc.), none of which are populated or read '
  'by existing code paths.';

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS price_unit text;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS item_type text;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS tax_category text;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS track_inventory boolean NOT NULL DEFAULT false;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS stock_qty integer;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS barcode text;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS expiry_date timestamp;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS search_keywords text;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS shippable boolean NOT NULL DEFAULT false;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS ship_class text;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS weight_grams integer;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS age_restricted boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN menu_items.price_unit IS 'Seam (unused today): "each" | "lb" | "kg" | "oz". Null = restaurant per-item pricing.';
COMMENT ON COLUMN menu_items.item_type IS 'Seam (unused today): catalog kind, e.g. "food" | "grocery" | "retail".';
COMMENT ON COLUMN menu_items.track_inventory IS 'Seam (unused today): always false for existing restaurant items.';
COMMENT ON COLUMN menu_items.shippable IS 'Seam (unused today): always false for existing restaurant items.';
COMMENT ON COLUMN menu_items.age_restricted IS 'Seam (unused today): always false for existing restaurant items.';

-- Optional read-only alias so future code can query "catalog_items" without
-- a physical rename. Safe: plain view over the same table, no data copy.
CREATE OR REPLACE VIEW catalog_items AS SELECT * FROM menu_items;
COMMENT ON VIEW catalog_items IS
  'Alias view over menu_items for forward-looking "catalog" naming. Not used '
  'by any current route — menu_items remains the table of record.';

-- ============================================================================
-- 2) menu_categories.parent_id — nullable hierarchy seam.
--    Restaurants stay flat (parent_id stays NULL for all existing rows).
-- ============================================================================

ALTER TABLE menu_categories
  ADD COLUMN IF NOT EXISTS parent_id text REFERENCES menu_categories(id);

COMMENT ON COLUMN menu_categories.parent_id IS
  'Seam (unused today): optional parent category for retail/grocery '
  'department hierarchy. Restaurants stay flat — always NULL.';

CREATE INDEX IF NOT EXISTS menu_categories_parent_idx ON menu_categories(parent_id);

-- ============================================================================
-- 3) tenants.business_type — default "restaurant", zero behavior change.
-- ============================================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS business_type text NOT NULL DEFAULT 'restaurant';

COMMENT ON COLUMN tenants.business_type IS
  'Seam: "restaurant" | future verticals (retail/grocery/etc.). All '
  'existing tenants default to "restaurant" — no behavior change.';

-- ============================================================================
-- 4) tenants.fulfillment_modes — default ["pickup"], jsonb array (matches
--    existing jsonb-array style used by tenants.languages).
-- ============================================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS fulfillment_modes jsonb NOT NULL DEFAULT '["pickup"]'::jsonb;

COMMENT ON COLUMN tenants.fulfillment_modes IS
  'Seam: array of supported fulfillment provider modes, e.g. '
  '["pickup"], ["pickup","delivery"]. Defaults to ["pickup"] for all '
  'tenants — matches current behavior (DoorDash delivery stays wired '
  'through the existing /delivery routes, unaffected by this column).';

-- ============================================================================
-- 5) merchants — thin table so one merchant can own many storefronts
--    (tenants). No 1:1 lock-in. Existing tenants are NOT auto-migrated into
--    merchants; tenants.merchant_id stays NULL for them.
-- ============================================================================

CREATE TABLE IF NOT EXISTS merchants (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text,
  created_at timestamp NOT NULL DEFAULT now()
);

COMMENT ON TABLE merchants IS
  'Block 5 seam: a merchant may own many tenants (storefronts). Not '
  'populated automatically — existing tenants keep merchant_id = NULL.';

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS merchant_id text REFERENCES merchants(id);

COMMENT ON COLUMN tenants.merchant_id IS
  'Seam: optional owning merchant (nullable, no FK enforced on legacy '
  'rows). NULL for all current tenants — no automatic backfill.';

CREATE INDEX IF NOT EXISTS tenants_merchant_idx ON tenants(merchant_id);

COMMIT;
