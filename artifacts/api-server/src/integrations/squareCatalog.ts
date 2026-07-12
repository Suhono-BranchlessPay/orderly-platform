/**
 * Square Catalog upsert for human-approved menu imports (C1).
 * Only called from Orderly backend after Bridge import with publish_to_square=true.
 */
import { tenantSecret } from "../lib/tenant";

const SQUARE_API_VERSION = "2024-11-20";

type SquareCreds = {
  accessToken: string;
  locationId: string;
  environment: string;
  baseUrl: string;
};

function resolveSquareCreds(slug: string): SquareCreds | null {
  const accessToken = tenantSecret(slug, "SQUARE_ACCESS_TOKEN");
  const locationId = tenantSecret(slug, "SQUARE_LOCATION_ID");
  if (!accessToken || !locationId) return null;
  const environment =
    tenantSecret(slug, "SQUARE_ENVIRONMENT") ??
    process.env.SQUARE_ENVIRONMENT ??
    "sandbox";
  return {
    accessToken,
    locationId,
    environment,
    baseUrl:
      environment === "production"
        ? "https://connect.squareup.com"
        : "https://connect.squareupsandbox.com",
  };
}

async function squareJson<T>(
  creds: SquareCreds,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${creds.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      "Content-Type": "application/json",
      "Square-Version": SQUARE_API_VERSION,
      ...(init?.headers || {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as T & {
    errors?: Array<{ detail?: string; code?: string }>;
  };
  if (!res.ok) {
    const detail =
      body.errors?.[0]?.detail ||
      body.errors?.[0]?.code ||
      `Square HTTP ${res.status}`;
    throw new Error(detail);
  }
  return body;
}

/**
 * Create a new ITEM + ITEM_VARIATION in Square Catalog.
 * Idempotency via client-generated object ids derived from sku (stable).
 */
export async function upsertSquareCatalogItem(input: {
  tenantSlug: string;
  name: string;
  description?: string | null;
  priceCents: number;
  sku: string;
}): Promise<{ catalogObjectId: string }> {
  const creds = resolveSquareCreds(input.tenantSlug);
  if (!creds) {
    throw new Error(
      `Square credentials missing for tenant slug ${input.tenantSlug}`,
    );
  }

  const safeSku = input.sku.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48);
  const itemId = `#orderly-item-${input.tenantSlug}-${safeSku}`;
  const variationId = `#orderly-var-${input.tenantSlug}-${safeSku}`;

  const result = await squareJson<{
    catalog_object?: { id?: string };
  }>(creds, "/v2/catalog/object", {
    method: "POST",
    body: JSON.stringify({
      idempotency_key: `orderly-menu-${input.tenantSlug}-${safeSku}`,
      object: {
        type: "ITEM",
        id: itemId,
        present_at_all_locations: true,
        item_data: {
          name: input.name,
          description: input.description || undefined,
          abbreviation: input.name.slice(0, 3).toUpperCase(),
          product_type: "REGULAR",
          variations: [
            {
              type: "ITEM_VARIATION",
              id: variationId,
              item_variation_data: {
                name: "Regular",
                sku: input.sku,
                pricing_type: "FIXED_PRICING",
                price_money: {
                  amount: input.priceCents,
                  currency: "USD",
                },
              },
            },
          ],
        },
      },
    }),
  });

  const id = result.catalog_object?.id;
  if (!id) throw new Error("Square catalog upsert returned no object id");
  return { catalogObjectId: id };
}
