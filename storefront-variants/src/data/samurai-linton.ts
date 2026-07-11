import { TenantConfig } from "../types/config";

const PLACEHOLDER_ADDRESS = "[PHOTO/DATA NEEDED — Linton address from Malik/Verry]";
const PLACEHOLDER_PHONE = "[Linton phone TBD]";

export const samuraiLinton: TenantConfig = {
  id: "samurai-linton",
  name: "Samurai Hibachi — Linton",
  meta: {
    brand: "samurai",
    location: {
      city: "Linton",
      state: "Indiana",
      address: PLACEHOLDER_ADDRESS,
      phone: PLACEHOLDER_PHONE,
      hours: "[Hours TBD — Malik/Verry]",
    },
    orderTypes: ["pickup"],
    notes:
      "Same Samurai brand as Martinsville, different location. Differentiators: HeroMinimalCenter (Martinsville uses full-image hero, Kirin uses split), deeper crimson primary + gold accent, Linton-specific copy, different section order. All photos are neutral placeholders — do NOT reuse Martinsville photos.",
  },
  theme: {
    colors: {
      primary: "348 75% 42%", // Deeper crimson — same red family as Samurai (354 82% 50%), Linton shade
      accent: "38 92% 55%", // Gold accent — Linton differentiator
      background: "0 0% 7%", // Samurai black
      foreground: "40 15% 93%",
      card: "0 0% 11%",
      cardForeground: "40 15% 93%",
      muted: "0 0% 16%",
      mutedForeground: "0 0% 62%",
      border: "0 0% 20%",
    },
    fonts: { sans: "'Inter', sans-serif", serif: "'Inter', sans-serif" },
  },
  nav: {
    variant: "NavSolid",
    data: {
      logo: "SAMURAI — LINTON",
      menuLinks: [
        { label: "Menu", href: "#" },
        { label: "Our Story", href: "#" },
        { label: "Location", href: "#" },
      ],
      phone: PLACEHOLDER_PHONE,
      address: PLACEHOLDER_ADDRESS,
      cartLabel: "Pickup Order",
    },
  },
  sections: [
    {
      id: "linton-hero",
      type: "hero",
      variant: "HeroMinimalCenter",
      data: {
        tagline: "Now in Linton, IN",
        headline: "Samurai Hibachi — Linton",
        subheadline:
          "The same Samurai fire you love, now serving Linton, Indiana. Fresh hibachi, made to order, ready for pickup.",
        ctaButtons: [{ label: "Order Pickup", href: "#" }],
      },
    },
    {
      id: "linton-story",
      type: "story",
      variant: "StoryCentered",
      data: {
        title: "Same Samurai. New Home in Linton.",
        body: [
          "Samurai Hibachi brings its signature flame-grilled hibachi from Martinsville to Linton, Indiana.",
          "Same recipes, same quality, same Samurai spirit — now closer to you.",
        ],
      },
    },
    {
      id: "linton-featured",
      type: "featured",
      variant: "ListCompact",
      data: {
        eyebrow: "Linton Menu",
        sectionTitle: "Hibachi Favorites",
        items: [
          {
            name: "[Menu item TBD]",
            description: "[Linton menu from Malik/Verry — placeholder, do not use Martinsville data]",
            price: "$—",
          },
          {
            name: "[Menu item TBD]",
            description: "[Linton menu from Malik/Verry — placeholder]",
            price: "$—",
          },
          {
            name: "[Menu item TBD]",
            description: "[Linton menu from Malik/Verry — placeholder]",
            price: "$—",
          },
        ],
      },
    },
    {
      id: "linton-cta",
      type: "cta",
      variant: "BannerAccent",
      data: {
        title: "Pickup in Linton, IN",
        subtitle: "Order ahead and skip the wait. Delivery coming soon.",
        buttons: [{ label: "Start Pickup Order", href: "#" }],
      },
    },
  ],
  footer: {
    variant: "FooterDark",
    data: {
      logo: "SAMURAI — LINTON",
      menuLinks: [
        { label: "Menu", href: "#" },
        { label: "Our Story", href: "#" },
      ],
      phone: PLACEHOLDER_PHONE,
      address: PLACEHOLDER_ADDRESS,
    },
  },
};
