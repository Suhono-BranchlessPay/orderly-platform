-- Self-serve onboarding wizard — invite gate + Step 1 draft payload.
-- Additive / safe to re-run.

CREATE TABLE IF NOT EXISTS onboarding_invites (
  id text PRIMARY KEY,
  token text NOT NULL UNIQUE,
  label text,
  target_slug text,
  contact_email text,
  expires_at timestamptz,
  claimed_at timestamptz,
  claimed_session_id text,
  created_by text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS onboarding_invites_token_idx
  ON onboarding_invites (token);

ALTER TABLE onboarding_sessions
  ADD COLUMN IF NOT EXISTS invite_id text;

ALTER TABLE onboarding_sessions
  ADD COLUMN IF NOT EXISTS wizard jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE onboarding_sessions
  ADD COLUMN IF NOT EXISTS current_step integer NOT NULL DEFAULT 1;

COMMENT ON TABLE onboarding_invites IS
  'Invite-only gate for /onboarding (not public signup). One token → one session.';
COMMENT ON COLUMN onboarding_sessions.wizard IS
  'Draft wizard payload: identity, serviceStyle, hours, … (steps 1–11).';
COMMENT ON COLUMN onboarding_sessions.current_step IS
  '1–11; draft can resume mid-wizard.';
