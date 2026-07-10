-- Multi-tenant foundation: tenants table + tenant_id on menu + Samurai seed
-- Run: psql "$DATABASE_URL" -f scripts/migrate-multi-tenant-foundation.sql

CREATE TABLE IF NOT EXISTS tenants (
  id text PRIMARY KEY,
  slug text NOT NULL,
  name text NOT NULL,
  domain text NOT NULL,
  logo_url text,
  favicon_url text,
  theme jsonb NOT NULL DEFAULT '{}'::jsonb,
  address text,
  city text,
  state text,
  postcode text,
  lat real NOT NULL,
  lng real NOT NULL,
  hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  service_area_radius real NOT NULL DEFAULT 12,
  pickup_phone text,
  pickup_business_name text,
  pos_type text NOT NULL DEFAULT 'square',
  data_mode text NOT NULL DEFAULT 'pos-full',
  languages jsonb NOT NULL DEFAULT '["en"]'::jsonb,
  service_fee jsonb NOT NULL DEFAULT '{}'::jsonb,
  processing_fee_paid_by text NOT NULL DEFAULT 'restaurant',
  status text NOT NULL DEFAULT 'active',
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tenants_slug_idx ON tenants (slug);
CREATE UNIQUE INDEX IF NOT EXISTS tenants_domain_idx ON tenants (domain);

INSERT INTO tenants (
  id, slug, name, domain,
  address, city, state, postcode, lat, lng,
  service_area_radius, pickup_phone, pickup_business_name,
  theme, status
) VALUES (
  'samurai',
  'samurai',
  'Samurai Hibachi & Sushi',
  'samurairesto.com',
  '789 E Morgan St',
  'Martinsville',
  'IN',
  '46151',
  39.4277084,
  -86.4191611,
  12,
  '+17653150073',
  'Samurai Hibachi & Sushi',
  '{"primary":"354 82% 50%","accent":"43 74% 49%","brandName":"Samurai Hibachi & Sushi","brandShort":"Samurai","metaTitle":"Samurai Hibachi & Sushi | Martinsville, IN — Order Online","metaDescription":"Samurai Hibachi & Sushi in Martinsville, Indiana. Order fresh sushi rolls, hibachi, bento boxes, and party trays online for pickup or delivery.","ogTitle":"Samurai Hibachi & Sushi | Martinsville, IN","ogImage":"/og-image.jpg","contactEmail":"samurairesromartins@gmail.com","facebookUrl":"https://www.facebook.com/samuraimartinsville","tagline":"Order directly from Samurai. No hidden marketplace fees. Fresh from our kitchen.","cuisine":["Japanese","Sushi","Hibachi"],"ratingValue":"4.9","reviewCount":"2300"}'::jsonb,
  'active'
)
ON CONFLICT (id) DO UPDATE SET
  domain = EXCLUDED.domain,
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng,
  service_area_radius = EXCLUDED.service_area_radius,
  pickup_phone = EXCLUDED.pickup_phone,
  pickup_business_name = EXCLUDED.pickup_business_name,
  theme = EXCLUDED.theme;

-- Also accept www host via second domain row? Keep one canonical domain;
-- middleware strips www. before lookup.

ALTER TABLE menu_categories ADD COLUMN IF NOT EXISTS tenant_id text;
UPDATE menu_categories SET tenant_id = 'samurai' WHERE tenant_id IS NULL OR tenant_id = 'default';
ALTER TABLE menu_categories ALTER COLUMN tenant_id SET DEFAULT 'samurai';
ALTER TABLE menu_categories ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS menu_categories_tenant_id_idx ON menu_categories (tenant_id);

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS tenant_id text;
UPDATE menu_items SET tenant_id = 'samurai' WHERE tenant_id IS NULL OR tenant_id = 'default';
ALTER TABLE menu_items ALTER COLUMN tenant_id SET DEFAULT 'samurai';
ALTER TABLE menu_items ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS menu_items_tenant_id_idx ON menu_items (tenant_id);

ALTER TABLE menu_items DROP CONSTRAINT IF EXISTS menu_items_sku_key;
ALTER TABLE menu_items DROP CONSTRAINT IF EXISTS menu_items_sku_unique;
DROP INDEX IF EXISTS menu_items_sku_key;
DROP INDEX IF EXISTS menu_items_sku_unique;
CREATE UNIQUE INDEX IF NOT EXISTS menu_items_tenant_sku_idx ON menu_items (tenant_id, sku);

-- Remap legacy default tenant id → samurai
UPDATE orders SET tenant_id = 'samurai' WHERE tenant_id = 'default' OR tenant_id IS NULL;
ALTER TABLE orders ALTER COLUMN tenant_id SET DEFAULT 'samurai';
CREATE INDEX IF NOT EXISTS orders_tenant_id_idx ON orders (tenant_id);

UPDATE customers SET tenant_id = 'samurai' WHERE tenant_id = 'default';
UPDATE addresses SET tenant_id = 'samurai' WHERE tenant_id = 'default';
CREATE INDEX IF NOT EXISTS customers_tenant_id_idx ON customers (tenant_id);
CREATE INDEX IF NOT EXISTS addresses_tenant_id_idx ON addresses (tenant_id);
