/**
 * Import human-reviewed menu drafts from the AI service (C1).
 * AI never writes DB/Square directly — only via Bridge.
 */
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { menuCategoriesTable, menuItemsTable, tenantsTable } from "@workspace/db";
import { upsertSquareCatalogItem } from "../integrations/squareCatalog";

export type MenuImportItem = {
  name: string;
  description?: string | null;
  category: string;
  price_cents: number;
  sku?: string | null;
  available?: boolean;
};

function slugSku(name: string, fallback: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return base || fallback;
}

export async function importReviewedMenu(input: {
  tenantId: string;
  items: MenuImportItem[];
  publishToSquare: boolean;
  draftId?: string | null;
  reviewedBy?: string | null;
}): Promise<{
  imported: Array<{
    id: string;
    sku: string;
    name: string;
    category: string;
    price_cents: number;
    created: boolean;
    square_catalog_object_id: string | null;
    square_error: string | null;
  }>;
  categories_ensured: string[];
}> {
  const tenantRows = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.id, input.tenantId))
    .limit(1);
  const tenant = tenantRows[0];
  if (!tenant) {
    throw new Error(`Unknown tenant_id: ${input.tenantId}`);
  }

  const categoriesEnsured = new Set<string>();
  const existingCats = await db
    .select()
    .from(menuCategoriesTable)
    .where(eq(menuCategoriesTable.tenantId, input.tenantId));
  const catByName = new Map(
    existingCats.map((c) => [c.name.toLowerCase(), c]),
  );

  const existingItems = await db
    .select()
    .from(menuItemsTable)
    .where(eq(menuItemsTable.tenantId, input.tenantId));
  const bySku = new Map(existingItems.map((i) => [i.sku, i]));
  const byName = new Map(
    existingItems.map((i) => [`${i.category.toLowerCase()}::${i.name.toLowerCase()}`, i]),
  );

  const imported: Array<{
    id: string;
    sku: string;
    name: string;
    category: string;
    price_cents: number;
    created: boolean;
    square_catalog_object_id: string | null;
    square_error: string | null;
  }> = [];

  let sortOrder = existingCats.length;

  for (const item of input.items) {
    const category = item.category.trim() || "Uncategorized";
    const name = item.name.trim();
    if (!name) continue;
    const priceCents = Math.max(0, Math.round(item.price_cents));
    const price = priceCents / 100;
    const sku =
      (item.sku && item.sku.trim()) ||
      slugSku(name, `item-${randomUUID().slice(0, 8)}`);

    if (!catByName.has(category.toLowerCase())) {
      const catId = randomUUID();
      await db.insert(menuCategoriesTable).values({
        id: catId,
        tenantId: input.tenantId,
        name: category,
        description: null,
        sortOrder: sortOrder++,
      });
      catByName.set(category.toLowerCase(), {
        id: catId,
        tenantId: input.tenantId,
        name: category,
        description: null,
        sortOrder: sortOrder - 1,
      });
      categoriesEnsured.add(category);
    } else {
      categoriesEnsured.add(category);
    }

    const existing =
      bySku.get(sku) ||
      byName.get(`${category.toLowerCase()}::${name.toLowerCase()}`);

    let rowId: string;
    let created: boolean;
    if (existing) {
      rowId = existing.id;
      created = false;
      await db
        .update(menuItemsTable)
        .set({
          name,
          description: item.description ?? existing.description,
          category,
          price,
          available: item.available ?? existing.available,
          sku,
        })
        .where(
          and(
            eq(menuItemsTable.id, existing.id),
            eq(menuItemsTable.tenantId, input.tenantId),
          ),
        );
    } else {
      rowId = randomUUID();
      created = true;
      await db.insert(menuItemsTable).values({
        id: rowId,
        tenantId: input.tenantId,
        sku,
        name,
        description: item.description ?? null,
        category,
        price,
        imageUrl: null,
        available: item.available ?? true,
        featured: false,
      });
      bySku.set(sku, {
        id: rowId,
        tenantId: input.tenantId,
        sku,
        name,
        description: item.description ?? null,
        category,
        price,
        imageUrl: null,
        available: item.available ?? true,
        featured: false,
      });
    }

    let squareId: string | null = null;
    let squareError: string | null = null;
    if (input.publishToSquare) {
      try {
        const sq = await upsertSquareCatalogItem({
          tenantSlug: tenant.slug,
          name,
          description: item.description ?? null,
          priceCents,
          sku,
        });
        squareId = sq.catalogObjectId;
      } catch (err) {
        squareError = err instanceof Error ? err.message : String(err);
      }
    }

    imported.push({
      id: rowId,
      sku,
      name,
      category,
      price_cents: priceCents,
      created,
      square_catalog_object_id: squareId,
      square_error: squareError,
    });
  }

  return {
    imported,
    categories_ensured: [...categoriesEnsured],
  };
}
