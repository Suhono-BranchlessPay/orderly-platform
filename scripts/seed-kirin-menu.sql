-- Kirin menu: DO NOT clone from Samurai.
-- Each restaurant has its own catalog. Leave Kirin empty until Square POS
-- for Kirin is connected, then import/sync that tenant's real menu + SKUs.
--
-- This script only clears any accidental Samurai-clone seed.

DELETE FROM menu_items WHERE tenant_id = 'kirin';
DELETE FROM menu_categories WHERE tenant_id = 'kirin';

SELECT 'kirin categories' AS kind, count(*)::text AS n
FROM menu_categories WHERE tenant_id = 'kirin'
UNION ALL
SELECT 'kirin items', count(*)::text FROM menu_items WHERE tenant_id = 'kirin';
