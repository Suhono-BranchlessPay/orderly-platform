-- Ensure live tenants have hours.timezone before AI/report TZ gate.
-- Does not overwrite weekly hours if already present.

UPDATE tenants
SET hours = jsonb_set(
  COALESCE(hours, '{}'::jsonb),
  '{timezone}',
  '"America/Indiana/Indianapolis"'::jsonb,
  true
)
WHERE (id = 'samurai' OR slug IN ('samurai', 'samurai-martinsville'))
  AND COALESCE(hours->>'timezone', '') = '';

UPDATE tenants
SET hours = jsonb_set(
  COALESCE(hours, '{}'::jsonb),
  '{timezone}',
  '"America/Chicago"'::jsonb,
  true
)
WHERE (id = 'kirin' OR slug = 'kirin')
  AND COALESCE(hours->>'timezone', '') = '';

SELECT id, slug, hours->>'timezone' AS timezone,
       jsonb_array_length(COALESCE(hours->'weekly', '[]'::jsonb)) AS weekly_days
FROM tenants
WHERE id IN ('samurai', 'kirin') OR slug IN ('samurai', 'kirin', 'samurai-martinsville');
