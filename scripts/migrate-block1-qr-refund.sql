-- Dynamic QR scans (P3) + optional refund_cents on orders
-- Additive only. Safe for Samurai production.

CREATE TABLE IF NOT EXISTS qr_scans (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  tenant_slug text NOT NULL,
  redirect_url text NOT NULL,
  user_agent text,
  ip_hash text,
  referer text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS qr_scans_tenant_created_idx
  ON qr_scans (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS qr_scans_slug_created_idx
  ON qr_scans (tenant_slug, created_at DESC);

-- Refund money seam (cents). Default 0 = never refunded.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_cents integer NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_at timestamp;

-- Honest label for legacy paid rows with no proof (ops backfill may already set this).
-- Dashboard treats bp_anchor_status = 'untracked' like "—" in explorer until proof exists.
