-- Dynamic QR scans + refund money seam (Blok 1)
-- Compatible with existing prod qr_scans (serial id, slug, scanned_at).

-- Ensure core table exists (prod already has this shape from earlier QR work).
CREATE TABLE IF NOT EXISTS qr_scans (
  id serial PRIMARY KEY,
  tenant_id text NOT NULL,
  slug text NOT NULL,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  referer text,
  ip_hash text
);

CREATE INDEX IF NOT EXISTS qr_scans_tenant_scanned_idx
  ON qr_scans (tenant_id, scanned_at DESC);

CREATE INDEX IF NOT EXISTS qr_scans_slug_scanned_idx
  ON qr_scans (slug, scanned_at DESC);

-- Additive tracking columns (safe if already present).
ALTER TABLE qr_scans ADD COLUMN IF NOT EXISTS redirect_url text;
ALTER TABLE qr_scans ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Refund money seam (cents). Default 0 = never refunded.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_cents integer NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_at timestamp;
