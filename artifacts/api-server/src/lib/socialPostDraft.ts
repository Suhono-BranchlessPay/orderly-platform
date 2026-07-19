/**
 * Stage 1 social post draft builder.
 * Facts-only from POS data — no invented claims, health, discounts, or rankings.
 * Angle rotation avoids repetitive "AI slop". LLM optional later; templates first.
 */
import {
  SOCIAL_POST_ANGLES,
  type SocialPostAngle,
} from "@workspace/db";

export type SocialPostFacts = {
  itemName: string;
  description: string | null;
  priceDollars: number;
  category: string;
  restaurantName: string;
  city: string | null;
  state: string | null;
  brandVoiceHint: string;
  language: string;
};

function money(dollars: number): string {
  return `$${Number(dollars).toFixed(2)}`;
}

function placeLine(facts: SocialPostFacts): string {
  const bits = [facts.city, facts.state].filter(Boolean);
  return bits.length ? bits.join(", ") : "";
}

/** Strip anything that looks like a health/award invention from free text we might echo. */
function sanitizePosDescription(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const t = raw.trim();
  // Still echo POS text (restaurant-owned), but refuse to amplify banned patterns
  // by dropping the description from the caption if it looks like a health claim.
  const banned =
    /\b(gluten[\s-]?free|dairy[\s-]?free|healthy|no\s*msg|allergen[\s-]?free|organic|keto|vegan)\b/i;
  if (banned.test(t)) return null;
  return t.slice(0, 280);
}

export function pickNextAngle(recentAngles: string[]): SocialPostAngle {
  const used = new Set(
    recentAngles.map((a) => a.trim().toLowerCase()).filter(Boolean),
  );
  for (const a of SOCIAL_POST_ANGLES) {
    if (!used.has(a)) return a;
  }
  // All used recently — pick least recent / rotate from start
  return SOCIAL_POST_ANGLES[recentAngles.length % SOCIAL_POST_ANGLES.length]!;
}

export function slugifyItemName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 32) || "item";
}

export function buildSrcTag(input: {
  platform: string;
  itemName: string;
  date?: Date;
}): string {
  const d = input.date ?? new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const raw = (input.platform || "facebook").toLowerCase();
  const plat =
    raw === "tiktok" || raw === "tt" || raw.startsWith("tiktok")
      ? "tiktok"
      : raw.startsWith("ig") || raw.startsWith("insta")
        ? "ig"
        : "fb";
  return `${plat}-${slugifyItemName(input.itemName)}-${y}${m}${day}`;
}

/** Safe menu item id for query params (Orderly text PKs / UUIDs). */
export function sanitizeMenuItemQueryId(raw: unknown): string | null {
  const s = String(raw ?? "").trim().slice(0, 128);
  if (!s || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(s)) return null;
  return s;
}

/** Hyphenated path slug for /s/{slug} (OPSI A short links). */
export function slugifyShortPath(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "item"
  );
}

export function buildTrackedUrl(input: {
  domain: string;
  tenantSlug: string;
  srcTag: string;
  /** When set, QR/landing opens this menu item (closed-loop promo). */
  menuItemId?: string | null;
  /** Item display name → meaningful /s/{slug} path (OPSI A). */
  menuItemName?: string | null;
}): string {
  const host = input.domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const params = new URLSearchParams();
  params.set("src", input.srcTag);
  const itemId = sanitizeMenuItemQueryId(input.menuItemId);
  if (itemId) params.set("item", itemId);

  // Prefer restaurant-domain short path when we have a concrete item
  // (SEO equity stays on the restaurant; caption stays short).
  const itemSlug = input.menuItemName
    ? slugifyShortPath(input.menuItemName)
    : null;
  if (itemId && itemSlug && itemSlug !== "item") {
    return `https://${host}/s/${encodeURIComponent(itemSlug)}?${params.toString()}`;
  }

  return `https://${host}/r/${encodeURIComponent(input.tenantSlug)}?${params.toString()}`;
}

export function buildSocialPostDraft(input: {
  facts: SocialPostFacts;
  angle: SocialPostAngle;
  trackedUrl: string;
}): {
  caption: string;
  hashtags: string;
  cta: string;
  fullPost: string;
} {
  const f = input.facts;
  const price = money(f.priceDollars);
  const place = placeLine(f);
  const desc = sanitizePosDescription(f.description);
  const where = place ? ` in ${place}` : "";

  let body: string;
  switch (input.angle) {
    case "value":
      body = [
        `${f.itemName} — ${price} at ${f.restaurantName}${where}.`,
        desc || `From our ${f.category} menu.`,
        `Full plate, ready when you are.`,
      ].join("\n");
      break;
    case "convenience":
      body = [
        `Skip the wait — order ${f.itemName} online from ${f.restaurantName}.`,
        `${price}${desc ? ` · ${desc}` : ""}`,
        `Pickup ready. Order ahead.`,
      ].join("\n");
      break;
    case "story":
      body = [
        `Made to order: ${f.itemName}.`,
        desc || `From our ${f.category} menu at ${f.restaurantName}.`,
        `${price}${where ? ` · ${place}` : ""}.`,
      ].join("\n");
      break;
    case "question":
      body = [
        `${f.itemName} tonight?`,
        desc || `One of our ${f.category} favorites.`,
        `${price} — order online from ${f.restaurantName}.`,
      ].join("\n");
      break;
    case "seasonal": {
      const dow = new Date().toLocaleDateString("en-US", { weekday: "long" });
      body = [
        `${dow} call: ${f.itemName}.`,
        desc || `${price} · ${f.category}`,
        `Order ahead at ${f.restaurantName}${where}.`,
      ].join("\n");
      break;
    }
    case "appetite":
    default:
      body = [
        `${f.itemName} looking good today.`,
        desc || `Fresh from our ${f.category} menu — ${price}.`,
        desc ? `${price} at ${f.restaurantName}${where}.` : `At ${f.restaurantName}${where}.`,
      ].join("\n");
      break;
  }

  const cta = `Order online → ${input.trackedUrl}`;
  const brandTag =
    "#" +
    f.restaurantName
      .replace(/[^a-zA-Z0-9]+/g, "")
      .slice(0, 24);
  const cityTag = f.city
    ? "#" + f.city.replace(/[^a-zA-Z0-9]+/g, "").slice(0, 20)
    : null;
  const hashtags = ["#OrderOnline", brandTag, cityTag].filter(Boolean).join(" ");

  // Hard rules reminder in facts only — never invent awards/discounts in body.
  const caption = body.trim();
  const fullPost = `${caption}\n\n${cta}\n\n${hashtags}`;

  return { caption, hashtags, cta, fullPost };
}
