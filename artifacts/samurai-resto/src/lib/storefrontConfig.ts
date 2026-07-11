/**
 * Storefront variant system — config-driven layouts (Shopify-style).
 * All copy, section order, and variant choices come from tenants.theme.
 */

export type HeroVariant =
  | "hero-fullimage-bold"
  | "hero-split"
  | "hero-minimal-center"
  | "hero-carousel-cards";

export type MenuVariant = "menu-grid" | "menu-list" | "menu-cards-large";
export type NavVariant = "nav-solid-dark" | "nav-minimal-light";
export type FooterVariant = "footer-classic" | "footer-compact";
export type FeaturedVariant = "featured-grid" | "featured-wide";

export type SectionId =
  | "hero"
  | "menu_download"
  | "featured"
  | "reviews"
  | "story"
  | "catering_cta"
  | "location_cta";

export type StorefrontStat = { value: string; label: string };
export type StorefrontReview = {
  name: string;
  initials: string;
  source: string;
  text: string;
};
export type StorefrontBrochure = {
  title: string;
  subtitle: string;
  description: string;
  src: string;
  filename: string;
  badge?: string;
};
export type StorefrontCta = { label: string; href: string; style?: "primary" | "outline" };

export type StorefrontConfig = {
  heroVariant: HeroVariant;
  menuVariant: MenuVariant;
  navVariant: NavVariant;
  footerVariant: FooterVariant;
  featuredVariant: FeaturedVariant;
  sectionOrder: SectionId[];
  heroHeadline: string[];
  heroSubheadline: string;
  heroCtas: StorefrontCta[];
  heroImages: { src: string; alt: string; pos?: string }[];
  storyEyebrow: string;
  storyTitle: string;
  storyBody: string[];
  storyImage: string | null;
  storyImageLabel: string | null;
  storyImageCaption: string | null;
  stats: StorefrontStat[];
  reviews: StorefrontReview[];
  brochures: StorefrontBrochure[];
  featuredEyebrow: string;
  featuredTitle: string;
  menuPageTitle: string;
  menuPageSubtitle: string;
  useSharedFoodPhotos: boolean;
  ratingValue: string | null;
  reviewCount: string | null;
};

const DEFAULT_SECTIONS_SAMURAI: SectionId[] = [
  "hero",
  "menu_download",
  "featured",
  "reviews",
  "story",
];

const DEFAULT_SECTIONS_KIRIN: SectionId[] = [
  "hero",
  "featured",
  "story",
  "catering_cta",
  "menu_download",
  "location_cta",
];

const DEFAULT_SECTIONS_LINTON: SectionId[] = [
  "hero",
  "story",
  "featured",
  "catering_cta",
];

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

function strArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && Boolean(x.trim()));
}

function isSectionId(v: string): v is SectionId {
  return [
    "hero",
    "menu_download",
    "featured",
    "reviews",
    "story",
    "catering_cta",
    "location_cta",
  ].includes(v);
}

/** Merge Samurai bundled assets when theme has no photos yet. */
export function withSamuraiBundledDefaults(
  config: StorefrontConfig,
  tenantId: string | null | undefined,
  bundled: {
    heroImages: StorefrontConfig["heroImages"];
    storyImage: string;
    reviews: StorefrontConfig["reviews"];
    brochures: StorefrontConfig["brochures"];
  },
): StorefrontConfig {
  if (tenantId !== "samurai") return config;
  return {
    ...config,
    heroImages: config.heroImages.length ? config.heroImages : bundled.heroImages,
    storyImage: config.storyImage || bundled.storyImage,
    storyImageLabel: config.storyImageLabel || "Beef Bento Box",
    storyImageCaption:
      config.storyImageCaption || "Steak · Rice · Veggies · Spring Roll · Sushi",
    reviews: config.reviews.length ? config.reviews : bundled.reviews,
    brochures: config.brochures.length ? config.brochures : bundled.brochures,
  };
}

/** Parse tenants.theme JSON into a typed storefront config. */
export function parseStorefrontConfig(
  theme: Record<string, unknown> | null | undefined,
  tenantId: string | null | undefined,
): StorefrontConfig {
  const t = theme ?? {};
  const layout = asRecord(t.layout) ?? {};
  const copy = asRecord(t.copy) ?? {};
  const assets = asRecord(t.assets) ?? {};
  const identity = asRecord(t.identity) ?? {};

  const isKirin = tenantId === "kirin";
  const isLinton = tenantId === "samurai-linton";
  const brand = str(t.brandName) || str(identity.name) || "Restaurant";

  const heroVariant = (str(
    layout.hero_variant,
    isLinton ? "hero-minimal-center" : isKirin ? "hero-split" : "hero-fullimage-bold",
  ) || "hero-fullimage-bold") as HeroVariant;
  const menuVariant = (str(
    layout.menu_variant,
    isLinton || isKirin ? "menu-list" : "menu-grid",
  ) || "menu-grid") as MenuVariant;
  const navVariant = (str(
    layout.nav_variant,
    isKirin || isLinton ? "nav-solid-dark" : "nav-minimal-light",
  ) || "nav-solid-dark") as NavVariant;
  const footerVariant = (str(
    layout.footer_variant,
    isKirin ? "footer-compact" : "footer-classic",
  ) || "footer-classic") as FooterVariant;
  const featuredVariant = (str(
    layout.featured_variant,
    isLinton ? "featured-wide" : isKirin ? "featured-wide" : "featured-grid",
  ) || "featured-grid") as FeaturedVariant;

  let sectionOrder: SectionId[] = [];
  const rawSections = layout.sections ?? t.sections;
  if (Array.isArray(rawSections)) {
    sectionOrder = rawSections.filter((x): x is SectionId => typeof x === "string" && isSectionId(x));
  }
  if (!sectionOrder.length) {
    sectionOrder = isLinton
      ? [...DEFAULT_SECTIONS_LINTON]
      : isKirin
        ? [...DEFAULT_SECTIONS_KIRIN]
        : [...DEFAULT_SECTIONS_SAMURAI];
  }

  const defaultHeadline = isLinton
    ? ["Samurai Hibachi — Linton"]
    : isKirin
      ? ["Sizzling Hibachi.", "Made Fresh & Fast."]
      : ["Fresh Sushi.", "Hot Hibachi.", "Delivered Fast."];

  const heroHeadline = strArr(copy.hero_headline);
  const heroImagesRaw = Array.isArray(copy.hero_images) ? copy.hero_images : [];
  const heroImages = heroImagesRaw
    .map((img) => {
      const r = asRecord(img);
      if (!r) return null;
      const src = str(r.src);
      if (!src) return null;
      return { src, alt: str(r.alt, brand), pos: str(r.pos, "object-center") };
    })
    .filter((x): x is { src: string; alt: string; pos: string } => Boolean(x));

  // Optional public asset paths from theme.assets
  const heroFromAssets = str(assets.hero_image);
  if (!heroImages.length && heroFromAssets) {
    heroImages.push({ src: heroFromAssets, alt: brand, pos: "object-center" });
  }

  const reviewsRaw = Array.isArray(copy.reviews) ? copy.reviews : [];
  const reviews: StorefrontReview[] = reviewsRaw
    .map((r) => {
      const o = asRecord(r);
      if (!o) return null;
      return {
        name: str(o.name),
        initials: str(o.initials),
        source: str(o.source, "Google"),
        text: str(o.text),
      };
    })
    .filter((x): x is StorefrontReview => Boolean(x?.name && x?.text));

  const brochuresRaw = Array.isArray(copy.brochures) ? copy.brochures : [];
  const brochures: StorefrontBrochure[] = [];
  for (const b of brochuresRaw) {
    const o = asRecord(b);
    if (!o) continue;
    const src = str(o.src);
    if (!src) continue;
    const badge = str(o.badge);
    brochures.push({
      title: str(o.title, "Menu"),
      subtitle: str(o.subtitle),
      description: str(o.description),
      src,
      filename: str(o.filename, "menu.jpg"),
      ...(badge ? { badge } : {}),
    });
  }

  const statsRaw = Array.isArray(copy.stats) ? copy.stats : [];
  let stats: StorefrontStat[] = [];
  for (const s of statsRaw) {
    const o = asRecord(s);
    if (!o) continue;
    const value = str(o.value);
    const label = str(o.label);
    if (value && label) stats.push({ value, label });
  }

  if (!stats.length && !isKirin) {
    stats = [
      { value: "79+", label: "Menu Items" },
      { value: "100%", label: "Fresh Daily" },
    ];
  }

  const ctasRaw = Array.isArray(copy.hero_ctas) ? copy.hero_ctas : [];
  let heroCtas: StorefrontCta[] = [];
  for (const c of ctasRaw) {
    const o = asRecord(c);
    if (!o) continue;
    const label = str(o.label);
    if (!label) continue;
    heroCtas.push({
      label,
      href: str(o.href, "/order"),
      style: str(o.style, "primary") === "outline" ? "outline" : "primary",
    });
  }

  if (!heroCtas.length) {
    heroCtas = [
      { label: "Order Pickup", href: "/order", style: "primary" },
      { label: "View Menu", href: "/menu", style: "outline" },
    ];
  }

  // Hide delivery CTAs unless theme.order_types (or identity.order_types) includes "delivery"
  const orderTypesRaw = Array.isArray(t.order_types)
    ? t.order_types
    : Array.isArray(identity.order_types)
      ? identity.order_types
      : ["pickup"];
  const deliveryEnabled = orderTypesRaw.some(
    (v) => String(v).toLowerCase() === "delivery",
  );
  if (!deliveryEnabled) {
    heroCtas = heroCtas.filter(
      (c) => !/delivery/i.test(c.label) && !/deliver/i.test(c.href),
    );
    if (!heroCtas.some((c) => /pickup|order/i.test(c.label))) {
      heroCtas = [
        { label: "Order Pickup", href: "/order", style: "primary" },
        ...heroCtas.filter((c) => !/order/i.test(c.label)),
      ];
    }
  }

  const storyBody = strArr(copy.story_body);
  const aboutFallback = str(t.aboutText) || str(t.tagline);

  return {
    heroVariant: [
      "hero-fullimage-bold",
      "hero-split",
      "hero-minimal-center",
      "hero-carousel-cards",
    ].includes(heroVariant)
      ? heroVariant
      : "hero-fullimage-bold",
    menuVariant: ["menu-grid", "menu-list", "menu-cards-large"].includes(menuVariant)
      ? menuVariant
      : "menu-grid",
    navVariant: ["nav-solid-dark", "nav-minimal-light"].includes(navVariant)
      ? navVariant
      : "nav-solid-dark",
    footerVariant: ["footer-classic", "footer-compact"].includes(footerVariant)
      ? footerVariant
      : "footer-classic",
    featuredVariant: ["featured-grid", "featured-wide"].includes(featuredVariant)
      ? featuredVariant
      : "featured-grid",
    sectionOrder,
    heroHeadline: heroHeadline.length ? heroHeadline : defaultHeadline,
    heroSubheadline:
      str(copy.hero_subheadline) ||
      str(t.tagline) ||
      str(identity.tagline) ||
      `Order online from ${brand}.`,
    heroCtas,
    heroImages,
    storyEyebrow: str(copy.story_eyebrow, isKirin ? "Est. 2026" : "Our Story"),
    storyTitle: str(
      copy.story_title,
      isKirin ? "Henderson’s Neighborhood Grill" : "The Neighborhood Japanese Experience",
    ),
    storyBody: storyBody.length
      ? storyBody
      : aboutFallback
        ? [aboutFallback]
        : [`Welcome to ${brand}.`],
    storyImage: str(copy.story_image) || str(assets.story_image) || null,
    storyImageLabel: str(copy.story_image_label) || null,
    storyImageCaption: str(copy.story_image_caption) || null,
    stats,
    reviews,
    brochures,
    featuredEyebrow: str(copy.featured_eyebrow, isKirin ? "From the Grill" : "Chef's Selection"),
    featuredTitle: str(copy.featured_title, isKirin ? "Hibachi Favorites" : "Featured Dishes"),
    menuPageTitle: str(copy.menu_page_title, "Our Menu"),
    menuPageSubtitle: str(
      copy.menu_page_subtitle,
      isKirin
        ? "Fresh hibachi and Japanese grill favorites — prepared to order."
        : "From our sizzling hibachi grills to our masterfully crafted sushi rolls.",
    ),
    useSharedFoodPhotos:
      t.use_shared_food_photos === true ||
      (!isKirin && !isLinton && t.use_shared_food_photos !== false),
    ratingValue: str(t.ratingValue) || null,
    reviewCount: str(t.reviewCount) || null,
  };
}
