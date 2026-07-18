-- Social inbox: preserve Meta/Google original comment time for reports.
-- created_at remains ingest time; external_created_at is the source timestamp.
ALTER TABLE social_inbox
  ADD COLUMN IF NOT EXISTS external_created_at timestamp without time zone;

CREATE INDEX IF NOT EXISTS social_inbox_tenant_external_created_idx
  ON social_inbox (tenant_id, external_created_at);

-- Backfill from raw.createdTime when present (Meta backfill stored ISO strings).
UPDATE social_inbox
SET external_created_at = (raw->>'createdTime')::timestamp
WHERE external_created_at IS NULL
  AND raw ? 'createdTime'
  AND coalesce(raw->>'createdTime', '') <> ''
  AND (raw->>'createdTime') ~ '^[0-9]{4}-';
