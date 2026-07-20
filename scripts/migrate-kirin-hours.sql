-- Kirin Hibachi Express hours (confirmed pre-opening, 20 Jul 2026).
-- Prefer scripts that write UTF-8 NBSP before AM/PM so footer never wraps "PM".
-- Safe apply: node scripts/tmp-fix-hours-nbsp.mjs on VPS (or equivalent).
--
-- Equivalent JSON (NBSP = U+00A0 between tokens):
-- Monday Closed
-- Tue–Thu/Sun 11:00 AM – 9:00 PM
-- Fri–Sat 11:00 AM – 10:00 PM

UPDATE tenants
SET hours = jsonb_build_object(
  'weekly', jsonb_build_array(
    jsonb_build_object('day', 'Monday', 'hours', 'Closed'),
    jsonb_build_object('day', 'Tuesday', 'hours', E'11:00\u00A0AM\u00A0–\u00A09:00\u00A0PM'),
    jsonb_build_object('day', 'Wednesday', 'hours', E'11:00\u00A0AM\u00A0–\u00A09:00\u00A0PM'),
    jsonb_build_object('day', 'Thursday', 'hours', E'11:00\u00A0AM\u00A0–\u00A09:00\u00A0PM'),
    jsonb_build_object('day', 'Friday', 'hours', E'11:00\u00A0AM\u00A0–\u00A010:00\u00A0PM'),
    jsonb_build_object('day', 'Saturday', 'hours', E'11:00\u00A0AM\u00A0–\u00A010:00\u00A0PM'),
    jsonb_build_object('day', 'Sunday', 'hours', E'11:00\u00A0AM\u00A0–\u00A09:00\u00A0PM')
  )
)
WHERE id = 'kirin';

SELECT id, hours FROM tenants WHERE id = 'kirin';
