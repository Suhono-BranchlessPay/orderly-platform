-- Kirin tenant #2 + BP post-pay anchor columns
-- Run after migrate-multi-tenant-foundation.sql

ALTER TABLE orders ADD COLUMN IF NOT EXISTS bp_anchor_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bp_content_hash text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bp_anchor_status text;

-- Tenant #2: Kirin Hibachi Express — Henderson, KY
-- Domain: kirinhibachiexpress.com
-- Secrets: TENANT_KIRIN_SQUARE_*, TENANT_KIRIN_DOORDASH_*, TENANT_KIRIN_BRANCHLESSPAY_LICENSE_KEY
INSERT INTO tenants (
  id, slug, name, domain,
  logo_url,
  address, city, state, postcode, lat, lng,
  service_area_radius, pickup_phone, pickup_business_name,
  theme, status
) VALUES (
  'kirin',
  'kirin',
  'Kirin Hibachi Express',
  'kirinhibachiexpress.com',
  '/kirin-logo.png',
  '2278 S Green St',
  'Henderson',
  'KY',
  '42420',
  37.78751,
  -87.40068,
  12,
  '+12708233405',
  'Kirin Hibachi Express',
  '{
    "primary": "0 72% 38%",
    "secondary": "40 30% 88%",
    "accent": "0 0% 5%",
    "brandName": "Kirin Hibachi Express",
    "brandShort": "Kirin",
    "logoUrl": "/kirin-logo.png",
    "faviconUrl": "/kirin-favicon.svg",
    "contactEmail": "kirinhibachiexpress26@gmail.com",
    "facebookUrl": "https://www.facebook.com/profile.php?id=61591591400890",
    "tagline": "Order directly from Kirin Hibachi Express in Henderson, KY. Fresh hibachi and sushi — pickup or delivery.",
    "aboutText": "Kirin Hibachi Express brings sizzling hibachi and fresh sushi to Henderson, Kentucky. Order online for pickup or delivery — no marketplace markups.",
    "metaTitle": "Kirin Hibachi Express | Henderson, KY — Order Online",
    "metaDescription": "Kirin Hibachi Express in Henderson, Kentucky. Order fresh hibachi, sushi, and Japanese favorites online for pickup or delivery at 2278 S Green St.",
    "metaKeywords": "kirin hibachi express henderson ky, hibachi henderson kentucky, sushi henderson ky, japanese restaurant henderson, order hibachi online henderson",
    "ogTitle": "Kirin Hibachi Express | Henderson, KY",
    "ogDescription": "Fresh hibachi and sushi in Henderson, Kentucky. Order online for pickup or delivery from Kirin Hibachi Express.",
    "ogImage": "/kirin-og-image.jpg",
    "cuisine": ["Japanese", "Hibachi", "Sushi"],
    "fontHeading": "Cormorant Garamond",
    "fontBody": "Source Sans 3"
  }'::jsonb,
  'active'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  domain = EXCLUDED.domain,
  logo_url = EXCLUDED.logo_url,
  address = EXCLUDED.address,
  city = EXCLUDED.city,
  state = EXCLUDED.state,
  postcode = EXCLUDED.postcode,
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng,
  service_area_radius = EXCLUDED.service_area_radius,
  pickup_phone = EXCLUDED.pickup_phone,
  pickup_business_name = EXCLUDED.pickup_business_name,
  theme = EXCLUDED.theme,
  status = EXCLUDED.status;
