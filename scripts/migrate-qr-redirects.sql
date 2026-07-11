-- Dynamic packaging QR: scan log + Samurai qr_target config
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS qr_scans (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent TEXT,
  referer TEXT,
  ip_hash TEXT
);

CREATE INDEX IF NOT EXISTS qr_scans_tenant_scanned_idx
  ON qr_scans (tenant_id, scanned_at DESC);

CREATE INDEX IF NOT EXISTS qr_scans_slug_scanned_idx
  ON qr_scans (slug, scanned_at DESC);

-- Samurai Martinsville: printable QR points at orderlyfoods.com/r/samurai
UPDATE tenants SET
  theme = theme || $${
    "qr": {
      "slug": "samurai",
      "public_url": "https://orderlyfoods.com/r/samurai",
      "target": "https://samurairesto.com/order",
      "label": "Scan to order again"
    }
  }$$::jsonb
WHERE id = 'samurai';

-- Optional: seed targets for other tenants (QR images later)
UPDATE tenants SET
  theme = theme || $${
    "qr": {
      "slug": "kirin",
      "public_url": "https://orderlyfoods.com/r/kirin",
      "target": "https://kirinhibachiexpress.com/order",
      "label": "Scan to order again"
    }
  }$$::jsonb
WHERE id = 'kirin';

UPDATE tenants SET
  theme = theme || $${
    "qr": {
      "slug": "samurai-linton",
      "public_url": "https://orderlyfoods.com/r/samurai-linton",
      "target": "https://samurailinton.com/order",
      "label": "Scan to order again"
    }
  }$$::jsonb
WHERE id = 'samurai-linton';

SELECT id,
       theme->'qr'->>'public_url' AS qr_url,
       theme->'qr'->>'target' AS qr_target
FROM tenants
WHERE id IN ('samurai','kirin','samurai-linton')
ORDER BY id;
