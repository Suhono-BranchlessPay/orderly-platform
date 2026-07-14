-- Meta Conversion API outbox (additive, safe to re-run).
-- Ads measurement only — gated by META_CAPI_ENABLED at runtime.

CREATE TABLE IF NOT EXISTS meta_capi_outbox (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  event_name text NOT NULL,
  event_id text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  meta_event_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS meta_capi_outbox_tenant_status_idx
  ON meta_capi_outbox (tenant_id, status);
CREATE INDEX IF NOT EXISTS meta_capi_outbox_event_id_idx
  ON meta_capi_outbox (event_id);
