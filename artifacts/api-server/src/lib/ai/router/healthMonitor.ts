import type { ProviderAdapter } from "../adapters/types";
import type { AiProviderName } from "../types";
import type { ProviderHealth, ProviderHealthStatus } from "./types";

const PROVIDERS: AiProviderName[] = ["local", "openai", "anthropic", "gemini"];

const WINDOW_MS = Number(process.env.AI_HEALTH_WINDOW_MS ?? 15 * 60 * 1000);
const MIN_SAMPLES = Number(process.env.AI_HEALTH_MIN_SAMPLES ?? 3);
const ERROR_RATE_DOWN = Number(process.env.AI_HEALTH_ERROR_DOWN ?? 0.5);
const ERROR_RATE_DEGRADED = Number(process.env.AI_HEALTH_ERROR_DEGRADED ?? 0.2);
const BREAKER_OPEN_MS = Number(process.env.AI_HEALTH_BREAKER_MS ?? 60_000);
const BREAKER_CONSECUTIVE = Number(process.env.AI_HEALTH_BREAKER_CONSECUTIVE ?? 3);

type BreakerState = { openUntilMs: number; consecutiveErrors: number };

const breakers = new Map<string, BreakerState>();

export type ProviderUsageStat = {
  provider: string;
  total: number;
  errors: number;
  latencies: number[];
};

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.max(0, Math.ceil((p / 100) * sortedAsc.length) - 1),
  );
  return sortedAsc[idx] ?? 0;
}

/** Pure: stats + availability + breaker → health status. */
export function evaluateHealthFromStats(
  provider: string,
  available: boolean,
  stat: ProviderUsageStat | undefined,
  now = Date.now(),
): ProviderHealth {
  if (!available) {
    return { status: "down", p95LatencyMs: 0, errorRate: 1 };
  }

  const breaker = breakers.get(provider);
  if (breaker && breaker.openUntilMs > now) {
    return {
      status: "down",
      p95LatencyMs: 0,
      errorRate: 1,
    };
  }

  const latencies = [...(stat?.latencies ?? [])].sort((a, b) => a - b);
  const p95LatencyMs = percentile(latencies, 95) || (available ? 200 : 0);

  if (!stat || stat.total < MIN_SAMPLES) {
    return { status: "healthy", p95LatencyMs, errorRate: 0 };
  }

  const errorRate = stat.errors / stat.total;
  let status: ProviderHealthStatus = "healthy";
  if (errorRate >= ERROR_RATE_DOWN) status = "down";
  else if (errorRate >= ERROR_RATE_DEGRADED) status = "degraded";

  return { status, p95LatencyMs, errorRate };
}

/** Call after each adapter attempt — opens circuit after consecutive failures. */
export function recordProviderOutcome(provider: string, ok: boolean): void {
  if (!provider || provider === "gateway" || provider === "router") return;
  if (ok) {
    breakers.delete(provider);
    return;
  }
  const prev = breakers.get(provider) ?? { openUntilMs: 0, consecutiveErrors: 0 };
  const consecutiveErrors = prev.consecutiveErrors + 1;
  const openUntilMs =
    consecutiveErrors >= BREAKER_CONSECUTIVE
      ? Date.now() + BREAKER_OPEN_MS
      : prev.openUntilMs;
  breakers.set(provider, { openUntilMs, consecutiveErrors });
}

/** Test helper. */
export function resetHealthMonitorForTests(): void {
  breakers.clear();
}

export async function loadUsageStats(
  windowMs = WINDOW_MS,
): Promise<Map<string, ProviderUsageStat>> {
  const since = new Date(Date.now() - windowMs);
  const map = new Map<string, ProviderUsageStat>();
  try {
    // Lazy import so verify/unit bundles don't require a live DB module graph.
    const { gte } = await import("drizzle-orm");
    const { aiUsageLogTable, db } = await import("@workspace/db");
    const rows = await db
      .select({
        provider: aiUsageLogTable.provider,
        status: aiUsageLogTable.status,
        latencyMs: aiUsageLogTable.latencyMs,
      })
      .from(aiUsageLogTable)
      .where(gte(aiUsageLogTable.createdAt, since));

    for (const row of rows) {
      const p = row.provider;
      if (!PROVIDERS.includes(p as AiProviderName)) continue;
      let s = map.get(p);
      if (!s) {
        s = { provider: p, total: 0, errors: 0, latencies: [] };
        map.set(p, s);
      }
      s.total += 1;
      if (row.status === "error") s.errors += 1;
      if (typeof row.latencyMs === "number" && row.latencyMs > 0) {
        s.latencies.push(row.latencyMs);
      }
    }
  } catch (err) {
    console.error("[ai-router] loadUsageStats failed", err);
  }
  return map;
}

/**
 * Fase 2 health: adapter availability ∩ usage-window stats ∩ circuit breaker.
 */
export async function resolveProviderHealth(
  adapters: Partial<Record<AiProviderName, ProviderAdapter>>,
): Promise<Record<string, ProviderHealth>> {
  const stats = await loadUsageStats();
  const out: Record<string, ProviderHealth> = {};
  const now = Date.now();
  for (const name of PROVIDERS) {
    const available = adapters[name]?.isAvailable() ?? false;
    out[name] = evaluateHealthFromStats(name, available, stats.get(name), now);
  }
  return out;
}

export function getCircuitBreakerSnapshot(): Record<
  string,
  { open: boolean; consecutiveErrors: number; openUntilMs: number }
> {
  const now = Date.now();
  const out: Record<string, { open: boolean; consecutiveErrors: number; openUntilMs: number }> =
    {};
  for (const [k, v] of breakers.entries()) {
    out[k] = {
      open: v.openUntilMs > now,
      consecutiveErrors: v.consecutiveErrors,
      openUntilMs: v.openUntilMs,
    };
  }
  return out;
}
