-- AI Gateway usage log (docs/SPEC_AI_GATEWAY.md)
CREATE TABLE IF NOT EXISTS ai_usage_log (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  task text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_usd real NOT NULL DEFAULT 0,
  latency_ms integer NOT NULL DEFAULT 0,
  fallback_used boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'ok',
  error text,
  created_at timestamp without time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_tenant_created_idx
  ON ai_usage_log (tenant_id, created_at);

CREATE INDEX IF NOT EXISTS ai_usage_task_created_idx
  ON ai_usage_log (task, created_at);
