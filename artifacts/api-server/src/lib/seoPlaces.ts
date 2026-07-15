import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, seoPlacesTable } from "@workspace/db";
import type { TenantContext } from "./tenant";
import { buildTenantSeo } from "./tenantSeo";
import { US_PLACE_SEEDS } from "../data/usPlaceSeeds";
import { slugifySeo } from "./seoTags";

function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function placeId(tenantId: string, slug: string): string {
  return `plc_${createHash("sha1").update(`${tenantId}:${slug}`).digest("hex").slice(0, 16)}`;
}

/**
 * Rebuild place pages within the tenant service radius only.
 * Hard rule: never create pages outside service_area_radius (doorway risk).
 */
export async function rebuildSeoPlacesForTenant(
  tenant: TenantContext,
): Promise<{ places: number }> {
  const radius = Math.max(1, Number(tenant.serviceAreaRadius) || 12);
  const seo = buildTenantSeo(tenant);
  const cuisine = seo.cuisine[0] || "Food";
  const brand = seo.brandName;
  const now = new Date();

  const candidates = US_PLACE_SEEDS.map((p) => {
    const miles = haversineMiles(tenant.lat, tenant.lng, p.lat, p.lng);
    return { ...p, miles };
  })
    .filter((p) => p.miles <= radius + 0.05)
    .sort((a, b) => a.miles - b.miles);

  await db.delete(seoPlacesTable).where(eq(seoPlacesTable.tenantId, tenant.id));

  let count = 0;
  for (const p of candidates) {
    const slug = slugifySeo(`${p.name}-${p.state}`);
    if (!slug) continue;
    // Skip exact restaurant city duplicate of itself as a "near me" page only if
    // distance is ~0 — still useful as /places/{city} for long-tail, keep it.
    const metaTitle = `Best ${cuisine} in ${p.name} | ${brand} | ${cuisine} near me`;
    const metaDescription = `Order ${cuisine.toLowerCase()} for pickup${
      p.miles <= radius ? " or delivery" : ""
    } near ${p.name}, ${p.state} from ${brand}. About ${p.miles.toFixed(1)} miles away.`;

    await db.insert(seoPlacesTable).values({
      id: placeId(tenant.id, slug),
      tenantId: tenant.id,
      slug,
      name: p.name,
      state: p.state,
      distanceMiles: Math.round(p.miles * 10) / 10,
      lat: p.lat,
      lng: p.lng,
      deliveryAvailable: p.miles <= radius,
      metaTitle,
      metaDescription: metaDescription.slice(0, 160),
      updatedAt: now,
      createdAt: now,
    });
    count += 1;
  }

  return { places: count };
}

export async function listIndexablePlaces(tenantId: string) {
  return db
    .select()
    .from(seoPlacesTable)
    .where(eq(seoPlacesTable.tenantId, tenantId));
}

export async function getPlacePage(tenantId: string, slug: string) {
  const rows = await db
    .select()
    .from(seoPlacesTable)
    .where(
      and(eq(seoPlacesTable.tenantId, tenantId), eq(seoPlacesTable.slug, slug)),
    )
    .limit(1);
  return rows[0] ?? null;
}
