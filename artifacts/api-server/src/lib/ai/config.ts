import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AiProviderName, AiRoutingConfig, AiTask, RouteSlot, TaskRoute } from "./types";

const DEFAULT_ROUTING: AiRoutingConfig = {
  tasks: {
    social_draft: {
      primary: { provider: "local", model: "rules-v1", max_tokens: 300, temperature: 0.7 },
      fallback: { provider: "openai", model: "gpt-4o-mini", max_tokens: 300, temperature: 0.7 },
    },
  },
  pricing_usd_per_1m: {
    "gpt-4o-mini": { input: 0.15, output: 0.6 },
    "claude-sonnet": { input: 3.0, output: 15.0 },
    "rules-v1": { input: 0, output: 0 },
  },
};

let cached: AiRoutingConfig | null = null;

function loadRoutingFile(): AiRoutingConfig {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    // src/lib/ai → ../../../config (api-server/config)
    const candidates = [
      path.resolve(process.cwd(), "config/ai-routing.json"),
      path.resolve(process.cwd(), "dist/config/ai-routing.json"),
      path.resolve(here, "../../../config/ai-routing.json"),
      path.resolve(process.cwd(), "artifacts/api-server/config/ai-routing.json"),
    ];
    for (const p of candidates) {
      try {
        const raw = readFileSync(p, "utf8");
        return JSON.parse(raw) as AiRoutingConfig;
      } catch {
        /* try next */
      }
    }
  } catch {
    /* use default */
  }
  return DEFAULT_ROUTING;
}

export function getAiRoutingConfig(): AiRoutingConfig {
  if (!cached) cached = loadRoutingFile();
  return cached;
}

/** Test helper / hot-reload after config edit in long-lived process. */
export function resetAiRoutingCache(): void {
  cached = null;
}

export function isAiGatewayEnabled(): boolean {
  const v = process.env.AI_GATEWAY_ENABLED?.trim();
  if (v === "0" || v === "false") return false;
  // Default ON for new path; set AI_GATEWAY_ENABLED=0 to emergency-rollback to old templates only.
  return true;
}

/**
 * Legacy static task→slot map (ai-routing.json).
 * Prefer `resolveRouteForRun` / router (SPEC_AI_ROUTER). Kept for pricing helpers & rollback.
 */
export function resolveTaskRoute(task: AiTask): TaskRoute {
  const cfg = getAiRoutingConfig();
  const route = cfg.tasks[task] ?? DEFAULT_ROUTING.tasks[task];
  if (!route) {
    return {
      primary: { provider: "local", model: "rules-v1", max_tokens: 300, temperature: 0.3 },
    };
  }

  if (task === "social_draft") {
    const override = process.env.AI_SOCIAL_DRAFT_PROVIDER?.trim() as AiProviderName | undefined;
    if (override && ["local", "openai", "anthropic", "gemini"].includes(override)) {
      return {
        ...route,
        primary: { ...route.primary, provider: override },
      };
    }
  }

  return route;
}

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = getAiRoutingConfig().pricing_usd_per_1m[model] ?? { input: 0, output: 0 };
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

export function slotParams(slot: RouteSlot, opts?: { maxTokens?: number; temperature?: number }) {
  return {
    provider: slot.provider,
    model: slot.model,
    maxTokens: opts?.maxTokens ?? slot.max_tokens ?? 300,
    temperature: opts?.temperature ?? slot.temperature ?? 0.5,
  };
}
