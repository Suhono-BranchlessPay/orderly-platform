/**
 * Meta Conversion API (ads) — per-tenant config.
 * Separate from Blok 4.1 social Page messaging tokens.
 */
import { tenantSecret } from "./tenant";

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
 * Resolve Pixel + CAPI token for a tenant.
 * Prefer TENANT_{ID}_META_PIXEL_ID / TENANT_{ID}_META_CAPI_ACCESS_TOKEN,
 * else global META_PIXEL_ID / META_CAPI_ACCESS_TOKEN (single-tenant trials).
 */
export function resolveMetaCapiCreds(
  tenantId: string,
): MetaCapiTenantCreds | null {
  const pixelId =
    tenantSecret(tenantId, "META_PIXEL_ID") ||
    process.env.META_PIXEL_ID?.trim() ||
    "";
  const accessToken =
    tenantSecret(tenantId, "META_CAPI_ACCESS_TOKEN") ||
    process.env.META_CAPI_ACCESS_TOKEN?.trim() ||
    "";
  if (!pixelId || !accessToken) return null;
  const testEventCode =
    tenantSecret(tenantId, "META_CAPI_TEST_EVENT_CODE") ||
    process.env.META_CAPI_TEST_EVENT_CODE?.trim() ||
    undefined;
  return {
    pixelId,
    accessToken,
    testEventCode: testEventCode || undefined,
  };
}

export function metaGraphVersion(): string {
  return process.env.META_GRAPH_API_VERSION?.trim() || "v21.0";
}
