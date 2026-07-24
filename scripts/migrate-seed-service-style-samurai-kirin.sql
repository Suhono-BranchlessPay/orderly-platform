-- Seed Step-2 service style for live tenants so AI gate does not break them.
-- Samurai: plated + cooking show. Kirin: boxed food truck, no show.

UPDATE tenants
SET theme = jsonb_set(
  COALESCE(theme, '{}'::jsonb),
  '{serviceStyle}',
  '{
    "presentation": "plate",
    "cookingShow": true,
    "dishTerm": "plates",
    "dineIn": true,
    "outdoorSeating": false,
    "confirmedAt": "2026-07-23T00:00:00.000Z"
  }'::jsonb,
  true
)
WHERE slug IN ('samurai', 'samurai-martinsville')
   OR id IN ('samurai');

UPDATE tenants
SET theme = jsonb_set(
  COALESCE(theme, '{}'::jsonb),
  '{serviceStyle}',
  '{
    "presentation": "box",
    "cookingShow": false,
    "dishTerm": "boxes",
    "dineIn": false,
    "outdoorSeating": false,
    "confirmedAt": "2026-07-23T00:00:00.000Z"
  }'::jsonb,
  true
)
WHERE slug = 'kirin' OR id = 'kirin';

-- Verify
SELECT id, slug, theme->'serviceStyle' AS service_style
FROM tenants
WHERE id IN ('samurai', 'kirin') OR slug IN ('samurai', 'kirin', 'samurai-martinsville');
