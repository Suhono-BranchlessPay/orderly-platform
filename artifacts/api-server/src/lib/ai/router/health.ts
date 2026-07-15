import type { ProviderAdapter } from "../adapters/types";
import type { AiProviderName } from "../types";
import type { ProviderHealth } from "./types";
import { resolveProviderHealth } from "./healthMonitor";

export {
  resolveProviderHealth,
  recordProviderOutcome,
  evaluateHealthFromStats,
  resetHealthMonitorForTests,
  getCircuitBreakerSnapshot,
} from "./healthMonitor";

/**
 * Sync stub (tests / replay): availability only.
 * Runtime routing should prefer `resolveProviderHealth()` (async, usage + breaker).
 */
export function snapshotProviderHealth(
  adapters: Partial<Record<AiProviderName, ProviderAdapter>>,
): Record<string, ProviderHealth> {
  const names: AiProviderName[] = ["local", "openai", "anthropic", "gemini"];
  const out: Record<string, ProviderHealth> = {};
  for (const name of names) {
    const available = adapters[name]?.isAvailable() ?? false;
    out[name] = {
      status: available ? "healthy" : "down",
      p95LatencyMs: available ? 200 : 0,
      errorRate: available ? 0 : 1,
    };
  }
  return out;
}

/** Test / replay helper — merge overrides onto a healthy baseline. */
export function healthWithOverrides(
  overrides: Partial<Record<string, ProviderHealth>>,
): Record<string, ProviderHealth> {
  const base = snapshotProviderHealth({});
  for (const [k, v] of Object.entries(overrides)) {
    if (v) base[k] = v;
  }
  return base;
}

/** Convenience for callers that already have adapters. */
export async function snapshotProviderHealthAsync(
  adapters: Partial<Record<AiProviderName, ProviderAdapter>>,
): Promise<Record<string, ProviderHealth>> {
  return resolveProviderHealth(adapters);
}
