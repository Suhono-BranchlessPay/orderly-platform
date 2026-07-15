import { loadRouterWeights, taskStrength } from "./registry";
import type { RegisteredModel, RequestProfile, RoutingContext } from "./types";

function cheapnessScore(m: RegisteredModel): number {
  const avg = (m.cost_per_1k.input + m.cost_per_1k.output) / 2;
  // Map cost → 0..1 where cheaper is higher. Local (0) → 1.
  if (avg <= 0) return 1;
  // gpt-4o-mini ~0.000375, sonnet ~0.009 — log scale
  const score = 1 / (1 + avg * 2000);
  return Math.max(0, Math.min(1, score));
}

function speedScore(m: RegisteredModel, ctx: RoutingContext): number {
  const health = ctx.providerHealth[m.provider];
  const latencyFactor =
    health && health.p95LatencyMs > 0
      ? Math.max(0, 1 - health.p95LatencyMs / 5000)
      : m.speed_rank;
  return (m.speed_rank + latencyFactor) / 2;
}

export function scoreModel(
  m: RegisteredModel,
  profile: RequestProfile,
  ctx: RoutingContext,
): number {
  const W = loadRouterWeights();
  let score = 0;

  const strength = taskStrength(profile.task);
  if (m.strengths.includes(strength)) score += W.quality;

  if (m.languages_strong?.includes(profile.language)) score += W.language;

  const budgetPressure =
    ctx.budgetRemainingUsd < W.budget_pressure_usd ? W.cost_hi : W.cost_lo;
  score += budgetPressure * cheapnessScore(m);

  if (ctx.tenantPlan === "premium") {
    score += W.quality_bonus * m.quality_rank;
  }
  if (ctx.tenantPlan === "free") {
    score += W.cost_bonus * cheapnessScore(m);
  }

  if (profile.realtime && ctx.slaTier === "guaranteed") {
    score += W.latency * speedScore(m, ctx);
  }

  if (ctx.providerHealth[m.provider]?.status === "degraded") {
    score -= W.degraded_penalty;
  }

  return score;
}

export { cheapnessScore };
