import { Image } from "expo-image";
import { tenant } from "../tenant";

/** Bundled Martinsville food photos (Samurai Project assets). */
const MARTINSVILLE_MENU = {
  "omg-roll.jpeg": require("../../tenants/samurai-martinsville/assets/menu/omg-roll.jpeg"),
  "sushi-platter.jpg": require("../../tenants/samurai-martinsville/assets/menu/sushi-platter.jpg"),
  "sweet-heart.jpeg": require("../../tenants/samurai-martinsville/assets/menu/sweet-heart.jpeg"),
  "beef-bento.jpeg": require("../../tenants/samurai-martinsville/assets/menu/beef-bento.jpeg"),
  "bento-box.jpeg": require("../../tenants/samurai-martinsville/assets/menu/bento-box.jpeg"),
  "chicken-bento.jpeg": require("../../tenants/samurai-martinsville/assets/menu/chicken-bento.jpeg"),
  "beef-hibachi.jpeg": require("../../tenants/samurai-martinsville/assets/menu/beef-hibachi.jpeg"),
  "hibachi-chicken.jpeg": require("../../tenants/samurai-martinsville/assets/menu/hibachi-chicken.jpeg"),
  "crab-rangoon.jpeg": require("../../tenants/samurai-martinsville/assets/menu/crab-rangoon.jpeg"),
  "kani-salad.jpeg": require("../../tenants/samurai-martinsville/assets/menu/kani-salad.jpeg"),
  "seaweed-salad.jpeg": require("../../tenants/samurai-martinsville/assets/menu/seaweed-salad.jpeg"),
  "vegetable-roll.jpeg": require("../../tenants/samurai-martinsville/assets/menu/vegetable-roll.jpeg"),
} as const;

type MenuFile = keyof typeof MARTINSVILLE_MENU;

const LOGOS = {
  "samurai-martinsville": require("../../tenants/samurai-martinsville/assets/brand/logo.png"),
  "samurai-linton": require("../../tenants/samurai-linton/assets/brand/logo.png"),
  kirin: require("../../tenants/kirin/assets/brand/logo.png"),
} as const;

export function tenantLogo() {
  return LOGOS[tenant.appId as keyof typeof LOGOS] ?? LOGOS["samurai-martinsville"];
}

function normalizeItemName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(/\b\d+\s*(oz|pcs?|pc|tails?)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Exact Square names → bundled file (live Samurai catalog). */
const EXACT_NORMALIZED: Record<string, MenuFile> = {
  "omg roll": "omg-roll.jpeg",
  "sushi platter": "sushi-platter.jpg",
  "sweetheart roll": "sweet-heart.jpeg",
  "sweet heart roll": "sweet-heart.jpeg",
  "kani salad": "kani-salad.jpeg",
  "seaweed salad": "seaweed-salad.jpeg",
  "vegetable roll": "vegetable-roll.jpeg",
  "vegetables spring roll": "vegetable-roll.jpeg",
  "crab rangoon": "crab-rangoon.jpeg",
  "hibachi chicken": "hibachi-chicken.jpeg",
  "chicken bento": "chicken-bento.jpeg",
  "steak bento": "beef-bento.jpeg",
  "scallop bento": "beef-bento.jpeg",
  "salmon bento": "bento-box.jpeg",
  "shrimp bento": "bento-box.jpeg",
  "crab meat bento": "beef-bento.jpeg",
};

/**
 * Family fallbacks when we lack a per-item shoot.
 * Prefer real food photos over empty slots for store screenshots;
 * sides/sauces/drinks stay on ImageFallback.
 */
function familyMenuFile(normalized: string): MenuFile | null {
  if (normalized.includes("crab rangoon") && !normalized.includes("roll")) {
    return "crab-rangoon.jpeg";
  }
  if (normalized.includes("bento")) {
    if (normalized.includes("chicken")) return "chicken-bento.jpeg";
    if (
      normalized.includes("steak") ||
      normalized.includes("beef") ||
      normalized.includes("scallop") ||
      normalized.includes("crab")
    ) {
      return "beef-bento.jpeg";
    }
    return "bento-box.jpeg";
  }
  if (normalized.includes("hibachi")) {
    const steakish =
      normalized.includes("steak") ||
      normalized.includes("strip") ||
      normalized.includes("beef") ||
      normalized.includes("samurai steak");
    if (steakish) return "beef-hibachi.jpeg";
    if (normalized.includes("chicken")) return "hibachi-chicken.jpeg";
    return "beef-hibachi.jpeg";
  }
  if (
    normalized.includes("spring roll") ||
    normalized.includes("vegetable roll")
  ) {
    return "vegetable-roll.jpeg";
  }
  if (normalized.includes("kani") && normalized.includes("salad")) {
    return "kani-salad.jpeg";
  }
  if (normalized.includes("seaweed")) return "seaweed-salad.jpeg";
  if (normalized.includes("omg")) return "omg-roll.jpeg";
  if (
    normalized.includes("sweetheart") ||
    normalized.includes("sweet heart")
  ) {
    return "sweet-heart.jpeg";
  }
  // Specialty / standard rolls & nigiri → platter until dedicated shoots exist.
  if (
    /\broll\b/.test(normalized) ||
    normalized.includes("nigiri") ||
    normalized.includes("crunchy delight")
  ) {
    return "sushi-platter.jpg";
  }
  return null;
}

function bundledFile(file: string | undefined | null): number | null {
  if (!file) return null;
  if (file in MARTINSVILLE_MENU) {
    return MARTINSVILLE_MENU[file as MenuFile];
  }
  return null;
}

/**
 * Resolve menu photo: API imageUrl → tenant menuImageMap →
 * normalized exact / family match → null (ImageFallback).
 */
export function resolveMenuImage(itemName: string, remoteUrl?: string | null) {
  if (remoteUrl) return { uri: remoteUrl };

  const mapped = tenant.menuImageMap?.[itemName];
  const fromMap = bundledFile(mapped);
  if (fromMap != null) return fromMap;

  const normalized = normalizeItemName(itemName);
  const exact = EXACT_NORMALIZED[normalized];
  if (exact) return MARTINSVILLE_MENU[exact];

  // Also try menuImageMap keys after normalize (legacy "Box" names etc.)
  for (const [key, file] of Object.entries(tenant.menuImageMap || {})) {
    if (normalizeItemName(key) === normalized) {
      const hit = bundledFile(file);
      if (hit != null) return hit;
    }
  }

  const family = familyMenuFile(normalized);
  if (family) return MARTINSVILLE_MENU[family];

  return null;
}

export { Image };
