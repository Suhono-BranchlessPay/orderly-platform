import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import {
  parseStorefrontConfig,
  withSamuraiBundledDefaults,
  type StorefrontConfig,
} from "@/lib/storefrontConfig";
import {
  SAMURAI_BROCHURES,
  SAMURAI_HERO_IMAGES,
  SAMURAI_REVIEWS,
  SAMURAI_STORY_IMAGE,
} from "@/lib/samuraiDefaultAssets";

export type TenantTheme = {
  primary?: string;
  secondary?: string;
  accent?: string;
  brandName?: string;
  brandShort?: string;
  logoUrl?: string;
  faviconUrl?: string;
  contactEmail?: string;
  facebookUrl?: string;
  tagline?: string;
  aboutText?: string;
  metaTitle?: string;
  metaDescription?: string;
  ogImage?: string;
  ratingValue?: string | null;
  reviewCount?: string | null;
  fontHeading?: string;
  fontBody?: string;
  colors?: Record<string, string>;
  fonts?: {
    display?: string;
    display_fallback?: string;
    body?: string;
    accent?: string;
  };
  layout?: {
    hero_variant?: string;
    menu_variant?: string;
    nav_variant?: string;
    footer_variant?: string;
    featured_variant?: string;
    section_style?: string;
    sections?: string[];
  };
  copy?: Record<string, unknown>;
  assets?: Record<string, string>;
  identity?: Record<string, unknown>;
  seo?: Record<string, string>;
  [key: string]: unknown;
};

export type TenantHoursDay = { day: string; hours: string };

export type TenantPublicConfig = {
  tenantId: string;
  name: string | null;
  theme: TenantTheme | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  hours?: { weekly?: TenantHoursDay[] } | null;
  showPoweredBy?: boolean;
  googleMapsApiKey: string | null;
  places: {
    country: string;
    locationBias: { lat: number; lng: number; radiusMeters: number };
  };
  delivery: {
    radiusMiles: number;
    restaurantLat: number;
    restaurantLng: number;
  };
  restaurant: {
    address: string | null;
    city: string | null;
    state: string | null;
    postcode: string | null;
    phone: string | null;
    email?: string | null;
    facebookUrl?: string | null;
  } | null;
};

type TenantContextValue = {
  tenant: TenantPublicConfig | null;
  isLoading: boolean;
  brandName: string;
  brandShort: string;
  logoSrc: string;
  tagline: string;
  aboutText: string;
  phoneDisplay: string;
  phoneTel: string;
  addressLine: string;
  cityLine: string;
  fullAddress: string;
  contactEmail: string | null;
  facebookUrl: string | null;
  mapsSearchUrl: string;
  weeklyHours: TenantHoursDay[];
  metaTitle: string;
  storefront: StorefrontConfig;
  showPoweredBy: boolean;
};

const TenantContext = createContext<TenantContextValue | null>(null);

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

const DEFAULT_HOURS: TenantHoursDay[] = [
  { day: "Monday", hours: "11AM – 8:30PM" },
  { day: "Tuesday", hours: "11AM – 8:30PM" },
  { day: "Wednesday", hours: "11AM – 8:30PM" },
  { day: "Thursday", hours: "11AM – 8:30PM" },
  { day: "Friday", hours: "11AM – 8:30PM" },
  { day: "Saturday", hours: "11AM – 8:30PM" },
  { day: "Sunday", hours: "11AM – 7:30PM" },
];

function formatPhoneDisplay(e164: string | null | undefined): string {
  if (!e164) return "";
  const digits = e164.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return e164;
}

/** Convert #RRGGBB → "H S% L%" for hsl(var(--token)) CSS vars. */
function hexToHslComponents(hex: string): string | null {
  const raw = hex.trim();
  // Already HSL components e.g. "354 82% 50%"
  if (/^\d+(\.\d+)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%$/.test(raw)) return raw;
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(raw);
  if (!m) return null;
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function setHslVar(root: HTMLElement, name: string, value: string | undefined) {
  if (!value?.trim()) return;
  const hsl = hexToHslComponents(value);
  if (hsl) root.style.setProperty(name, hsl);
}

function nestedStr(
  obj: Record<string, unknown> | undefined,
  key: string,
): string | null {
  if (!obj) return null;
  const v = obj[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function applyTheme(theme: TenantTheme | null | undefined) {
  if (!theme || typeof document === "undefined") return;
  const root = document.documentElement;
  const colors = theme.colors ?? {};

  // ThemePack colors (hex) → CSS HSL tokens; flat primary/secondary as fallback
  setHslVar(root, "--primary", colors.primary || theme.primary);
  setHslVar(root, "--secondary", colors.accent || theme.secondary);
  setHslVar(root, "--accent", colors.dark_section || theme.accent);
  setHslVar(root, "--background", colors.paper);
  setHslVar(root, "--foreground", colors.ink);
  setHslVar(root, "--card", colors.paper_2 || colors.paper);
  setHslVar(root, "--card-foreground", colors.ink);
  setHslVar(root, "--muted", colors.paper_2);
  setHslVar(root, "--muted-foreground", colors.muted);
  setHslVar(root, "--border", colors.line);
  setHslVar(root, "--ring", colors.primary || theme.primary);
  if (colors.dark_text) setHslVar(root, "--accent-foreground", colors.dark_text);
  if (colors.primary_deep) {
    root.style.setProperty("--primary-deep", colors.primary_deep);
  }

  const fonts = theme.fonts ?? {};
  const display =
    fonts.display ||
    (typeof theme.fontHeading === "string" ? theme.fontHeading : null);
  const body =
    fonts.body ||
    (typeof theme.fontBody === "string" ? theme.fontBody : null);
  if (display) {
    const stack =
      fonts.display_fallback || `"${display}", "Arial Narrow", sans-serif`;
    root.style.setProperty("--font-serif", stack.includes(display) ? stack : `"${display}", ${stack}`);
  }
  if (body) {
    root.style.setProperty("--font-sans", `"${body}", system-ui, sans-serif`);
  }

  const layout = theme.layout;
  if (layout?.hero_variant) {
    root.dataset.heroVariant = layout.hero_variant;
  }
  if (layout?.nav_variant) {
    root.dataset.navVariant = layout.nav_variant;
  }
  if (layout?.footer_variant) {
    root.dataset.footerVariant = layout.footer_variant;
  }
  if (layout?.section_style) {
    root.dataset.sectionStyle = layout.section_style;
  }
  if (layout?.menu_variant) {
    root.dataset.menuVariant = layout.menu_variant;
  }
}

function applyFavicon(href: string | null | undefined) {
  if (!href || typeof document === "undefined") return;
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = href;
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useQuery({
    queryKey: ["tenant-checkout-config"],
    queryFn: async (): Promise<TenantPublicConfig> => {
      const res = await fetch(`${API_BASE}/api/config/checkout`);
      if (!res.ok) throw new Error("Failed to load tenant config");
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    applyTheme(data?.theme ?? null);
    const theme = data?.theme;
    const seo = theme?.seo;
    const identity = theme?.identity as Record<string, unknown> | undefined;
    const brand =
      nestedStr(identity, "name") ||
      (typeof theme?.brandName === "string" && theme.brandName) ||
      data?.name ||
      "Order Online";
    const metaTitle =
      nestedStr(seo, "title") ||
      (typeof theme?.metaTitle === "string" && theme.metaTitle) ||
      brand;
    if (metaTitle) document.title = metaTitle;
    const fav =
      data?.faviconUrl ||
      nestedStr(theme?.assets, "favicon") ||
      (typeof theme?.faviconUrl === "string" ? theme.faviconUrl : null) ||
      "/favicon.svg";
    applyFavicon(fav);
    // Blok C1 / D4 — first-touch UTM / ?src= capture for order attribution.
    if (data?.tenantId) {
      void import("@/lib/attribution").then(({ captureAttributionFromUrl }) => {
        captureAttributionFromUrl(data.tenantId);
      });
    }
  }, [data]);

  const value = useMemo<TenantContextValue>(() => {
    const theme = data?.theme;
    const seo = theme?.seo;
    const identity = theme?.identity as Record<string, unknown> | undefined;
    const assets = theme?.assets;

    const brandName =
      nestedStr(identity, "name") ||
      (typeof theme?.brandName === "string" && theme.brandName) ||
      data?.name ||
      "Restaurant";
    const brandShort =
      (typeof theme?.brandShort === "string" && theme.brandShort) ||
      brandName.split(/\s+/)[0] ||
      brandName;
    const phone = data?.restaurant?.phone ?? null;
    const address = data?.restaurant?.address ?? null;
    const city = data?.restaurant?.city ?? null;
    const state = data?.restaurant?.state ?? null;
    const postcode = data?.restaurant?.postcode ?? null;
    const cityLine = [city, state, postcode].filter(Boolean).join(", ");
    const addressLine = address || "";
    const fullAddress = [addressLine, cityLine].filter(Boolean).join(", ");
    const mapsQuery = encodeURIComponent(fullAddress || brandName);
    const weekly =
      data?.hours?.weekly && Array.isArray(data.hours.weekly)
        ? data.hours.weekly
        : DEFAULT_HOURS;

    return {
      tenant: data ?? null,
      isLoading,
      brandName,
      brandShort,
      logoSrc:
        data?.logoUrl ||
        nestedStr(assets, "logo") ||
        (typeof theme?.logoUrl === "string" ? theme.logoUrl : null) ||
        "/samurai-logo.png",
      tagline:
        nestedStr(identity, "tagline") ||
        (typeof theme?.tagline === "string" && theme.tagline) ||
        `Order directly from ${brandName}. No hidden marketplace fees.`,
      aboutText:
        (typeof theme?.aboutText === "string" && theme.aboutText) ||
        `Welcome to ${brandName}. Order fresh Japanese favorites online for pickup or delivery.`,
      phoneDisplay: formatPhoneDisplay(phone) || "",
      phoneTel: phone || "",
      addressLine,
      cityLine,
      fullAddress,
      contactEmail:
        data?.restaurant?.email ||
        nestedStr(identity, "email") ||
        (typeof theme?.contactEmail === "string"
          ? theme.contactEmail
          : null) ||
        null,
      facebookUrl:
        data?.restaurant?.facebookUrl ||
        (typeof theme?.facebookUrl === "string"
          ? theme.facebookUrl
          : null) ||
        null,
      mapsSearchUrl: `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`,
      weeklyHours: weekly,
      metaTitle:
        nestedStr(seo, "title") ||
        (typeof theme?.metaTitle === "string" && theme.metaTitle) ||
        brandName,
      storefront: withSamuraiBundledDefaults(
        parseStorefrontConfig(
          (theme ?? null) as Record<string, unknown> | null,
          data?.tenantId,
        ),
        data?.tenantId,
        {
          heroImages: SAMURAI_HERO_IMAGES,
          storyImage: SAMURAI_STORY_IMAGE,
          reviews: SAMURAI_REVIEWS,
          brochures: SAMURAI_BROCHURES,
        },
      ),
      showPoweredBy: data?.showPoweredBy !== false,
    };
  }, [data, isLoading]);

  return (
    <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
  );
}

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error("useTenant must be used within TenantProvider");
  }
  return ctx;
}
