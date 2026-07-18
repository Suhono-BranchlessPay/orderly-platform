/**
 * AI Gateway public types — features depend ONLY on these + run().
 * See docs/SPEC_AI_GATEWAY.md.
 */

export type AiTask =
  | "social_draft"
  | "social_post_draft"
  | "review_draft"
  | "daily_report"
  | "content_calendar"
  | "classify"
  | "menu_from_photo"
  | "menu_description"
  | "customer_insight"
  | "upsell"
  | "embedding"
  | "support_answer";

export type AiProviderName = "local" | "openai" | "anthropic" | "gemini";

export type AiRunOpts = {
  maxTokens?: number;
  temperature?: number;
  responseFormat?: "text" | "json";
  /** Force a provider/model for A/B — still goes through adapters. */
  modelOverride?: string;
  providerOverride?: AiProviderName;
  /** Router: override profile token estimate. */
  estimatedInputTokens?: number;
  /** Router: user waiting (prefer latency when SLA guaranteed). */
  realtime?: boolean;
};

export type AiRunInput = {
  task: AiTask;
  /** Required — logging, cost attribution, isolation. */
  tenantId: string;
  input: Record<string, unknown>;
  language?: string;
  opts?: AiRunOpts;
};

export type AiUsage = {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

export type AiRunResult = {
  ok: boolean;
  output: unknown;
  model: string;
  provider: string;
  usage: AiUsage;
  latencyMs: number;
  fallbackUsed: boolean;
  error?: string;
};

export type NormalizedChatRequest = {
  system: string;
  user: string;
  maxTokens: number;
  temperature: number;
  responseFormat: "text" | "json";
  model: string;
};

export type NormalizedChatResponse = {
  text: string;
  inputTokens: number;
  outputTokens: number;
};

export type RouteSlot = {
  provider: AiProviderName;
  model: string;
  max_tokens?: number;
  temperature?: number;
};

export type TaskRoute = {
  primary: RouteSlot;
  fallback?: RouteSlot;
};

export type AiRoutingConfig = {
  tasks: Partial<Record<AiTask, TaskRoute>>;
  pricing_usd_per_1m: Record<string, { input: number; output: number }>;
};
