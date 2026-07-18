-- Google Search Console OAuth connections (per-tenant). Additive.
CREATE TABLE IF NOT EXISTS gsc_oauth_connections (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  site_url text NOT NULL,
  google_email text,
  refresh_token_enc text NOT NULL,
  scopes text NOT NULL DEFAULT '',
  data_since text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS gsc_oauth_connections_tenant_idx
  ON gsc_oauth_connections (tenant_id);
