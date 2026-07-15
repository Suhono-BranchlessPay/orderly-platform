-- Blok 4.2 Stage 2 — Google Business Profile OAuth connections (self-serve).
-- Stores the encrypted refresh token + resolved location per tenant.
-- Idempotent: safe to run multiple times.

CREATE TABLE IF NOT EXISTS gbp_oauth_connections (
  id                 text PRIMARY KEY,
  tenant_id          text NOT NULL,
  account_resource   text,
  location_resource  text,
  google_email       text,
  refresh_token_enc  text NOT NULL,
  scopes             text NOT NULL DEFAULT '',
  meta               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gbp_oauth_connections_tenant_idx
  ON gbp_oauth_connections (tenant_id);
