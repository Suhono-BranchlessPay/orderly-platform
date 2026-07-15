import { createAnthropicAdapter } from "./adapters/anthropicChat";
import { createLocalSocialAdapter } from "./adapters/localSocial";
import { createOpenAiAdapter } from "./adapters/openaiChat";
import type { ProviderAdapter } from "./adapters/types";
import { isAiGatewayEnabled, slotParams } from "./config";
import { parseSocialDraftOutput, preflightBlocksAi } from "./guardrails";
import { resolveRouteForRun } from "./router";
import { buildLocalSocialUserPayload, buildSocialDraftMessages } from "./tasks/socialDraftPrompt";
import type {
  AiProviderName,
  AiRunInput,
  AiRunResult,
  NormalizedChatRequest,
  RouteSlot,
} from "./types";
import { writeAiUsageLog } from "./usageLog";

function adapters(): Record<AiProviderName, ProviderAdapter> {
  return {
    local: createLocalSocialAdapter(),
    openai: createOpenAiAdapter(),
    anthropic: createAnthropicAdapter(),
    gemini: createLocalSocialAdapter(), // stub until Fase 2
  };
}

function buildRequest(input: AiRunInput, slot: RouteSlot): NormalizedChatRequest {
  const params = slotParams(slot, {
    maxTokens: input.opts?.maxTokens,
    temperature: input.opts?.temperature,
  });
  const responseFormat = input.opts?.responseFormat ?? "json";

  if (input.task === "social_draft") {
    if (slot.provider === "local") {
      return {
        system: "local-social-rules",
        user: buildLocalSocialUserPayload({
          messageText: String(input.input.message_text ?? ""),
          authorName: (input.input.author_name as string | null) ?? null,
          tenantName: String(input.input.tenant_name ?? "our restaurant"),
          heuristicClassification: String(input.input.heuristic_classification ?? "unknown"),
          brandVoice: String(input.input.brand_voice ?? ""),
        }),
        maxTokens: params.maxTokens,
        temperature: params.temperature,
        responseFormat,
        model: params.model,
      };
    }

    const msgs = buildSocialDraftMessages({
      restaurantName: String(input.input.tenant_name ?? "Restaurant"),
      cuisineType: String(input.input.cuisine_type ?? "restaurant"),
      city: String(input.input.city ?? ""),
      state: String(input.input.state ?? ""),
      address: String(input.input.address ?? ""),
      hours: String(input.input.hours ?? ""),
      menuItemNames: String(input.input.menu_item_names ?? ""),
      orderUrl: String(input.input.order_url ?? ""),
      brandVoiceNotes: String(input.input.brand_voice ?? ""),
      platform: String(input.input.platform ?? "facebook"),
      messageType: String(input.input.message_type ?? "comment"),
      authorFirstName: String(input.input.author_first_name ?? ""),
      authorDisplayName: String(input.input.author_name ?? ""),
      messageText: String(input.input.message_text ?? ""),
      engagementMode: String(input.input.engagement_mode ?? "conservative"),
      tenantLanguages: String(input.input.tenant_languages ?? "en"),
    });
    return {
      system: msgs.system,
      user: msgs.user,
      maxTokens: params.maxTokens,
      temperature: params.temperature,
      responseFormat,
      model: params.model,
    };
  }

  // Generic fallback for unimplemented tasks.
  return {
    system: `Task ${input.task} — return JSON.`,
    user: JSON.stringify(input.input),
    maxTokens: params.maxTokens,
    temperature: params.temperature,
    responseFormat,
    model: params.model,
  };
}

function postProcess(task: string, text: string): { ok: boolean; output: unknown; error?: string } {
  if (task === "social_draft") {
    const parsed = parseSocialDraftOutput(text);
    if (!parsed) return { ok: false, output: null, error: "invalid_social_draft_json" };
    return { ok: true, output: parsed };
  }
  return { ok: true, output: text };
}

async function callSlot(
  input: AiRunInput,
  slot: RouteSlot,
  all: Record<AiProviderName, ProviderAdapter>,
): Promise<{ result: AiRunResult } | { error: string; provider: string; model: string }> {
  const started = Date.now();
  const params = slotParams(slot, {
    maxTokens: input.opts?.maxTokens,
    temperature: input.opts?.temperature,
  });
  const adapter = all[params.provider];
  if (!adapter?.isAvailable()) {
    return {
      error: `provider_unavailable:${params.provider}`,
      provider: params.provider,
      model: params.model,
    };
  }

  try {
    const req = buildRequest(input, { ...slot, provider: params.provider, model: params.model });
    const raw = await adapter.chat(req);
    const processed = postProcess(input.task, raw.text);
    const latencyMs = Date.now() - started;
    const costUsd = adapter.estimateCost(params.model, raw.inputTokens, raw.outputTokens);

    if (!processed.ok) {
      return {
        error: processed.error ?? "post_process_failed",
        provider: params.provider,
        model: params.model,
      };
    }

    return {
      result: {
        ok: true,
        output: processed.output,
        model: params.model,
        provider: params.provider,
        usage: {
          inputTokens: raw.inputTokens,
          outputTokens: raw.outputTokens,
          costUsd,
        },
        latencyMs,
        fallbackUsed: false,
      },
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : String(err),
      provider: params.provider,
      model: params.model,
    };
  }
}

/**
 * Sole entry point for features. Do not call vendor SDKs from feature code.
 */
export async function run(input: AiRunInput): Promise<AiRunResult> {
  const started = Date.now();

  if (!input.tenantId?.trim()) {
    return {
      ok: false,
      output: null,
      model: "",
      provider: "",
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      latencyMs: 0,
      fallbackUsed: false,
      error: "tenantId_required",
    };
  }

  if (!isAiGatewayEnabled()) {
    return {
      ok: false,
      output: null,
      model: "",
      provider: "gateway",
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      latencyMs: Date.now() - started,
      fallbackUsed: false,
      error: "ai_gateway_disabled",
    };
  }

  const block = preflightBlocksAi(input.task, input.input);
  if (block) {
    const result: AiRunResult = {
      ok: false,
      output: {
        classification: "escalate",
        reason: block,
        confidence: 1,
        draft: "",
        language: "en",
      },
      model: "guardrail",
      provider: "gateway",
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      latencyMs: Date.now() - started,
      fallbackUsed: false,
      error: block,
    };
    await writeAiUsageLog({
      tenantId: input.tenantId,
      task: input.task,
      provider: "gateway",
      model: "guardrail",
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs: result.latencyMs,
      fallbackUsed: false,
      status: "blocked",
      error: block,
    });
    // For social_draft, blocked allergy still returns structured escalate output as ok for caller.
    if (input.task === "social_draft") {
      return { ...result, ok: true, error: undefined };
    }
    return result;
  }

  const all = adapters();
  const resolved = resolveRouteForRun(input, all);

  if (!resolved.primary) {
    const result: AiRunResult = {
      ok: false,
      output: null,
      model: "",
      provider: "router",
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      latencyMs: Date.now() - started,
      fallbackUsed: false,
      error: resolved.decision.reason || "NO_CANDIDATE",
    };
    await writeAiUsageLog({
      tenantId: input.tenantId,
      task: input.task,
      provider: "router",
      model: "none",
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs: result.latencyMs,
      fallbackUsed: false,
      status: "error",
      error: result.error,
    });
    return result;
  }

  const chain: RouteSlot[] = [resolved.primary, ...resolved.fallbacks];
  const errors: string[] = [];

  for (let i = 0; i < chain.length; i++) {
    const slot = chain[i]!;
    const attempt = await callSlot(input, slot, all);
    if ("result" in attempt) {
      const result = { ...attempt.result, fallbackUsed: i > 0 };
      await writeAiUsageLog({
        tenantId: input.tenantId,
        task: input.task,
        provider: result.provider,
        model: result.model,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        costUsd: result.usage.costUsd,
        latencyMs: result.latencyMs,
        fallbackUsed: result.fallbackUsed,
        status: "ok",
      });
      return result;
    }
    errors.push(`${slot.provider}/${slot.model}:${attempt.error}`);
  }

  const last = chain[chain.length - 1]!;
  const result: AiRunResult = {
    ok: false,
    output: null,
    model: last.model,
    provider: last.provider,
    usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    latencyMs: Date.now() - started,
    fallbackUsed: chain.length > 1,
    error: errors.join("; "),
  };
  await writeAiUsageLog({
    tenantId: input.tenantId,
    task: input.task,
    provider: result.provider,
    model: result.model,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    latencyMs: result.latencyMs,
    fallbackUsed: result.fallbackUsed,
    status: "error",
    error: result.error,
  });
  return result;
}
