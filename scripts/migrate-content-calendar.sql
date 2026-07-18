-- Content Engine Phase 1 — content_calendar + per-tenant config
-- Idempotent. Timestamptz only (naive UTC misled ops twice in Jul 2026).

CREATE TABLE IF NOT EXISTS content_calendar_config (
  tenant_id text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  n_posts integer NOT NULL DEFAULT 14,
  pillar_mix jsonb NOT NULL DEFAULT '{
    "hero_product":30,"customer_voice":15,"menu_education":15,
    "behind_scenes":10,"community_local":10,"offer_cta":15,"timely":5
  }'::jsonb,
  tone text NOT NULL DEFAULT 'warm, local, concrete',
  language text NOT NULL DEFAULT 'en',
  cuisine text NOT NULL DEFAULT 'restaurant',
  brand_voice text NOT NULL DEFAULT '',
  local_events jsonb NOT NULL DEFAULT '[]'::jsonb,
  pre_peak_minutes_min integer NOT NULL DEFAULT 90,
  pre_peak_minutes_max integer NOT NULL DEFAULT 120,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS content_calendar (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  scheduled_date date NOT NULL,
  suggested_time time,
  pillar text NOT NULL,
  target_item_id text,
  target_item_name text,
  hook text NOT NULL DEFAULT '',
  caption text NOT NULL DEFAULT '',
  hashtags jsonb NOT NULL DEFAULT '[]'::jsonb,
  cta_type text NOT NULL DEFAULT 'order_online',
  platform text NOT NULL DEFAULT 'facebook',
  src_slug text NOT NULL,
  short_link text NOT NULL,
  photo_asset_id text,
  design_brief jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  approved_by text,
  approved_at timestamptz,
  posted_at timestamptz,
  skipped_reason text,
  clicks integer NOT NULL DEFAULT 0,
  orders integer NOT NULL DEFAULT 0,
  revenue_cents integer NOT NULL DEFAULT 0,
  metrics_updated_at timestamptz,
  month_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS content_calendar_src_slug_uidx
  ON content_calendar (src_slug);
CREATE INDEX IF NOT EXISTS content_calendar_tenant_date_idx
  ON content_calendar (tenant_id, scheduled_date);
CREATE INDEX IF NOT EXISTS content_calendar_tenant_status_idx
  ON content_calendar (tenant_id, status);
CREATE INDEX IF NOT EXISTS content_calendar_tenant_month_idx
  ON content_calendar (tenant_id, month_key);
