-- Per-tenant sales tax (fail-closed checkout when NULL).
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS tax_rate real;

COMMENT ON COLUMN tenants.tax_rate IS
  'Sales tax decimal (0.07 = 7%). NULL = refuse checkout until set.';

-- Samurai Martinsville IN — existing hardcoded rate made explicit.
UPDATE tenants
SET tax_rate = 0.07
WHERE slug = 'samurai' AND tax_rate IS NULL;

-- Kirin Henderson KY — 6% (Malik confirmed 20 Jul 2026). Do NOT copy Indiana 0.07.
UPDATE tenants
SET tax_rate = 0.06
WHERE slug = 'kirin';

-- Samurai Linton (Greene County IN) — leave NULL until local rate confirmed.
-- Do NOT assume Morgan County 0.07.
