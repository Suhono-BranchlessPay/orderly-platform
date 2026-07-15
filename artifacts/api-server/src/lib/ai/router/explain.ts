import { modelKey, taskStrength } from "./registry";
import type { RegisteredModel, RequestProfile, RoutingContext } from "./types";

export function explainDecision(
  winner: RegisteredModel,
  score: number,
  profile: RequestProfile,
  ctx: RoutingContext,
  candidateCount: number,
): string {
  const parts: string[] = [];

  if (profile.hasImage) parts.push("image=true → filter vision");
  if (profile.needsOcr) parts.push("needsOcr → filter ocr");
  if (profile.needsEmbedding) parts.push("needsEmbedding → filter embedding");
  if (profile.estimatedInputTokens > 8000) {
    parts.push(`tokens≈${profile.estimatedInputTokens} → context filter`);
  }

  const health = ctx.providerHealth[winner.provider]?.status ?? "unknown";
  parts.push(`health ${winner.provider}=${health}`);

  const strength = taskStrength(profile.task);
  if (winner.strengths.includes(strength)) {
    parts.push(`strength=${strength}`);
  }

  parts.push(`plan=${ctx.tenantPlan}`);
  if (ctx.budgetRemainingUsd < 5) parts.push("budget pressure → prefer cheap");

  parts.push(
    `score=${score.toFixed(1)} among ${candidateCount} candidates → ${modelKey(winner)}`,
  );

  return parts.join("; ");
}
