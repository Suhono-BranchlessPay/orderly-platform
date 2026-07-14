/**
 * Blok A — Square → Orderly menu sync.
 *
 * PRINCIPLE: SQUARE is the source of truth for the menu. Orderly FOLLOWS —
 * this module only ever *reads* Square's Catalog/Inventory APIs and writes
 * into Orderly's own menu_items / menu_categories / menu_sync_state tables.
 * It never calls a Square catalog *write* endpoint and never touches
 * order/payment paths (see integrations/square.ts for those — unchanged).
 *
 * Credentials are resolved via the existing env-first-then-OAuth-DB path
 * (integrations/square.ts#getSquareCredsForTenantSlug) — Samurai's env
 * tokens are never read, duplicated, or overwritten here.
 */
import { and, eq, isNotNull, notInArray } from "drizzle-orm";
import {
  db,
  menuCategoriesTable,
  menuItemsTable,
  menuSyncStateTable,
  tenantsTable,
} from "@workspace/db";
import {
  getSquareCredsForTenantSlug,
  type SquareCreds,
} from "../integrations/square";
import { logger } from "./logger";

const SQUARE_API_VERSION = "2024-11-20";
const CATALOG_TYPES = "ITEM,CATEGORY,IMAGE,MODIFIER_LIST";

export interface SquareMenuSyncSummary {
  ok: boolean;
  tenantId: string;
  reason: string;
  categories: number;
  items: number;
  available: number;
  disabled: number;
  error?: string;
  skipped?: string;
}

// ── Square Catalog API shapes (minimal — only fields we read) ──────────────

interface SquareMoney {
  amount?: number;
  currency?: string;
}

interface SquareLocationOverride {
  location_id?: string;
  price_money?: SquareMoney;
  sold_out?: boolean;
  track_inventory?: boolean;
}

interface SquareCatalogObjectBase {
  id: string;
  type: string;
  is_deleted?: boolean;
  present_at_all_locations?: boolean;
  present_at_location_ids?: string[];
  absent_at_location_ids?: string[];
}

interface SquareItemVariationData {
  item_id?: string;
  name?: string;
  sku?: string;
  price_money?: SquareMoney;
  location_overrides?: SquareLocationOverride[];
}

interface SquareCatalogItemVariation extends SquareCatalogObjectBase {
  type: "ITEM_VARIATION";
  item_variation_data?: SquareItemVariationData;
}

interface SquareModifierData {
  name?: string;
  price_money?: SquareMoney;
}

interface SquareCatalogModifier extends SquareCatalogObjectBase {
  type: "MODIFIER";
  modifier_data?: SquareModifierData;
}

interface SquareModifierListData {
  name?: string;
  modifiers?: SquareCatalogModifier[];
}

interface SquareCatalogModifierList extends SquareCatalogObjectBase {
  type: "MODIFIER_LIST";
  modifier_list_data?: SquareModifierListData;
}

interface SquareModifierListInfo {
  modifier_list_id?: string;
  enabled?: boolean;
}

interface SquareItemData {
  name?: string;
  description?: string;
  is_archived?: boolean;
  category_id?: string;
  categories?: Array<{ id?: string }>;
  image_ids?: string[];
  variations?: SquareCatalogItemVariation[];
  modifier_list_info?: SquareModifierListInfo[];
}

interface SquareCatalogItem extends SquareCatalogObjectBase {
  type: "ITEM";
  item_data?: SquareItemData;
}

interface SquareCategoryData {
  name?: string;
}

interface SquareCatalogCategory extends SquareCatalogObjectBase {
  type: "CATEGORY";
  category_data?: SquareCategoryData;
}

interface SquareImageData {
  url?: string;
}

interface SquareCatalogImage extends SquareCatalogObjectBase {
  type: "IMAGE";
  image_data?: SquareImageData;
}

type SquareCatalogObject =
  | SquareCatalogItem
  | SquareCatalogCategory
  | SquareCatalogImage
  | SquareCatalogModifierList
  | SquareCatalogItemVariation
  | SquareCatalogObjectBase;

interface SquareCatalogListResponse {
  objects?: SquareCatalogObject[];
  cursor?: string;
}

// ── Small helpers ────────────────────────────────────────────────────────

async function squareGet<T>(creds: SquareCreds, path: string): Promise<T> {
  const res = await fetch(`${creds.baseUrl}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      "Square-Version": SQUARE_API_VERSION,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Square catalog API error ${res.status}: ${text}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function fetchAllCatalogObjects(
  creds: SquareCreds,
): Promise<SquareCatalogObject[]> {
  const all: SquareCatalogObject[] = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    const params = new URLSearchParams({ types: CATALOG_TYPES });
    if (cursor) params.set("cursor", cursor);
    const page = await squareGet<SquareCatalogListResponse>(
      creds,
      `/v2/catalog/list?${params.toString()}`,
    );
    all.push(...(page.objects ?? []));
    cursor = page.cursor;
    pages += 1;
    // Safety valve — Square catalogs this large are not expected for Orderly
    // tenants; bail rather than loop forever on an unexpected API response.
  } while (cursor && pages < 200);
  return all;
}

function isPresentAtLocation(
  obj: SquareCatalogObjectBase,
  locationId: string,
): boolean {
  if (obj.absent_at_location_ids?.includes(locationId)) return false;
  if (obj.present_at_all_locations === false) {
    return obj.present_at_location_ids?.includes(locationId) ?? false;
  }
  return true;
}

function isVariationSoldOutAtLocation(
  variation: SquareCatalogItemVariation,
  locationId: string,
): boolean {
  const override = variation.item_variation_data?.location_overrides?.find(
    (o) => o.location_id === locationId,
  );
  return Boolean(override?.sold_out);
}

function centsToDollars(money: SquareMoney | undefined): number {
  if (!money?.amount) return 0;
  return Math.round(money.amount) / 100;
}

/** `sqcat_<squareId>` — stable across re-syncs, never re-used for another Square object. */
function categoryRowId(squareCategoryId: string): string {
  return `sqcat_${squareCategoryId}`;
}

/** `sqvar_<variationId>` — one Orderly menu_items row per Square ITEM_VARIATION. */
function itemRowId(variationId: string): string {
  return `sqvar_${variationId}`;
}

interface ModifierSummary {
  list_id: string;
  list_name: string;
  modifiers: Array<{ id: string; name: string; price: number }>;
}

function buildModifierSummary(
  item: SquareCatalogItem,
  modifierListsById: Map<string, SquareCatalogModifierList>,
): Array<Record<string, unknown>> {
  const infos = item.item_data?.modifier_list_info ?? [];
  const summaries: ModifierSummary[] = [];
  for (const info of infos) {
    if (info.enabled === false) continue;
    const listId = info.modifier_list_id;
    if (!listId) continue;
    const list = modifierListsById.get(listId);
    if (!list) continue;
    summaries.push({
      list_id: listId,
      list_name: list.modifier_list_data?.name ?? "",
      modifiers: (list.modifier_list_data?.modifiers ?? []).map((m) => ({
        id: m.id,
        name: m.modifier_data?.name ?? "",
        price: centsToDollars(m.modifier_data?.price_money),
      })),
    });
  }
  return summaries as unknown as Array<Record<string, unknown>>;
}

// ── Alerting (best-effort, mirrors lib/anchorAlerts.ts's ORDERLY_ALERT_WEBHOOK_URL pattern) ──

async function postMenuSyncAlert(payload: {
  tenantId: string;
  slug: string;
  reason: string;
  error: string;
}): Promise<void> {
  logger.warn({ alert: { type: "menu_sync_failed", ...payload } }, "Square menu sync failed");
  const url = process.env.ORDERLY_ALERT_WEBHOOK_URL?.trim();
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `[Orderly] Square menu sync failed for tenant ${payload.tenantId} (${payload.slug}): ${payload.error}`,
        type: "menu_sync_failed",
        ...payload,
      }),
    });
  } catch (err) {
    logger.error({ err }, "ORDERLY_ALERT_WEBHOOK_URL post failed (menu sync alert)");
  }
}

// ── menu_sync_state bookkeeping ──────────────────────────────────────────

async function touchSyncStart(tenantId: string): Promise<void> {
  const now = new Date();
  await db
    .insert(menuSyncStateTable)
    .values({ tenantId, lastStartedAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: menuSyncStateTable.tenantId,
      set: { lastStartedAt: now, updatedAt: now },
    });
}

async function touchSyncSuccess(
  tenantId: string,
  itemCount: number,
  cursor: string | null,
): Promise<void> {
  const now = new Date();
  await db
    .insert(menuSyncStateTable)
    .values({
      tenantId,
      lastSuccessAt: now,
      lastItemCount: itemCount,
      lastCursor: cursor,
      lastError: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: menuSyncStateTable.tenantId,
      set: {
        lastSuccessAt: now,
        lastItemCount: itemCount,
        lastCursor: cursor,
        lastError: null,
        lastErrorAt: null,
        updatedAt: now,
      },
    });
}

async function touchSyncError(tenantId: string, message: string): Promise<void> {
  const now = new Date();
  const trimmed = message.slice(0, 2000);
  await db
    .insert(menuSyncStateTable)
    .values({ tenantId, lastError: trimmed, lastErrorAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: menuSyncStateTable.tenantId,
      set: { lastError: trimmed, lastErrorAt: now, updatedAt: now },
    });
}

export async function getMenuSyncState(tenantId: string) {
  const rows = await db
    .select()
    .from(menuSyncStateTable)
    .where(eq(menuSyncStateTable.tenantId, tenantId))
    .limit(1);
  return rows[0] ?? null;
}

// ── tenant lookup helpers (shared by routes) ─────────────────────────────

export async function getTenantSlugById(tenantId: string): Promise<string | null> {
  if (!tenantId) return null;
  const rows = await db
    .select({ slug: tenantsTable.slug })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);
  return rows[0]?.slug ?? null;
}

/**
 * All tenants that currently resolve *some* Square credential — env token
 * (e.g. Samurai) or an OAuth connection linked to their tenant id. Used by
 * the cron scheduler; safe to call repeatedly (read-only, no side effects).
 */
export async function listSyncableTenants(): Promise<
  Array<{ tenantId: string; slug: string }>
> {
  const tenants = await db
    .select({ id: tenantsTable.id, slug: tenantsTable.slug })
    .from(tenantsTable);
  const result: Array<{ tenantId: string; slug: string }> = [];
  for (const t of tenants) {
    try {
      const creds = await getSquareCredsForTenantSlug(t.slug);
      if (creds) result.push({ tenantId: t.id, slug: t.slug });
    } catch (err) {
      logger.warn({ err, tenantId: t.id }, "listSyncableTenants: creds check failed");
    }
  }
  return result;
}

/** Fire-and-forget sync trigger by tenant id — resolves slug then runs the sync. Never throws. */
export function triggerMenuSyncForTenantId(tenantId: string, reason: string): void {
  void (async () => {
    try {
      const slug = await getTenantSlugById(tenantId);
      if (!slug) {
        logger.warn({ tenantId }, "triggerMenuSyncForTenantId: tenant not found, skipping");
        return;
      }
      await syncSquareMenuForTenant({ tenantId, slug, reason });
    } catch (err) {
      logger.error({ err, tenantId, reason }, "Fire-and-forget menu sync trigger failed");
    }
  })();
}

// ── concurrency guard — never run two syncs for the same tenant at once ──

const runningTenants = new Set<string>();

/**
 * Pull Square's current catalog for one tenant and upsert it into
 * menu_categories / menu_items. Idempotent — safe to call repeatedly (cron,
 * webhook, manual button all call this same function).
 */
export async function syncSquareMenuForTenant(input: {
  tenantId: string;
  slug: string;
  reason: string;
}): Promise<SquareMenuSyncSummary> {
  const { tenantId, slug, reason } = input;
  const empty = { categories: 0, items: 0, available: 0, disabled: 0 };

  if (!tenantId || !slug) {
    return { ok: false, tenantId, reason, ...empty, error: "missing tenantId/slug" };
  }

  if (runningTenants.has(tenantId)) {
    return {
      ok: false,
      tenantId,
      reason,
      ...empty,
      skipped: "A sync is already in progress for this tenant",
    };
  }
  runningTenants.add(tenantId);

  try {
    await touchSyncStart(tenantId);

    const creds = await getSquareCredsForTenantSlug(slug);
    if (!creds) {
      const msg =
        "Square not configured for this tenant (no env token and no linked OAuth connection)";
      await touchSyncError(tenantId, msg);
      return { ok: false, tenantId, reason, ...empty, error: msg };
    }

    const objects = await fetchAllCatalogObjects(creds);

    const categoriesById = new Map<string, SquareCatalogCategory>();
    const imagesById = new Map<string, SquareCatalogImage>();
    const modifierListsById = new Map<string, SquareCatalogModifierList>();
    const items: SquareCatalogItem[] = [];
    const looseVariations: SquareCatalogItemVariation[] = [];

    for (const obj of objects) {
      if (obj.is_deleted) continue;
      switch (obj.type) {
        case "CATEGORY":
          categoriesById.set(obj.id, obj as SquareCatalogCategory);
          break;
        case "IMAGE":
          imagesById.set(obj.id, obj as SquareCatalogImage);
          break;
        case "MODIFIER_LIST":
          modifierListsById.set(obj.id, obj as SquareCatalogModifierList);
          break;
        case "ITEM":
          items.push(obj as SquareCatalogItem);
          break;
        case "ITEM_VARIATION":
          // Square Catalog normally nests variations under item_data.variations —
          // handle the (rare) case they also appear as top-level list entries.
          looseVariations.push(obj as SquareCatalogItemVariation);
          break;
        default:
          break;
      }
    }

    const itemsById = new Map(items.map((it) => [it.id, it]));
    for (const variation of looseVariations) {
      const parentId = variation.item_variation_data?.item_id;
      const parent = parentId ? itemsById.get(parentId) : undefined;
      if (!parent) continue;
      parent.item_data = parent.item_data ?? {};
      parent.item_data.variations = parent.item_data.variations ?? [];
      if (!parent.item_data.variations.some((v) => v.id === variation.id)) {
        parent.item_data.variations.push(variation);
      }
    }

    // Upsert categories first so menu_items.category (name) can reference them.
    let categoryCount = 0;
    for (const cat of categoriesById.values()) {
      const name = cat.category_data?.name?.trim();
      if (!name) continue;
      const id = categoryRowId(cat.id);
      await db
        .insert(menuCategoriesTable)
        .values({
          id,
          tenantId,
          name,
          squareCategoryId: cat.id,
        })
        .onConflictDoUpdate({
          target: menuCategoriesTable.id,
          set: { name, squareCategoryId: cat.id },
        });
      categoryCount += 1;
    }

    let availableCount = 0;
    const seenVariationIds: string[] = [];

    for (const item of items) {
      if (!item.item_data) continue;
      const itemName = item.item_data.name?.trim();
      if (!itemName) continue;

      const categoryId = item.item_data.categories?.[0]?.id ?? item.item_data.category_id;
      const categoryName = categoryId
        ? categoriesById.get(categoryId)?.category_data?.name?.trim()
        : undefined;

      const imageId = item.item_data.image_ids?.[0];
      const imageUrl = imageId ? imagesById.get(imageId)?.image_data?.url ?? null : null;

      const modifiers = buildModifierSummary(item, modifierListsById);

      const itemPresent = isPresentAtLocation(item, creds.locationId);
      const isArchived = Boolean(item.item_data.is_archived);

      const variations = item.item_data.variations ?? [];
      for (const variation of variations) {
        if (variation.is_deleted) continue;
        const vData = variation.item_variation_data;
        if (!vData) continue;

        const variationPresent = isPresentAtLocation(variation, creds.locationId);
        const soldOut = isVariationSoldOutAtLocation(variation, creds.locationId);
        const available = !isArchived && itemPresent && variationPresent && !soldOut;

        const variationName = vData.name?.trim();
        const name =
          variationName && variationName.toLowerCase() !== "regular"
            ? `${itemName} - ${variationName}`
            : itemName;
        const sku = vData.sku?.trim() || variation.id;
        const price = centsToDollars(vData.price_money);

        const preferredId = itemRowId(variation.id);
        const now = new Date();
        const fields = {
          sku,
          name,
          description: item.item_data.description ?? null,
          category: categoryName ?? "Uncategorized",
          price,
          imageUrl,
          available,
          squareCatalogObjectId: item.id,
          squareVariationId: variation.id,
          squareCategoryId: categoryId ?? null,
          squareModifiers: modifiers,
          updatedAt: now,
        };

        // Prod has UNIQUE (tenant_id, sku). Legacy Orderly rows often use
        // id === sku (e.g. SKU023). Sync must UPDATE those in place — inserting
        // sqvar_* with the same SKU throws and aborts the whole pull.
        const existingByVariation = await db
          .select({ id: menuItemsTable.id })
          .from(menuItemsTable)
          .where(
            and(
              eq(menuItemsTable.tenantId, tenantId),
              eq(menuItemsTable.squareVariationId, variation.id),
            ),
          )
          .limit(1);
        const existingBySku = existingByVariation[0]
          ? []
          : await db
              .select({ id: menuItemsTable.id })
              .from(menuItemsTable)
              .where(
                and(
                  eq(menuItemsTable.tenantId, tenantId),
                  eq(menuItemsTable.sku, sku),
                ),
              )
              .limit(1);
        const existingId = existingByVariation[0]?.id ?? existingBySku[0]?.id;

        if (existingId) {
          await db
            .update(menuItemsTable)
            .set(fields)
            .where(eq(menuItemsTable.id, existingId));
        } else {
          await db
            .insert(menuItemsTable)
            .values({
              id: preferredId,
              tenantId,
              ...fields,
            })
            .onConflictDoUpdate({
              target: menuItemsTable.id,
              set: fields,
            });
        }

        seenVariationIds.push(variation.id);
        if (available) availableCount += 1;
      }
    }

    // Soft-disable: any previously-synced item (has a square_variation_id)
    // not seen this run — removed/hidden in Square — becomes unavailable.
    // Never deletes rows and never touches Orderly-native items (no
    // square_variation_id). Idempotent — safe to re-run.
    const disableConditions = [
      eq(menuItemsTable.tenantId, tenantId),
      eq(menuItemsTable.available, true),
      isNotNull(menuItemsTable.squareVariationId),
    ];
    if (seenVariationIds.length > 0) {
      disableConditions.push(
        notInArray(menuItemsTable.squareVariationId, seenVariationIds),
      );
    }

    const disabledRows = await db
      .update(menuItemsTable)
      .set({ available: false, updatedAt: new Date() })
      .where(and(...disableConditions))
      .returning({ id: menuItemsTable.id });
    const disabledCount = disabledRows.length;

    await touchSyncSuccess(tenantId, seenVariationIds.length, null);

    return {
      ok: true,
      tenantId,
      reason,
      categories: categoryCount,
      items: seenVariationIds.length,
      available: availableCount,
      disabled: disabledCount,
    };
  } catch (err) {
    const message = formatSyncError(err);
    logger.error({ err, tenantId, slug, reason }, "Square menu sync failed");
    try {
      await touchSyncError(tenantId, message);
    } catch (persistErr) {
      logger.error({ err: persistErr }, "Failed to persist menu_sync_state error");
    }
    await postMenuSyncAlert({ tenantId, slug, reason, error: message });
    return { ok: false, tenantId, reason, ...empty, error: message };
  } finally {
    runningTenants.delete(tenantId);
  }
}

/** Prefer Postgres cause text over Drizzle's opaque "Failed query: …". */
function formatSyncError(err: unknown): string {
  if (!err || typeof err !== "object") return String(err);
  const e = err as Error & { cause?: unknown; code?: string; detail?: string };
  const parts: string[] = [];
  const cause = e.cause;
  if (cause && typeof cause === "object") {
    const c = cause as Error & { code?: string; detail?: string; constraint?: string };
    if (c.message) parts.push(c.message);
    if (c.code) parts.push(`code=${c.code}`);
    if (c.constraint) parts.push(`constraint=${c.constraint}`);
    if (c.detail) parts.push(c.detail);
  }
  if (e.message && !e.message.startsWith("Failed query")) parts.push(e.message);
  else if (e.message && parts.length === 0) parts.push(e.message.slice(0, 400));
  return (parts.join(" | ") || String(err)).slice(0, 2000);
}
