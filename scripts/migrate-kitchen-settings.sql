-- Client dashboard / KDS: per-tenant kitchen & prep settings.
-- Additive migration (safe for existing data). Absent row = code defaults.
CREATE TABLE IF NOT EXISTS kitchen_settings (
  tenant_id text PRIMARY KEY,
  prep_time_minutes integer NOT NULL DEFAULT 15,
  busy_mode boolean NOT NULL DEFAULT false,
  busy_extra_minutes integer NOT NULL DEFAULT 10,
  orders_paused boolean NOT NULL DEFAULT false,
  updated_at timestamp NOT NULL DEFAULT NOW()
);
