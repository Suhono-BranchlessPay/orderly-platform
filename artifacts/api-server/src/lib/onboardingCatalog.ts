/**
 * Step 5 helpers — SKU prefix uniqueness + ambiguous menu-name hints.
 * Full menu sync stays in squareMenuSync (post-publish).
 */
import { sql } from "drizzle-orm";
import { db, menuItemsTable } from "@workspace/db";
import {
  normalizeSkuPrefix,
  RESERVED_SKU_PREFIXES,
} from "./onboardingWizard";
import {
  getSquareOauthConnectionForSession,
} from "./squareOauth";
import { decryptToken } from "./tokenCrypto";

export type AmbiguousPair = {
  a: string;
  b: string;
  reason: string;
};

function words(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !["and", "with", "the", "a", "of"].includes(w));
}

function isSubset(a: string[], b: string[]): boolean {
  const set = new Set(b);
  return a.every((w) => set.has(w));
}

/** Flag near-duplicate names (e.g. Hibachi Chicken vs Hibachi Chicken & Scallop). */
export function findAmbiguousMenuNamePairs(names: string[]): AmbiguousPair[] {
  const cleaned = [
    ...new Set(names.map((n) => n.trim()).filter((n) => n.length >= 3)),
  ];
  const out: AmbiguousPair[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    for (let j = i + 1; j < cleaned.length; j++) {
      const a = cleaned[i]!;
      const b = cleaned[j]!;
      if (a.toLowerCase() === b.toLowerCase()) {
        out.push({ a, b, reason: "duplicate_name" });
        continue;
      }
      const wa = words(a);
      const wb = words(b);
      if (wa.length < 2 && wb.length < 2) continue;
      const shorter = wa.length <= wb.length ? wa : wb;
      const longer = wa.length <= wb.length ? wb : wa;
      if (
        shorter.length >= 2 &&
        isSubset(shorter, longer) &&
        shorter.length < longer.length
      ) {
        out.push({ a, b, reason: "shared_base_name" });
      }
    }
  }
  return out.slice(0, 25);
}

export async function skuPrefixConflicts(
  prefixRaw: string,
): Promise<{
  prefix: string;
  reserved: boolean;
  usedInLiveMenu: boolean;
  sampleSkus: string[];
}> {
  const prefix = normalizeSkuPrefix(prefixRaw);
  const reserved = (RESERVED_SKU_PREFIXES as readonly string[]).includes(prefix);
  if (!prefix) {
    return { prefix, reserved: false, usedInLiveMenu: false, sampleSkus: [] };
  }
  const like = `${prefix}-%`;
  const rows = await db
    .select({ sku: menuItemsTable.sku })
    .from(menuItemsTable)
    .where(sql`${menuItemsTable.sku} ILIKE ${like}`)
    .limit(5);
  return {
    prefix,
    reserved,
    usedInLiveMenu: rows.length > 0,
    sampleSkus: rows.map((r) => r.sku),
  };
}

export type CatalogPreviewItem = {
  name: string;
  sku: string | null;
  category: string | null;
  hasImage: boolean;
};

/**
 * Read-only Square catalog peek for an onboarding session (ITEMS_READ).
 * Does not write menu_items — that happens at publish sync.
 * Photo counts use ITEM.image_ids from ListCatalog (may lag vs SearchCatalogItems).
 */
export async function previewSquareCatalogForSession(
  onboardingSessionId: string,
): Promise<
  | {
      ok: true;
      itemCount: number;
      missingSkuCount: number;
      /** Unique Square ITEM rows (photos attach at item level). */
      squareItemCount: number;
      withPhotoCount: number;
      missingPhotoCount: number;
      items: CatalogPreviewItem[];
      ambiguousItems: AmbiguousPair[];
    }
  | { ok: false; status: number; error: string }
> {
  const row = await getSquareOauthConnectionForSession(onboardingSessionId);
  if (!row) {
    return {
      ok: false,
      status: 409,
      error: "Connect Square (Step 4) before previewing the catalog.",
    };
  }
  try {
    const accessToken = decryptToken(row.accessTokenEnc);
    const baseUrl =
      row.environment === "production"
        ? "https://connect.squareup.com"
        : "https://connect.squareupsandbox.com";
    const items: CatalogPreviewItem[] = [];
    let squareItemCount = 0;
    let withPhotoCount = 0;
    let cursor: string | undefined;
    let pages = 0;
    do {
      const params = new URLSearchParams({ types: "ITEM" });
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(`${baseUrl}/v2/catalog/list?${params.toString()}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Square-Version": "2024-11-20",
        },
      });
      const text = await res.text();
      if (!res.ok) {
        return {
          ok: false,
          status: 502,
          error: `Square catalog list failed (${res.status})`,
        };
      }
      const data = text
        ? (JSON.parse(text) as {
            objects?: Array<{
              type?: string;
              item_data?: {
                name?: string;
                category_id?: string;
                image_ids?: string[];
                variations?: Array<{
                  item_variation_data?: { name?: string; sku?: string | null };
                }>;
              };
            }>;
            cursor?: string;
          })
        : {};
      for (const obj of data.objects ?? []) {
        if (obj.type !== "ITEM") continue;
        squareItemCount += 1;
        const name = obj.item_data?.name?.trim() || "Untitled";
        const hasImage = Array.isArray(obj.item_data?.image_ids)
          ? obj.item_data!.image_ids!.length > 0
          : false;
        if (hasImage) withPhotoCount += 1;
        const variations = obj.item_data?.variations ?? [];
        if (!variations.length) {
          items.push({ name, sku: null, category: null, hasImage });
          continue;
        }
        for (const v of variations) {
          const vName = v.item_variation_data?.name?.trim();
          const label =
            vName && vName.toLowerCase() !== "regular" ? `${name} (${vName})` : name;
          const sku = v.item_variation_data?.sku?.trim() || null;
          items.push({ name: label, sku, category: null, hasImage });
        }
      }
      cursor = data.cursor;
      pages += 1;
    } while (cursor && pages < 50 && items.length < 500);

    const missingSkuCount = items.filter((i) => !i.sku).length;
    const missingPhotoCount = Math.max(0, squareItemCount - withPhotoCount);
    const ambiguousItems = findAmbiguousMenuNamePairs(items.map((i) => i.name));
    return {
      ok: true,
      itemCount: items.length,
      missingSkuCount,
      squareItemCount,
      withPhotoCount,
      missingPhotoCount,
      items: items.slice(0, 200),
      ambiguousItems,
    };
  } catch (err) {
    console.error("[onboardingCatalog] preview failed:", err);
    return {
      ok: false,
      status: 502,
      error: "Could not preview Square catalog. Try reconnecting Square.",
    };
  }
}
