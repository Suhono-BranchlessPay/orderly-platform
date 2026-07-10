-- Fix: SKU uniqueness must be per-tenant, not global.
-- Production still had menu_items_sku_unique → Kirin seed collided with Samurai SKUs.
-- Safe to re-run.

ALTER TABLE menu_items DROP CONSTRAINT IF EXISTS menu_items_sku_unique;
ALTER TABLE menu_items DROP CONSTRAINT IF EXISTS menu_items_sku_key;
DROP INDEX IF EXISTS menu_items_sku_unique;
DROP INDEX IF EXISTS menu_items_sku_key;
DROP INDEX IF EXISTS menu_items_sku_idx;

CREATE UNIQUE INDEX IF NOT EXISTS menu_items_tenant_sku_idx
  ON menu_items (tenant_id, sku);

-- Verify
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'menu_items' AND indexdef ILIKE '%sku%';
