/**
 * Blok 4.1 — env-only config for the social trial skeleton.
 * Tokens/secrets are NEVER stored in the DB — see docs/BLOK4_SOCIAL_TRIAL.md.
 */
import { tenantSecret } from "./tenant";

/** Only tenant enrolled in the trial. Kept as a const so it's obvious this is
 * intentionally single-tenant right now, not a bug. */
export const SOCIAL_TRIAL_TENANT_IDS = ["samurai"];

export function isSocialTrialTenant(tenantId: string | null | undefined): boolean {
  return Boolean(tenantId) && SOCIAL_TRIAL_TENANT_IDS.includes(tenantId as string);
}

/** Per-tenant kill switch: SOCIAL_KILL_SWITCH_<TENANT_ID_UPPER>=1 */
export function isSocialKillSwitchOn(tenantId: string): boolean {
  const key = `SOCIAL_KILL_SWITCH_${tenantId.toUpperCase()}`;
  return process.env[key]?.trim() === "1";
}

/** Global send gate — off by default. Approval alone is never enough to send. */
export function isSocialSendGloballyEnabled(): boolean {
  return process.env.SOCIAL_SEND_ENABLED?.trim() === "1";
}

/**
 * Auto-draft every inbound comment on arrival (still human-approve before send).
 * ON by default so the inbox is never full of "No draft yet"; set
 * SOCIAL_AUTO_DRAFT_ENABLED=0 to fall back to manual "Draft" clicks only.
 * Drafting still routes through the gateway guardrails (peer/allergy/spam skip).
 */
export function isSocialAutoDraftEnabled(): boolean {
  const v = process.env.SOCIAL_AUTO_DRAFT_ENABLED?.trim();
  return v !== "0" && v !== "false";
}

/** TENANT_{ID}_META_PAGE_ACCESS_TOKEN, else global META_PAGE_ACCESS_TOKEN. */
export function getMetaPageAccessToken(tenantId: string): string | undefined {
  return tenantSecret(tenantId, "META_PAGE_ACCESS_TOKEN");
}

export function getMetaAppSecret(): string | undefined {
  return process.env.META_APP_SECRET?.trim() || undefined;
}

export function getMetaWebhookVerifyToken(): string | undefined {
  return process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() || undefined;
}

/** Optional brand-voice hint for draft templates — plain env, not a theme table write. */
export function getBrandVoiceHint(tenantId: string): string {
  return (
    tenantSecret(tenantId, "SOCIAL_BRAND_VOICE") ||
    "Warm, friendly, and welcoming — like a cheerful host at a family-owned restaurant. " +
      "Thank sincerely, mirror one specific detail they mentioned when present, invite them back gently. " +
      "1–2 short sentences; never corporate or robotic."
  );
}

/**
 * Map a Meta Page ID to an Orderly tenant id. Configure via
 * META_PAGE_ID_TENANT_MAP_JSON = {"<pageId>":"samurai"}.
 * Falls back to SOCIAL_DEFAULT_TENANT_ID (default "samurai") since the trial
 * is intentionally single-tenant — do NOT rely on the fallback once a second
 * tenant is onboarded.
 */
export function resolveTenantIdForPageId(pageId: string | undefined): string {
  const json = process.env.META_PAGE_ID_TENANT_MAP_JSON?.trim();
  if (json && pageId) {
    try {
      const map = JSON.parse(json) as Record<string, string>;
      if (map[pageId]) return map[pageId];
    } catch {
      /* fall through to default */
    }
  }
  return process.env.SOCIAL_DEFAULT_TENANT_ID?.trim() || "samurai";
}
