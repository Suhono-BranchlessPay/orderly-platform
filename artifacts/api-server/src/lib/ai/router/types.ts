import type { AiProviderName, AiTask } from "../types";

export type ModelCapability = "chat" | "vision" | "ocr" | "embedding";

export type ModelStrength =
  | "writing"
  | "instruction_following"
  | "safety"
  | "vision"
  | "ocr"
  | "long_context"
  | "classification"
  | "cheap"
  | "embedding";

export type RegisteredModel = {
  provider: AiProviderName;
  model: string;
  capabilities: ModelCapability[];
  context_limit: number;
  strengths: ModelStrength[];
  cost_per_1k: { input: number; output: number };
  languages_strong: string[];
  quality_rank: number;
  speed_rank: number;
};

export type RequestProfile = {
  task: AiTask;
  estimatedInputTokens: number;
  maxOutputTokens: number;
  hasImage: boolean;
  needsOcr: boolean;
  needsEmbedding: boolean;
  language: string;
  realtime: boolean;
};

export type ProviderHealthStatus = "healthy" | "degraded" | "down";

export type ProviderHealth = {
  status: ProviderHealthStatus;
  p95LatencyMs: number;
  errorRate: number;
};

export type TenantPlan = "free" | "standard" | "premium";
export type SlaTier = "best_effort" | "standard" | "guaranteed";

export type RoutingContext = {
  tenantId: string;
  tenantPlan: TenantPlan;
  budgetRemainingUsd: number;
  slaTier: SlaTier;
  providerHealth: Record<string, ProviderHealth>;
};

export type RoutingDecision = {
  ok: boolean;
  primary: RegisteredModel | null;
  fallbacks: RegisteredModel[];
  reason: string;
  candidatesConsidered: string[];
  profile: RequestProfile;
  context: RoutingContext;
  error?: "NO_CANDIDATE" | "ROUTER_ERROR";
};

export type RouterWeights = {
  quality: number;
  language: number;
  cost_lo: number;
  cost_hi: number;
  quality_bonus: number;
  cost_bonus: number;
  latency: number;
  degraded_penalty: number;
  budget_pressure_usd: number;
  task_defaults: Partial<
    Record<
      AiTask,
      {
        max_output_tokens?: number;
        realtime?: boolean;
        needs_ocr?: boolean;
        needs_embedding?: boolean;
      }
    >
  >;
};
