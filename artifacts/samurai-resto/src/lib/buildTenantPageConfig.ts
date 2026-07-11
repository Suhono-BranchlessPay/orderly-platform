/**
 * Maps Orderly tenants.theme + live menu → Replit TenantConfig for PageRenderer.
 * Supports both legacy kebab IDs and PascalCase Replit variant names.
 */

import type {
  FooterConfig,
  NavConfig,
  SectionConfig,
  TenantConfig,
  ThemeConfig,
} from "@/variants/types/config";
import type { StorefrontConfig } from "@/lib/storefrontConfig";
import { IMAGE_MAP } from "@/components/MenuItemCard";

export type LiveMenuItem = {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  imageUrl?: string | null;
  featured?: boolean;
};

type BuildArgs = {
  tenantId: string;
  brandName: string;
  logoSrc: string;
  phoneDisplay: string;
  fullAddress: string;
  mapsSearchUrl: string;
  cartCount: number;
  storefront: StorefrontConfig;
  theme: Record<string, unknown> | null | undefined;
  featuredItems: LiveMenuItem[] | undefined;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

function hexToHsl(hex: string): string | null {
  const raw = hex.trim();
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

function colorToken(v: unknown, fallback: string): string {
  if (typeof v !== "string" || !v.trim()) return fallback;
  return hexToHsl(v) || v.trim() || fallback;
}

/** Normalize legacy + Replit hero variant names. */
export function mapHeroVariant(
  raw: string | undefined,
  tenantId: string,
): "HeroSplit" | "HeroFullImage" | "HeroMinimalCenter" | "HeroCarouselCards" {
  const v = (raw || "").toLowerCase();
  if (v.includes("split") || v === "herosplit") return "HeroSplit";
  if (v.includes("minimal") || v === "herominimalcenter") return "HeroMinimalCenter";
  if (v.includes("carousel") || v === "herocarouselcards") return "HeroCarouselCards";
  if (v.includes("full") || v === "herofullimage" || v.includes("bold")) return "HeroFullImage";
  return tenantId === "kirin"
    ? "HeroSplit"
    : tenantId === "samurai-linton"
      ? "HeroMinimalCenter"
      : "HeroFullImage";
}

export function mapFeaturedVariant(
  raw: string | undefined,
  tenantId: string,
): "CardGrid" | "ListCompact" | "BigCards" {
  const v = (raw || "").toLowerCase();
  if (v.includes("list") || v === "listcompact" || v === "menu-list") return "ListCompact";
  if (v.includes("big") || v === "bigcards" || v.includes("wide") || v.includes("large"))
    return "BigCards";
  if (v.includes("grid") || v === "cardgrid") return "CardGrid";
  return tenantId === "samurai-linton"
    ? "ListCompact"
    : tenantId === "kirin"
      ? "BigCards"
      : "CardGrid";
}

export function mapStoryVariant(raw: string | undefined, tenantId: string): "StorySplit" | "StoryCentered" {
  const v = (raw || "").toLowerCase();
  if (v.includes("center")) return "StoryCentered";
  if (v.includes("split")) return "StorySplit";
  return tenantId === "kirin" ? "StorySplit" : "StoryCentered";
}

export function mapCtaVariant(raw: string | undefined, tenantId: string): "BannerDark" | "BannerAccent" {
  const v = (raw || "").toLowerCase();
  if (v.includes("accent")) return "BannerAccent";
  if (v.includes("dark")) return "BannerDark";
  return tenantId === "kirin" || tenantId === "samurai-linton"
    ? "BannerAccent"
    : "BannerDark";
}

export function mapNavVariant(raw: string | undefined, tenantId: string): NavConfig["variant"] {
  const v = (raw || "").toLowerCase();
  // NavTransparent is absolute overlay — only when explicitly requested
  if (v.includes("transparent")) return "NavTransparent";
  if (v.includes("solid") || v.includes("dark") || v.includes("minimal") || v.includes("light"))
    return "NavSolid";
  return tenantId === "kirin" ? "NavSolid" : "NavSolid";
}

export function mapFooterVariant(raw: string | undefined, tenantId: string): FooterConfig["variant"] {
  const v = (raw || "").toLowerCase();
  if (v.includes("light") || v.includes("compact")) return "FooterLight";
  if (v.includes("dark") || v.includes("classic")) return "FooterDark";
  return tenantId === "kirin" ? "FooterLight" : "FooterDark";
}

function buildTheme(theme: Record<string, unknown> | null | undefined): ThemeConfig {
  const t = theme ?? {};
  const colors = asRecord(t.colors) ?? {};
  const fonts = asRecord(t.fonts) ?? {};
  const display = typeof fonts.display === "string" ? fonts.display : "Playfair Display";
  const body = typeof fonts.body === "string" ? fonts.body : "DM Sans";

  return {
    colors: {
      primary: colorToken(colors.primary ?? t.primary, "354 82% 50%"),
      accent: colorToken(colors.accent ?? t.secondary, "43 74% 49%"),
      background: colorToken(colors.paper ?? colors.background, "0 0% 100%"),
      foreground: colorToken(colors.ink ?? colors.foreground, "0 0% 8%"),
      card: colorToken(colors.paper_2 ?? colors.card, "0 0% 98%"),
      cardForeground: colorToken(colors.ink ?? colors.cardForeground, "0 0% 8%"),
      muted: colorToken(colors.paper_2 ?? colors.muted, "0 0% 94%"),
      mutedForeground: colorToken(colors.muted ?? colors.mutedForeground, "0 0% 40%"),
      border: colorToken(colors.line ?? colors.border, "0 0% 90%"),
    },
    fonts: {
      sans: `'${body}', system-ui, sans-serif`,
      serif: `'${display}', Georgia, serif`,
    },
  };
}

function menuLinks() {
  return [
    { label: "Home", href: "/" },
    { label: "Menu", href: "/menu" },
    { label: "Catering", href: "/catering" },
    { label: "Order", href: "/order" },
  ];
}

function featuredFromLive(
  items: LiveMenuItem[] | undefined,
  storefront: StorefrontConfig,
  limit = 4,
): { name: string; description: string; price: string; image?: string }[] {
  if (!items?.length) return [];
  const photoSet = new Set(Object.keys(IMAGE_MAP));
  const filtered = storefront.useSharedFoodPhotos
    ? items.filter((i) => photoSet.has(i.name) || i.imageUrl)
    : items.filter((i) => Boolean(i.imageUrl));

  const pool = filtered.length ? filtered : storefront.useSharedFoodPhotos ? items : [];
  return pool.slice(0, limit).map((i) => {
    const bundled =
      storefront.useSharedFoodPhotos && IMAGE_MAP[i.name] ? IMAGE_MAP[i.name] : undefined;
    const image = i.imageUrl || bundled;
    return {
      name: i.name,
      description: i.description || "",
      price: `$${i.price.toFixed(2)}`,
      ...(image ? { image } : {}),
    };
  });
}

/**
 * Build PageRenderer config from live tenant + menu.
 * Never injects another tenant's photos when useSharedFoodPhotos is false.
 */
export function buildTenantPageConfig(args: BuildArgs): TenantConfig {
  const {
    tenantId,
    brandName,
    logoSrc,
    phoneDisplay,
    fullAddress,
    mapsSearchUrl,
    cartCount,
    storefront,
    theme,
    featuredItems,
  } = args;

  const t = theme ?? {};
  const layout = asRecord(t.layout) ?? {};
  const page = asRecord(t.page) ?? {}; // optional Replit-style sections array

  const heroVariant = mapHeroVariant(
    String(layout.hero_variant ?? ""),
    tenantId,
  );
  const featuredVariant = mapFeaturedVariant(
    String(layout.featured_variant ?? layout.menu_variant ?? ""),
    tenantId,
  );
  const storyVariant = mapStoryVariant(String(layout.story_variant ?? ""), tenantId);
  const ctaVariant = mapCtaVariant(String(layout.cta_variant ?? ""), tenantId);
  const navVariant = mapNavVariant(String(layout.nav_variant ?? ""), tenantId);
  const footerVariant = mapFooterVariant(String(layout.footer_variant ?? ""), tenantId);

  const heroImage =
    storefront.heroImages[0]?.src ||
    (typeof asRecord(t.assets)?.hero_image === "string"
      ? String(asRecord(t.assets)!.hero_image)
      : undefined);

  const storyImage = storefront.storyImage || undefined;
  // Never fall back to Samurai bundled story for other tenants
  const safeStoryImage =
    storefront.useSharedFoodPhotos || storyImage ? storyImage : undefined;

  const featuredMenu = featuredFromLive(featuredItems, storefront);

  // Prefer explicit theme.page.sections (Replit Identity Pack shape) when present
  let sections: SectionConfig[] = [];
  if (Array.isArray(page.sections) && page.sections.length) {
    sections = page.sections as SectionConfig[];
  } else {
    const order = storefront.sectionOrder.length
      ? storefront.sectionOrder
      : (["hero", "featured", "story"] as const);

    for (const id of order) {
      if (id === "hero") {
        sections.push({
          id: "hero",
          type: "hero",
          variant: heroVariant,
          data: {
            headline: storefront.heroHeadline.join(" "),
            subheadline: storefront.heroSubheadline,
            tagline: brandName,
            ctaButtons: storefront.heroCtas.map((c) => ({
              label: c.label,
              href: c.href,
            })),
            ...(heroImage ? { backgroundImage: heroImage } : {}),
          },
        });
      } else if (id === "featured") {
        sections.push({
          id: "featured",
          type: "featured",
          variant: featuredVariant,
          data: {
            sectionTitle: storefront.featuredTitle,
            eyebrow: storefront.featuredEyebrow,
            items: featuredMenu,
          },
        });
      } else if (id === "story") {
        sections.push({
          id: "story",
          type: "story",
          variant: storyVariant,
          data: {
            title: storefront.storyTitle,
            body: storefront.storyBody,
            stats: storefront.stats.map((s) => ({
              label: s.label,
              value: s.value,
            })),
            ...(safeStoryImage ? { image: safeStoryImage } : {}),
          },
        });
      } else if (id === "catering_cta" || id === "location_cta") {
        const isLoc = id === "location_cta";
        const copy = asRecord(t.copy) ?? {};
        const ctaTitle = typeof copy.cta_title === "string" ? copy.cta_title : null;
        const ctaSubtitle =
          typeof copy.cta_subtitle === "string" ? copy.cta_subtitle : null;
        const ctaButtonsRaw = Array.isArray(copy.cta_buttons) ? copy.cta_buttons : [];
        const ctaButtons = ctaButtonsRaw
          .map((b) => {
            const o = asRecord(b);
            if (!o) return null;
            const label = typeof o.label === "string" ? o.label : "";
            const href = typeof o.href === "string" ? o.href : "/order";
            return label ? { label, href } : null;
          })
          .filter((x): x is { label: string; href: string } => Boolean(x));

        sections.push({
          id,
          type: "cta",
          variant: isLoc ? "BannerAccent" : ctaVariant,
          data: {
            title:
              ctaTitle ||
              (isLoc ? `Visit ${brandName}` : `Catering from ${brandName}`),
            subtitle:
              ctaSubtitle ||
              (isLoc
                ? fullAddress || "Address coming soon"
                : "Party trays and office lunch — order online or call ahead."),
            buttons:
              ctaButtons.length > 0
                ? ctaButtons
                : isLoc
                  ? [
                      { label: "Directions", href: mapsSearchUrl },
                      ...(phoneDisplay
                        ? [
                            {
                              label: `Call ${phoneDisplay}`,
                              href: `tel:${phoneDisplay.replace(/\D/g, "")}`,
                            },
                          ]
                        : []),
                    ]
                  : [
                      { label: "View Catering", href: "/catering" },
                      { label: "Order Online", href: "/order" },
                    ],
          },
        });
      }
      // reviews / menu_download: not in Replit library — skipped (or add later as extensions)
    }
  }

  // Ensure featured always has coming-soon state if empty and section present
  sections = sections.map((s) => {
    if (s.type === "featured" && (!s.data.items || !s.data.items.length)) {
      return {
        ...s,
        data: {
          ...s.data,
          items: featuredMenu,
        },
      };
    }
    return s;
  });

  return {
    id: tenantId,
    name: brandName,
    theme: buildTheme(theme),
    nav: {
      variant: navVariant,
      data: {
        logo: logoSrc || brandName,
        menuLinks: menuLinks(),
        phone: phoneDisplay || undefined,
        address: fullAddress || undefined,
        mapsUrl: mapsSearchUrl,
        cartLabel: cartCount > 0 ? `Cart (${cartCount})` : "Cart",
      },
    },
    sections,
    footer: {
      variant: footerVariant,
      data: {
        logo: brandName,
        menuLinks: menuLinks(),
        phone: phoneDisplay || undefined,
        address: fullAddress || undefined,
        mapsUrl: mapsSearchUrl,
      },
    },
  };
}
