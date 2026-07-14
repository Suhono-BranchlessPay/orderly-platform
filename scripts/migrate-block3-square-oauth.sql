-- Blok 3.1 — REAL Square OAuth for self-serve onboarding (additive only, safe to re-run).
-- Scope: onboarding_sessions gets a few link-back columns; a brand new
-- square_oauth_connections table stores encrypted tokens. NO secrets are
-- written by this migration — tokens are written at runtime by the API,
-- always AES-256-GCM encrypted (see artifacts/api-server/src/lib/tokenCrypto.ts).
-- See docs/SELF_SERVE_ONBOARDING.md for the full env var checklist.

ALTER TABLE onboarding_sessions
  ADD COLUMN IF NOT EXISTS square_merchant_id text,
  ADD COLUMN IF NOT EXISTS square_location_id text,
  ADD COLUMN IF NOT EXISTS square_connected_at timestamptz;

CREATE TABLE IF NOT EXISTS square_oauth_connections (
  id text PRIMARY KEY,
  onboarding_session_id text NOT NULL,
  -- Nullable until the onboarding session is published into a real tenant row.
  tenant_id text,
  merchant_id text NOT NULL,
  location_id text NOT NULL,
  -- AES-256-GCM ciphertext (v1:<iv>:<authTag>:<ciphertext>) — never plaintext.
  access_token_enc text NOT NULL,
  refresh_token_enc text,
  access_token_expires_at timestamptz,
  scopes text NOT NULL DEFAULT '',
  environment text NOT NULL DEFAULT 'sandbox',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS square_oauth_connections_session_idx
  ON square_oauth_connections (onboarding_session_id);

CREATE INDEX IF NOT EXISTS square_oauth_connections_tenant_idx
  ON square_oauth_connections (tenant_id);

-- No secrets are stored in this migration. Platform Square app credentials +
-- token encryption key live in env only:
--   SQUARE_OAUTH_APPLICATION_ID, SQUARE_OAUTH_APPLICATION_SECRET,
--   SQUARE_OAUTH_REDIRECT_URI, SQUARE_OAUTH_ENVIRONMENT,
--   ORDERLY_TOKEN_ENCRYPTION_KEY
-- See docs/SELF_SERVE_ONBOARDING.md for the full checklist.
