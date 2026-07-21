-- Meta Page OAuth connections (self-serve, allow-listed tenants only until Advanced Access).
CREATE TABLE IF NOT EXISTS meta_oauth_connections (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  page_id text NOT NULL,
  page_name text,
  page_access_token_enc text NOT NULL,
  scopes text NOT NULL DEFAULT '',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS meta_oauth_connections_tenant_idx
  ON meta_oauth_connections (tenant_id);
