import { createHash } from "node:crypto";
import { and, eq, gte } from "drizzle-orm";
import {
  db,
  menuCategoriesTable,
  menuItemsTable,
  seoCatalogItemTagsTable,
  seoTagsTable,
} from "@workspace/db";
import type { TenantContext } from "./tenant";
import { buildTenantSeo } from "./tenantSeo";

const MIN_ITEMS_FOR_PAGE = 3;

/** Junk category slugs — never index (doorway / zero search intent). */
const BLOCKED_TAG_SLUGS = new Set([
  "uncategorized",
  "uncategorised",
  "misc",
  "miscellaneous",
  "other",
  "others",
  "general",
  "default",
  "none",
  "null",
  "menu",
]);

/**
 * Near-duplicate category/keyword slugs → one canonical page.
 * Keys are post-slugifySeo forms.
 */
const TAG_SLUG_ALIASES: Record<string, { slug: string; name: string }> = {
  drink: { slug: "drinks", name: "Drinks" },
  drinks: { slug: "drinks", name: "Drinks" },
  beverage: { slug: "drinks", name: "Drinks" },
  beverages: { slug: "drinks", name: "Drinks" },
  appetizer: { slug: "appetizers", name: "Appetizers" },
  appetizers: { slug: "appetizers", name: "Appetizers" },
  starter: { slug: "appetizers", name: "Appetizers" },
  starters: { slug: "appetizers", name: "Appetizers" },
  bento: { slug: "bento", name: "Bento" },
  "bento-box": { slug: "bento", name: "Bento" },
  "bento-boxes": { slug: "bento", name: "Bento" },
};

/** Food keywords → canonical tag slug (long-tail dish pages). */
const KEYWORD_TAGS: Array<{ slug: string; name: string; pattern: RegExp }> = [
  { slug: "sushi", name: "Sushi", pattern: /\bsushi\b/i },
  { slug: "nigiri", name: "Nigiri", pattern: /\bnigiri\b/i },
  { slug: "sashimi", name: "Sashimi", pattern: /\bsashimi\b/i },
  { slug: "ramen", name: "Ramen", pattern: /\bramen\b/i },
  { slug: "hibachi", name: "Hibachi", pattern: /\bhibachi\b/i },
  { slug: "teriyaki", name: "Teriyaki", pattern: /\bteriyaki\b/i },
  { slug: "tempura", name: "Tempura", pattern: /\btempura\b/i },
  { slug: "bento", name: "Bento", pattern: /\bbento\b/i },
  { slug: "poke", name: "Poke Bowls", pattern: /\bpoke\b/i },
  { slug: "ramen-bowls", name: "Ramen Bowls", pattern: /\bbowl\b/i },
  { slug: "dragon-roll", name: "Dragon Roll", pattern: /\bdragon\s*roll\b/i },
  { slug: "spicy-tuna", name: "Spicy Tuna", pattern: /\bspicy\s*tuna\b/i },
  { slug: "california-roll", name: "California Roll", pattern: /\bcalifornia\s*roll\b/i },
  { slug: "rolls", name: "Sushi Rolls", pattern: /\brolls?\b/i },
  { slug: "appetizers", name: "Appetizers", pattern: /\bappetizer|edamame|gyoza|rangoon\b/i },
  { slug: "fried-rice", name: "Fried Rice", pattern: /\bfried\s*rice\b/i },
  { slug: "noodles", name: "Noodles", pattern: /\bnoodle|udon|soba\b/i },
  { slug: "chicken", name: "Chicken", pattern: /\bchicken\b/i },
  { slug: "steak", name: "Steak", pattern: /\bsteak|beef\b/i },
  { slug: "shrimp", name: "Shrimp", pattern: /\bshrimp|prawn\b/i },
  { slug: "salmon", name: "Salmon", pattern: /\bsalmon\b/i },
  { slug: "tuna", name: "Tuna", pattern: /\btuna\b/i },
  { slug: "vegetarian", name: "Vegetarian", pattern: /\bveg(etarian|gie)|tofu\b/i },
  { slug: "dessert", name: "Dessert", pattern: /\bdessert|mochi|ice\s*cream\b/i },
  { slug: "drinks", name: "Drinks", pattern: /\bdrink|soda|tea|sake|beer\b/i },
];

export function slugifySeo(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/**
 * Normalize a raw label/slug to the single indexable canonical form.
 * Returns null for blocked junk slugs.
 */
export function resolveCanonicalTag(
  slugRaw: string,
): { slug: string; name: string | null } | null {
  const slug = slugifySeo(slugRaw);
  if (!slug || slug.length < 2) return null;
  if (BLOCKED_TAG_SLUGS.has(slug)) return null;
  const alias = TAG_SLUG_ALIASES[slug];
  if (alias) return { slug: alias.slug, name: alias.name };
  return { slug, name: null };
}

function tagId(tenantId: string, slug: string): string {
  return `tag_${createHash("sha1").update(`${tenantId}:${slug}`).digest("hex").slice(0, 16)}`;
}

function uniqueDescription(
  tenant: TenantContext,
  tagName: string,
  itemNames: string[],
): string {
  const seo = buildTenantSeo(tenant);
  const city = seo.address.city || "your area";
  const samples = itemNames.slice(0, 3).join(", ");
  return `Order ${tagName.toLowerCase()} for pickup from ${seo.brandName} in ${city}. Popular choices include ${samples}. Fresh from our kitchen — no marketplace markups.`;
}

type ItemRow = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  available: boolean;
};

/**
 * Rebuild SEO tags for a tenant from live menu.
 * Hard rules: only tags with ≥3 available items; no empty doorway pages.
 */
export async function rebuildSeoTagsForTenant(
  tenant: TenantContext,
): Promise<{ tags: number; links: number }> {
  const items = await db
    .select({
      id: menuItemsTable.id,
      name: menuItemsTable.name,
      description: menuItemsTable.description,
      category: menuItemsTable.category,
      available: menuItemsTable.available,
    })
    .from(menuItemsTable)
    .where(
      and(
        eq(menuItemsTable.tenantId, tenant.id),
        eq(menuItemsTable.available, true),
      ),
    );

  const categories = await db
    .select({
      id: menuCategoriesTable.id,
      name: menuCategoriesTable.name,
    })
    .from(menuCategoriesTable)
    .where(eq(menuCategoriesTable.tenantId, tenant.id));

  const catNameById = new Map(categories.map((c) => [c.id, c.name]));

  type Acc = {
    slug: string;
    name: string;
    source: string;
    itemIds: Set<string>;
    itemNames: string[];
  };
  const bySlug = new Map<string, Acc>();

  function add(
    slugRaw: string,
    name: string,
    source: string,
    item: ItemRow,
  ) {
    const resolved = resolveCanonicalTag(slugRaw);
    if (!resolved) return;
    const { slug } = resolved;
    const displayName = resolved.name || name;
    let acc = bySlug.get(slug);
    if (!acc) {
      acc = {
        slug,
        name: displayName,
        source,
        itemIds: new Set(),
        itemNames: [],
      };
      bySlug.set(slug, acc);
    } else if (resolved.name && acc.source === "category" && source === "keyword") {
      // Prefer curated keyword display name over raw Square category labels.
      acc.name = resolved.name;
      acc.source = source;
    }
    if (!acc.itemIds.has(item.id)) {
      acc.itemIds.add(item.id);
      acc.itemNames.push(item.name);
    }
  }

  for (const item of items) {
    const catLabel =
      catNameById.get(item.category) || item.category || "Menu";
    add(catLabel, catLabel, "category", item);

    const haystack = `${item.name} ${item.description || ""} ${catLabel}`;
    for (const kw of KEYWORD_TAGS) {
      if (kw.pattern.test(haystack)) {
        add(kw.slug, kw.name, "keyword", item);
      }
    }
  }

  // Replace tenant tag graph atomically enough for v1 (delete + insert).
  await db
    .delete(seoCatalogItemTagsTable)
    .where(eq(seoCatalogItemTagsTable.tenantId, tenant.id));
  await db.delete(seoTagsTable).where(eq(seoTagsTable.tenantId, tenant.id));

  let tagCount = 0;
  let linkCount = 0;
  const now = new Date();
  const seo = buildTenantSeo(tenant);
  const city = seo.address.city || "";

  for (const acc of bySlug.values()) {
    if (acc.itemIds.size < MIN_ITEMS_FOR_PAGE) continue;
    const id = tagId(tenant.id, acc.slug);
    const description = uniqueDescription(tenant, acc.name, acc.itemNames);
    const metaTitle = city
      ? `Best ${acc.name} in ${city} | ${seo.brandName} | ${acc.name} near me`
      : `Best ${acc.name} | ${seo.brandName}`;
    const metaDescription = description.slice(0, 160);

    await db.insert(seoTagsTable).values({
      id,
      tenantId: tenant.id,
      slug: acc.slug,
      name: acc.name,
      description,
      itemCount: acc.itemIds.size,
      source: acc.source,
      metaTitle,
      metaDescription,
      updatedAt: now,
      createdAt: now,
    });
    tagCount += 1;

    for (const menuItemId of acc.itemIds) {
      await db.insert(seoCatalogItemTagsTable).values({
        tenantId: tenant.id,
        menuItemId,
        tagId: id,
      });
      linkCount += 1;
    }
  }

  return { tags: tagCount, links: linkCount };
}

export async function listIndexableTags(tenantId: string) {
  return db
    .select()
    .from(seoTagsTable)
    .where(
      and(
        eq(seoTagsTable.tenantId, tenantId),
        gte(seoTagsTable.itemCount, MIN_ITEMS_FOR_PAGE),
      ),
    );
}

export async function getTagPage(tenantId: string, slug: string) {
  const resolved = resolveCanonicalTag(slug);
  if (!resolved) return null;
  const tags = await db
    .select()
    .from(seoTagsTable)
    .where(
      and(
        eq(seoTagsTable.tenantId, tenantId),
        eq(seoTagsTable.slug, resolved.slug),
      ),
    )
    .limit(1);
  const tag = tags[0];
  if (!tag || tag.itemCount < MIN_ITEMS_FOR_PAGE) return null;

  const items = await db
    .select({
      id: menuItemsTable.id,
      name: menuItemsTable.name,
      description: menuItemsTable.description,
      price: menuItemsTable.price,
      imageUrl: menuItemsTable.imageUrl,
      category: menuItemsTable.category,
    })
    .from(seoCatalogItemTagsTable)
    .innerJoin(
      menuItemsTable,
      and(
        eq(menuItemsTable.id, seoCatalogItemTagsTable.menuItemId),
        eq(menuItemsTable.tenantId, seoCatalogItemTagsTable.tenantId),
      ),
    )
    .where(
      and(
        eq(seoCatalogItemTagsTable.tenantId, tenantId),
        eq(seoCatalogItemTagsTable.tagId, tag.id),
        eq(menuItemsTable.available, true),
      ),
    );

  if (items.length < MIN_ITEMS_FOR_PAGE) return null;
  return { tag, items };
}

export { MIN_ITEMS_FOR_PAGE };
