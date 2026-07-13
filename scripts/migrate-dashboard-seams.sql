-- Dashboard seams (channel, kitchen timestamps, analytics) — additive only
-- Run on Samurai / shared Orderly DB before deploy of tip + channel instrumentation.

-- SEAM #1: sales channel
ALTER TABLE orders ADD COLUMN IF NOT EXISTS channel text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source_detail jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill: online paid orders without channel → web (website-first era).
-- Do not invent android/ios for history we cannot prove.
UPDATE orders
SET channel = COALESCE(channel, 'web')
WHERE payment_status = 'paid' AND channel IS NULL;

-- SEAM #3: kitchen / lifecycle timestamps
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at timestamp;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS accepted_at timestamp;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS in_progress_at timestamp;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ready_at timestamp;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_at timestamp;

-- Best-effort: paid orders get paid_at from created_at when missing
UPDATE orders
SET paid_at = created_at
WHERE payment_status = 'paid' AND paid_at IS NULL;

UPDATE orders
SET completed_at = COALESCE(completed_at, created_at)
WHERE status = 'completed' AND completed_at IS NULL;

UPDATE orders
SET ready_at = COALESCE(ready_at, created_at)
WHERE status = 'ready' AND ready_at IS NULL;

UPDATE orders
SET in_progress_at = COALESCE(in_progress_at, created_at)
WHERE status = 'preparing' AND in_progress_at IS NULL;

-- SEAM #2: funnel events (cannot be backfilled)
CREATE TABLE IF NOT EXISTS analytics_events (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  session_id text NOT NULL,
  event_type text NOT NULL,
  item_id text,
  order_id text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_events_tenant_created_idx
  ON analytics_events (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS analytics_events_tenant_type_created_idx
  ON analytics_events (tenant_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS orders_channel_idx ON orders (tenant_id, channel);
