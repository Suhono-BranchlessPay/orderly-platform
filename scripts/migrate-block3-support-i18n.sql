-- Blok 3.2 — support KB + escalations (additive, safe to re-run).
-- Blok 3.3 i18n is UI-only (no schema).

CREATE TABLE IF NOT EXISTS support_kb_articles (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  slug text NOT NULL,
  locale text NOT NULL DEFAULT 'en',
  title text NOT NULL,
  body text NOT NULL,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_kb_tenant_locale_idx
  ON support_kb_articles (tenant_id, locale);
CREATE INDEX IF NOT EXISTS support_kb_slug_idx
  ON support_kb_articles (slug);

CREATE TABLE IF NOT EXISTS support_escalations (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  asked_by text,
  question text NOT NULL,
  kb_hit_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence real,
  status text NOT NULL DEFAULT 'open',
  note text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_escalations_tenant_status_idx
  ON support_escalations (tenant_id, status);
