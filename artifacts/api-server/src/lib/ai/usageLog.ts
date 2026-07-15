import { randomUUID } from "node:crypto";
import { aiUsageLogTable, db } from "@workspace/db";
import type { AiTask } from "./types";

export type AiUsageLogWrite = {
  tenantId: string;
  task: AiTask;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  fallbackUsed: boolean;
  status: "ok" | "error" | "blocked";
  error?: string;
};

/** Best-effort — never throw into the feature path. */
export async function writeAiUsageLog(row: AiUsageLogWrite): Promise<void> {
  try {
    await db.insert(aiUsageLogTable).values({
      id: randomUUID(),
      tenantId: row.tenantId,
      task: row.task,
      provider: row.provider,
      model: row.model,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      costUsd: row.costUsd,
      latencyMs: row.latencyMs,
      fallbackUsed: row.fallbackUsed,
      status: row.status,
      error: row.error ?? null,
    });
  } catch (err) {
    console.error("[ai-gateway] failed to write ai_usage_log", err);
  }
}
