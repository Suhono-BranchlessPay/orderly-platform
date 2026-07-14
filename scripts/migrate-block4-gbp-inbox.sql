-- Blok 4.2 — Google Business Profile TRIAL skeleton (additive, safe to re-run).
-- Scope: ONE tenant (samurai). Human approve only — no auto-send.
-- See docs/BLOK4_GBP_TRIAL.md.

CREATE TABLE IF NOT EXISTS gbp_inbox (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  kind text NOT NULL,                      -- review | question
  external_location_id text,
  external_message_id text,
  author_name text,
  body text,
  star_rating integer,                     -- 1–5 for reviews; null for Q&A
  classification text NOT NULL DEFAULT 'unknown',
  draft_reply text,
  status text NOT NULL DEFAULT 'new',      -- new|drafted|pending_approval|approved|sent|skipped|blocked
  risk_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gbp_inbox_dedupe_idx
  ON gbp_inbox (tenant_id, kind, external_message_id);

CREATE INDEX IF NOT EXISTS gbp_inbox_tenant_status_idx
  ON gbp_inbox (tenant_id, status, created_at);

CREATE TABLE IF NOT EXISTS gbp_reply_audit (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  inbox_id text NOT NULL,
  action text NOT NULL,
  actor text NOT NULL,
  before_body text,
  after_body text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gbp_reply_audit_inbox_idx
  ON gbp_reply_audit (inbox_id, created_at);

CREATE INDEX IF NOT EXISTS gbp_reply_audit_tenant_idx
  ON gbp_reply_audit (tenant_id, created_at);

-- Tokens stay in env only (never in DB):
--   GBP_LOCATION_ID_TENANT_MAP_JSON
--   GBP_ACCESS_TOKEN / TENANT_SAMURAI_GBP_ACCESS_TOKEN (future send)
--   GBP_SEND_ENABLED=0, GBP_KILL_SWITCH_SAMURAI=0
