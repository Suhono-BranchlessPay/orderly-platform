/**
 * Meta Conversion API (ads) — per-tenant config.
 * Separate from Blok 4.1 social Page messaging tokens.
 *
 * Fail-closed: only TENANT_{ID}_* Pixel/token. Never fall back to shared
 * META_PIXEL_ID / META_CAPI_ACCESS_TOKEN (would mix all restaurants into one
 * Meta account when CAPI is enabled for a single outlet).
 */
import { tenantOnlySecret } from "./tenant";

export function isMetaCapiGloballyEnabled(): boolean {
  return process.env.META_CAPI_ENABLED?.trim() === "1";
}

/** When true (default), hashed phone/email only if marketing consent flags are set. */
export function metaCapiRequiresMarketingConsent(): boolean {
  const raw = process.env.META_CAPI_REQUIRE_MARKETING_CONSENT?.trim();
  if (raw === "0" || raw === "false") return false;
  return true;
}

export type MetaCapiTenantCreds = {
  pixelId: string;
  accessToken: string;
  testEventCode?: string;
};

/**
 * Resolve Pixel + CAPI token for a tenant (tenant-prefixed env only).
 * Missing TENANT_{ID}_META_PIXEL_ID or TENANT_{ID}_META_CAPI_ACCESS_TOKEN → null (no send).
 */
export function resolveMetaCapiCreds(
  tenantId: string,
): MetaCapiTenantCreds | null {
  const pixelId = tenantOnlySecret(tenantId, "META_PIXEL_ID") || "";
  const accessToken = tenantOnlySecret(tenantId, "META_CAPI_ACCESS_TOKEN") || "";
  if (!pixelId || !accessToken) return null;
  const testEventCode =
    tenantOnlySecret(tenantId, "META_CAPI_TEST_EVENT_CODE") || undefined;
  return {
    pixelId,
    accessToken,
    testEventCode: testEventCode || undefined,
  };
}

export function metaGraphVersion(): string {
  return process.env.META_GRAPH_API_VERSION?.trim() || "v21.0";
}
