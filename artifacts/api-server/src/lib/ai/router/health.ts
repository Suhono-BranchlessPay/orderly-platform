import type { ProviderAdapter } from "../adapters/types";
import type { AiProviderName } from "../types";
import type { ProviderHealth } from "./types";

/**
 * Fase 1 stub: derive health from adapter availability.
 * Fase 2: circuit breaker from ai_usage_log + light pings.
 */
export function snapshotProviderHealth(
  adapters: Partial<Record<AiProviderName, ProviderAdapter>>,
): Record<string, ProviderHealth> {
  const names: AiProviderName[] = ["local", "openai", "anthropic", "gemini"];
  const out: Record<string, ProviderHealth> = {};
  for (const name of names) {
    const adapter = adapters[name];
    const available = adapter?.isAvailable() ?? false;
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
