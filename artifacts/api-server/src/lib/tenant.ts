import { db } from "@workspace/db";
import { tenantsTable, type Tenant } from "@workspace/db";
import { eq } from "drizzle-orm";

/** Runtime tenant context attached to each request. */
export type TenantContext = {
  id: string;
  slug: string;
  name: string;
  domain: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  theme: Record<string, unknown>;
  address: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  lat: number;
  lng: number;
  hours: Record<string, unknown>;
  serviceAreaRadius: number;
  pickupPhone: string | null;
  pickupBusinessName: string | null;
  posType: string;
  dataMode: string;
  /** platform | pos-native — see SUMBER §4.3 */
  anchorMode: string;
  languages: string[];
  serviceFee: Record<string, unknown>;
  processingFeePaidBy: string;
  status: string;
  /** Footer "Powered by Orderly" — default true. */
  showPoweredBy: boolean;
  /** Formatted pickup line for DoorDash / Square notes. */
  pickupAddressFormatted: string;
};

/**
 * Legacy single-deploy fallback when Host middleware cannot resolve a tenant.
 * Prefer req.tenant.id after middleware runs.
 */
export function getTenantId(): string {
  return process.env.TENANT_ID?.trim() || "samurai";
}

/** @deprecated Prefer req.tenant.lat — kept for gradual migration. */
export const RESTAURANT_LAT = Number(
  process.env.RESTAURANT_LAT ?? "39.4277084",
);
/** @deprecated Prefer req.tenant.lng */
export const RESTAURANT_LNG = Number(
  process.env.RESTAURANT_LNG ?? "-86.4191611",
);
/** @deprecated Prefer req.tenant.serviceAreaRadius */
export const DELIVERY_RADIUS_MILES = Number(
  process.env.DELIVERY_RADIUS_MILES ?? "12",
);

export const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY ?? "";

export const SQUARE_ORDER_SOURCE_NAME =
  process.env.SQUARE_ORDER_SOURCE_NAME?.trim() || "Orderly Order Hub";

function formatPickupAddress(row: Tenant): string {
  const line1 = row.address?.trim() || "";
  const cityState = [row.city, row.state].filter(Boolean).join(", ");
  const withZip = row.postcode
    ? `${cityState} ${row.postcode}`.trim()
    : cityState;
  if (line1 && withZip) return `${line1}, ${withZip}`;
  return line1 || withZip || "Restaurant pickup";
}

export function toTenantContext(row: Tenant): TenantContext {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    domain: row.domain,
    logoUrl: row.logoUrl,
    faviconUrl: row.faviconUrl,
    theme: (row.theme as Record<string, unknown>) ?? {},
    address: row.address,
    city: row.city,
    state: row.state,
    postcode: row.postcode,
    lat: row.lat,
    lng: row.lng,
    hours: (row.hours as Record<string, unknown>) ?? {},
    serviceAreaRadius: row.serviceAreaRadius,
    pickupPhone: row.pickupPhone,
    pickupBusinessName: row.pickupBusinessName,
    posType: row.posType,
    dataMode: row.dataMode,
    anchorMode: (row as { anchorMode?: string | null }).anchorMode ?? "platform",
    languages: (row.languages as string[]) ?? ["en"],
    serviceFee: (row.serviceFee as Record<string, unknown>) ?? {},
    processingFeePaidBy: row.processingFeePaidBy,
    status: row.status,
    showPoweredBy:
      (row as { showPoweredBy?: boolean | null }).showPoweredBy !== false,
    pickupAddressFormatted: formatPickupAddress(row),
  };
}

/** Env-only fallback tenant (before DB seed / offline). */
export function envFallbackTenant(): TenantContext {
  const id = getTenantId();
  const name =
    process.env.RESTAURANT_NAME?.trim() || "Samurai Hibachi & Sushi";
  const address =
    process.env.RESTAURANT_ADDRESS?.trim() || "789 E Morgan St";
  const city = process.env.RESTAURANT_CITY?.trim() || "Martinsville";
  const state = process.env.RESTAURANT_STATE?.trim() || "IN";
  const postcode = process.env.RESTAURANT_POSTCODE?.trim() || "46151";
  return {
    id,
    slug: id,
    name,
    domain: process.env.TENANT_DOMAIN?.trim() || "samurairesto.com",
    logoUrl: null,
    faviconUrl: null,
    theme: {
      brandName: name,
      primary: "354 82% 50%",
      accent: "43 74% 49%",
    },
    address,
    city,
    state,
    postcode,
    lat: RESTAURANT_LAT,
    lng: RESTAURANT_LNG,
    hours: {},
    serviceAreaRadius: DELIVERY_RADIUS_MILES,
    pickupPhone: process.env.RESTAURANT_PHONE?.trim() || "+17653150073",
    pickupBusinessName: name,
    posType: "square",
    dataMode: "pos-full",
    anchorMode: id === "samurai" ? "pos-native" : "platform",
    languages: ["en"],
    serviceFee: {},
    processingFeePaidBy: "restaurant",
    status: "active",
    showPoweredBy: true,
    pickupAddressFormatted: `${address}, ${city}, ${state} ${postcode}`,
  };
}

export function normalizeHost(hostHeader: string | undefined): string {
  if (!hostHeader) return "";
  const host = hostHeader.split(",")[0]?.trim().toLowerCase() || "";
  const withoutPort = host.replace(/:\d+$/, "");
  return withoutPort.startsWith("www.")
    ? withoutPort.slice(4)
    : withoutPort;
}

export async function findTenantByDomain(
  domain: string,
): Promise<TenantContext | null> {
  if (!domain) return null;
  const rows = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.domain, domain))
    .limit(1);
  const row = rows[0];
  if (!row || row.status !== "active") return null;
  return toTenantContext(row);
}

export async function findTenantById(
  id: string,
): Promise<TenantContext | null> {
  if (!id) return null;
  const rows = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.id, id))
    .limit(1);
  const row = rows[0];
  if (!row || row.status !== "active") return null;
  return toTenantContext(row);
}

export async function findTenantBySlug(
  slug: string,
): Promise<TenantContext | null> {
  if (!slug) return null;
  const rows = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, slug))
    .limit(1);
  const row = rows[0];
  if (!row || row.status !== "active") return null;
  return toTenantContext(row);
}

/**
 * Resolve tenant for a request Host (or explicit slug / env fallback).
 * Order: X-Tenant-Slug → Host domain → TENANT_ID / env fallback.
 */
export async function resolveTenant(options: {
  host?: string;
  slugHint?: string;
  allowEnvFallback?: boolean;
}): Promise<TenantContext | null> {
  const { host, slugHint, allowEnvFallback = true } = options;

  if (slugHint) {
    const bySlug = await findTenantBySlug(slugHint);
    if (bySlug) return bySlug;
  }

  const domain = normalizeHost(host);
  if (domain && domain !== "localhost" && !/^\d+\.\d+\.\d+\.\d+$/.test(domain)) {
    const byDomain = await findTenantByDomain(domain);
    if (byDomain) return byDomain;
  }

  if (!allowEnvFallback) return null;

  const byEnvId = await findTenantById(getTenantId());
  if (byEnvId) return byEnvId;

  return envFallbackTenant();
}

/**
 * Per-tenant secret lookup: TENANT_{SLUG}_{KEY} then global KEY.
 * Secrets never stored in DB plaintext.
 */
export function tenantSecret(slug: string, key: string): string | undefined {
  const prefixed = process.env[`TENANT_${slug.toUpperCase()}_${key}`];
  if (prefixed?.trim()) return prefixed.trim();
  const global = process.env[key];
  return global?.trim() || undefined;
}

/**
 * Tenant-prefixed env only — no global fallback.
 * Use for measurement credentials that must never mix outlets (e.g. Meta CAPI Pixel).
 */
export function tenantOnlySecret(
  slug: string,
  key: string,
): string | undefined {
  const prefixed = process.env[`TENANT_${slug.toUpperCase()}_${key}`];
  return prefixed?.trim() || undefined;
}
