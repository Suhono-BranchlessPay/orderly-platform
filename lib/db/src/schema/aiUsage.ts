import {
  pgTable,
  text,
  boolean,
  integer,
  real,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * AI Gateway usage log — every ai.run() call attributed per tenant/task.
 * See docs/SPEC_AI_GATEWAY.md.
 */
export const aiUsageLogTable = pgTable(
  "ai_usage_log",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    task: text("task").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: real("cost_usd").notNull().default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    fallbackUsed: boolean("fallback_used").notNull().default(false),
    status: text("status").notNull().default("ok"),
    error: text("error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("ai_usage_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("ai_usage_task_created_idx").on(t.task, t.createdAt),
  ],
);

export type AiUsageLogRow = typeof aiUsageLogTable.$inferSelect;
