import type { RegisteredModel, RequestProfile, RoutingContext } from "./types";

export type FilterRejectReason =
  | "missing_vision"
  | "missing_ocr"
  | "missing_embedding"
  | "context_limit"
  | "provider_down";

/**
 * HARD constraints only. Never score here.
 */
export function filterCapableModels(
  models: RegisteredModel[],
  profile: RequestProfile,
  ctx: RoutingContext,
): { capable: RegisteredModel[]; rejected: Array<{ model: RegisteredModel; reason: FilterRejectReason }> } {
  const rejected: Array<{ model: RegisteredModel; reason: FilterRejectReason }> = [];
  const capable: RegisteredModel[] = [];

  for (const m of models) {
    if (profile.hasImage && !m.capabilities.includes("vision")) {
      rejected.push({ model: m, reason: "missing_vision" });
      continue;
    }
    if (profile.needsOcr && !m.capabilities.includes("ocr")) {
      rejected.push({ model: m, reason: "missing_ocr" });
      continue;
    }
    if (profile.needsEmbedding && !m.capabilities.includes("embedding")) {
      rejected.push({ model: m, reason: "missing_embedding" });
      continue;
    }
    const needed = profile.estimatedInputTokens + profile.maxOutputTokens;
    if (needed > m.context_limit) {
      rejected.push({ model: m, reason: "context_limit" });
      continue;
    }
    if (ctx.providerHealth[m.provider]?.status === "down") {
      rejected.push({ model: m, reason: "provider_down" });
      continue;
    }
    capable.push(m);
  }

  return { capable, rejected };
}
