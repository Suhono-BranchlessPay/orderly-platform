-- Phone uniqueness must be per-tenant.
-- A Samurai customer must not block the same phone from ordering at Kirin.
-- Schema (lib/db) already defines customers_tenant_phone_idx on (tenant_id, phone).
-- Production still had a leftover global UNIQUE(phone) named customers_phone_unique.

-- Drop CONSTRAINT first (unique index is owned by it).
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_phone_unique;
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_phone_key;
DROP INDEX IF EXISTS customers_phone_unique;
DROP INDEX IF EXISTS customers_phone_key;

CREATE UNIQUE INDEX IF NOT EXISTS customers_tenant_phone_idx
  ON customers (tenant_id, phone);
