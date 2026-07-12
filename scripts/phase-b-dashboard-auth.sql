-- Phase B: dashboard auth (Master / Manager)
CREATE TABLE IF NOT EXISTS dashboard_users (
  id text PRIMARY KEY,
  email text NOT NULL,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL,
  tenant_id text,
  created_at timestamp NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS dashboard_users_email_idx ON dashboard_users (email);

CREATE TABLE IF NOT EXISTS dashboard_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES dashboard_users(id),
  token_hash text NOT NULL,
  expires_at timestamp NOT NULL,
  created_at timestamp NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS dashboard_sessions_token_idx ON dashboard_sessions (token_hash);
