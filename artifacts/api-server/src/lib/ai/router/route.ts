import type { ProviderAdapter } from "../adapters/types";
import type { AiProviderName, AiRunInput, RouteSlot } from "../types";
import { buildRoutingContext } from "./context";
import { explainDecision } from "./explain";
import { filterCapableModels } from "./filter";
import { buildRequestProfile } from "./profile";
import { loadProviderRegistry, modelKey, resetRouterCaches } from "./registry";
import { scoreModel } from "./score";
import type { RegisteredModel, RoutingContext, RoutingDecision } from "./types";

export { resetRouterCaches };

function toSlot(m: RegisteredModel, maxTokens: number): RouteSlot {
  return {
    provider: m.provider,
    model: m.model,
    max_tokens: maxTokens,
    temperature: undefined,
  };
}

/**
 * Pure route — filter then score. Deterministic for same profile+context.
 */
export function route(
  profile: RoutingDecision["profile"],
  ctx: RoutingContext,
): RoutingDecision {
  const all = loadProviderRegistry();
  const { capable } = filterCapableModels(all, profile, ctx);

  if (capable.length === 0) {
    return {
      ok: false,
      primary: null,
      fallbacks: [],
      reason: `NO_CANDIDATE: no model capable for task=${profile.task} image=${profile.hasImage} ocr=${profile.needsOcr} tokens=${profile.estimatedInputTokens}`,
      candidatesConsidered: [],
      profile,
      context: ctx,
      error: "NO_CANDIDATE",
    };
  }

  const scored = capable
    .map((m) => ({ model: m, score: scoreModel(m, profile, ctx) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Stable tie-break for determinism
      return modelKey(a.model).localeCompare(modelKey(b.model));
    });

  const winner = scored[0]!;
  const reason = explainDecision(
    winner.model,
    winner.score,
    profile,
    ctx,
    scored.length,
  );

  return {
    ok: true,
    primary: winner.model,
    fallbacks: scored.slice(1).map((s) => s.model),
    reason,
    candidatesConsidered: scored.map((s) => `${modelKey(s.model)}:${s.score.toFixed(1)}`),
    profile,
    context: ctx,
  };
}

export type ResolvedRouteChain = {
  decision: RoutingDecision;
  primary: RouteSlot | null;
  fallbacks: RouteSlot[];
};

/**
 * Build profile + context from ai.run input, then route.
 * Logs decision + reason (observability).
 */
export function resolveRouteForRun(
  input: AiRunInput,
  adapters: Partial<Record<AiProviderName, ProviderAdapter>>,
  contextOverrides?: Partial<RoutingContext>,
): ResolvedRouteChain {
  const profile = buildRequestProfile(input.task, input.input, {
    ...input.opts,
    language: input.language,
  });

  const ctx = buildRoutingContext({
    tenantId: input.tenantId,
    adapters,
    tenantPlan: contextOverrides?.tenantPlan,
    budgetRemainingUsd: contextOverrides?.budgetRemainingUsd,
    slaTier: contextOverrides?.slaTier,
    providerHealth: contextOverrides?.providerHealth,
  });

  // Manual override (ops / A/B) — skip scoring, still log.
  if (input.opts?.providerOverride || input.opts?.modelOverride) {
    const provider = (input.opts.providerOverride ?? "local") as AiProviderName;
    const model = input.opts.modelOverride ?? "rules-v1";
    const forced: RegisteredModel = {
      provider,
      model,
      capabilities: ["chat", "vision", "ocr", "embedding"],
      context_limit: 1_000_000,
      strengths: ["writing"],
      cost_per_1k: { input: 0, output: 0 },
      languages_strong: ["en"],
      quality_rank: 1,
      speed_rank: 1,
    };
    const decision: RoutingDecision = {
      ok: true,
      primary: forced,
      fallbacks: [],
      reason: `override provider=${provider} model=${model}`,
      candidatesConsidered: [modelKey(forced)],
      profile,
      context: ctx,
    };
    logDecision(decision);
    return {
      decision,
      primary: toSlot(forced, profile.maxOutputTokens),
      fallbacks: [],
    };
  }

  // Env convenience for social_draft (ops)
  if (input.task === "social_draft") {
    const override = process.env.AI_SOCIAL_DRAFT_PROVIDER?.trim() as AiProviderName | undefined;
    if (override && ["local", "openai", "anthropic", "gemini"].includes(override)) {
      const reg = loadProviderRegistry().find((m) => m.provider === override);
      if (reg) {
        const decision: RoutingDecision = {
          ok: true,
          primary: reg,
          fallbacks: loadProviderRegistry().filter(
            (m) => m.provider !== override && m.capabilities.includes("chat"),
          ),
          reason: `env AI_SOCIAL_DRAFT_PROVIDER=${override}`,
          candidatesConsidered: [modelKey(reg)],
          profile,
          context: ctx,
        };
        logDecision(decision);
        return {
          decision,
          primary: toSlot(reg, profile.maxOutputTokens),
          fallbacks: decision.fallbacks.map((m) => toSlot(m, profile.maxOutputTokens)),
        };
      }
    }
  }

  const decision = route(profile, ctx);
  logDecision(decision);

  if (!decision.ok || !decision.primary) {
    return { decision, primary: null, fallbacks: [] };
  }

  return {
    decision,
    primary: toSlot(decision.primary, profile.maxOutputTokens),
    fallbacks: decision.fallbacks.map((m) => toSlot(m, profile.maxOutputTokens)),
  };
}

function logDecision(decision: RoutingDecision): void {
  // Structured console line — picked up by PM2 / pino-http host logs without
  // coupling the pure router graph to the pino transport (keeps verify bundle light).
  try {
    console.info(
      JSON.stringify({
        event: "ai_router_decision",
        task: decision.profile.task,
        tenantId: decision.context.tenantId,
        ok: decision.ok,
        chosen: decision.primary ? modelKey(decision.primary) : null,
        reason: decision.reason,
        candidates_considered: decision.candidatesConsidered,
        fallbacks: decision.fallbacks.map(modelKey),
        error: decision.error,
      }),
    );
  } catch {
    // logging must never break routing
  }
}

/** Replay for debug/tests: profile + context → decision. */
export function replayRoute(
  profile: RoutingDecision["profile"],
  ctx: RoutingContext,
): RoutingDecision {
  return route(profile, ctx);
}
