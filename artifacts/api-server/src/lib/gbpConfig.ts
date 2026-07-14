/**
 * Blok 4.2 — Google Business Profile trial config.
 * Tokens never in DB — env only. See docs/BLOK4_GBP_TRIAL.md.
 */
import { tenantSecret } from "./tenant";

/** Hard-coded trial allow-list (same as social 4.1). */
export const GBP_TRIAL_TENANT_IDS = ["samurai"] as const;

export function isGbpTrialTenant(tenantId: string | null | undefined): boolean {
  return Boolean(tenantId) && (GBP_TRIAL_TENANT_IDS as readonly string[]).includes(tenantId as string);
}

export function isGbpKillSwitchOn(tenantId: string): boolean {
  const key = `GBP_KILL_SWITCH_${tenantId.toUpperCase()}`;
  return process.env[key]?.trim() === "1";
}

/** Global off-by-default send gate. */
export function isGbpSendGloballyEnabled(): boolean {
  return process.env.GBP_SEND_ENABLED?.trim() === "1";
}

/** Per-tenant then global GBP OAuth access token (future Graph/Business Profile API). */
export function getGbpAccessToken(tenantId: string): string | undefined {
  return tenantSecret(tenantId, "GBP_ACCESS_TOKEN");
}

/**
 * Map Google Business Profile location resource name / id → tenant.
 * Example: {"locations/12345":"samurai"} or {"12345":"samurai"}
 */
export function resolveTenantIdForGbpLocation(
  locationId: string | null | undefined,
): string {
  const raw = process.env.GBP_LOCATION_ID_TENANT_MAP_JSON?.trim();
  if (raw && locationId) {
    try {
      const map = JSON.parse(raw) as Record<string, string>;
      const hit = map[locationId] || map[locationId.replace(/^locations\//, "")];
      if (hit && typeof hit === "string") return hit.trim();
    } catch {
      /* ignore bad JSON */
    }
  }
  return process.env.GBP_DEFAULT_TENANT_ID?.trim() || "samurai";
}

export function buildGbpHealth(tenantIds: readonly string[]) {
  return {
    send_globally_enabled: isGbpSendGloballyEnabled(),
    tenants: tenantIds.map((tenant_id) => ({
      tenant_id,
      kill_switch: isGbpKillSwitchOn(tenant_id),
      send_globally_enabled: isGbpSendGloballyEnabled(),
      gbp_token_configured: Boolean(getGbpAccessToken(tenant_id)),
      trial: isGbpTrialTenant(tenant_id),
    })),
  };
}
