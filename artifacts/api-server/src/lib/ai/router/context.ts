import type { AiProviderName } from "../types";
import type { ProviderAdapter } from "../adapters/types";
import { snapshotProviderHealth } from "./health";
import type { RoutingContext, SlaTier, TenantPlan } from "./types";

export type RoutingContextInput = {
  tenantId: string;
  tenantPlan?: TenantPlan;
  budgetRemainingUsd?: number;
  slaTier?: SlaTier;
  adapters?: Partial<Record<AiProviderName, ProviderAdapter>>;
  providerHealth?: RoutingContext["providerHealth"];
};

/**
 * Load runtime routing context. Fase 1: env/defaults for plan & budget.
 * Fase 2: DB tenant plan + monthly AI spend vs cap.
 */
export function buildRoutingContext(input: RoutingContextInput): RoutingContext {
  const planEnv = process.env.AI_TENANT_PLAN_DEFAULT?.trim() as TenantPlan | undefined;
  const tenantPlan: TenantPlan =
    input.tenantPlan ??
    (planEnv === "free" || planEnv === "standard" || planEnv === "premium"
      ? planEnv
      : "standard");

  const budgetEnv = Number(process.env.AI_BUDGET_REMAINING_USD_DEFAULT ?? "100");
  const budgetRemainingUsd =
    typeof input.budgetRemainingUsd === "number" && Number.isFinite(input.budgetRemainingUsd)
      ? input.budgetRemainingUsd
      : Number.isFinite(budgetEnv)
        ? budgetEnv
        : 100;

  const slaEnv = process.env.AI_SLA_TIER_DEFAULT?.trim() as SlaTier | undefined;
  const slaTier: SlaTier =
    input.slaTier ??
    (slaEnv === "best_effort" || slaEnv === "standard" || slaEnv === "guaranteed"
      ? slaEnv
      : "standard");

  const providerHealth =
    input.providerHealth ?? snapshotProviderHealth(input.adapters ?? {});

  return {
    tenantId: input.tenantId,
    tenantPlan,
    budgetRemainingUsd,
    slaTier,
    providerHealth,
  };
}
