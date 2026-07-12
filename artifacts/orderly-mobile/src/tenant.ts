/**
 * Build-time app variant (white-label).
 * EXPO_PUBLIC_TENANT_SLUG = folder under tenants/
 *   samurai-martinsville (pilot) | samurai-linton (future) | kirin
 *
 * Backend tenant slug may differ from appId:
 *   Martinsville appId=samurai-martinsville → API slug=samurai (samurairesto.com)
 */
import martinsville from "../tenants/samurai-martinsville/config.json";
import linton from "../tenants/samurai-linton/config.json";
import kirin from "../tenants/kirin/config.json";

export type OrderType = "pickup" | "delivery";

export type TenantConfig = {
  appId: string;
  tenantId: string;
  /** Backend / X-Tenant-Slug value */
  slug: string;
  appName: string;
  shortName?: string;
  locationLabel?: string;
  bundleId: string;
  androidPackage: string;
  apiBaseUrl: string;
  domain: string;
  orderTypes: OrderType[];
  comingSoon?: boolean;
  layoutVariant: string;
  theme: {
    primary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    muted: string;
    fontHeading: string;
    fontBody: string;
  };
  restaurant: {
    address: string;
    city: string;
    state: string;
    postcode: string;
    phone: string;
    tagline: string;
  };
  hours?: { day: string; hours: string }[];
  assets: {
    logo: string;
    icon: string;
    splash: string;
  };
  menuImageMap: Record<string, string>;
};

const REGISTRY: Record<string, TenantConfig> = {
  "samurai-martinsville": martinsville as TenantConfig,
  // aliases for convenience
  samurai: martinsville as TenantConfig,
  martinsville: martinsville as TenantConfig,
  "samurai-linton": linton as TenantConfig,
  linton: linton as TenantConfig,
  kirin: kirin as TenantConfig,
};

const slug = (
  process.env.EXPO_PUBLIC_TENANT_SLUG ||
  "samurai-martinsville"
).toLowerCase();

const baseTenant: TenantConfig =
  REGISTRY[slug] ?? REGISTRY["samurai-martinsville"];

/** Stage 1 sandbox: point at local/staging API — never flip production Square env. */
const apiOverride = (process.env.EXPO_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");

export const tenant: TenantConfig = apiOverride
  ? { ...baseTenant, apiBaseUrl: apiOverride }
  : baseTenant;

/** Folder name under tenants/ for assets & app.config */
export const tenantFolder: string =
  tenant.appId || "samurai-martinsville";

export function deliveryEnabled(cfg: TenantConfig = tenant): boolean {
  return cfg.orderTypes.includes("delivery");
}

export function pickupAddressLine(cfg: TenantConfig = tenant): string {
  const r = cfg.restaurant;
  const cityState = [r.city, r.state].filter(Boolean).join(", ");
  const withZip = r.postcode ? `${cityState} ${r.postcode}`.trim() : cityState;
  if (r.address && withZip) return `${r.address}, ${withZip}`;
  return r.address || withZip || cfg.appName;
}
