import { Router } from "express";
import {
  getTenantId,
  GOOGLE_MAPS_API_KEY,
} from "../lib/tenant";

const router = Router();

/** Public checkout config — no secrets beyond Maps key (domain-restricted in Google Cloud). */
router.get("/config/checkout", (req, res): void => {
  const tenant = req.tenant;
  const tenantId = tenant?.id ?? getTenantId();
  const lat = tenant?.lat ?? Number(process.env.RESTAURANT_LAT ?? "39.4277084");
  const lng = tenant?.lng ?? Number(process.env.RESTAURANT_LNG ?? "-86.4191611");
  const radiusMiles =
    tenant?.serviceAreaRadius ??
    Number(process.env.DELIVERY_RADIUS_MILES ?? "12");

  res.json({
    tenantId,
    name: tenant?.name ?? null,
    theme: tenant?.theme ?? null,
    logoUrl: tenant?.logoUrl ?? null,
    faviconUrl: tenant?.faviconUrl ?? null,
    hours: tenant?.hours ?? null,
    googleMapsApiKey: GOOGLE_MAPS_API_KEY || null,
    places: {
      country: "us",
      locationBias: {
        lat,
        lng,
        radiusMeters: 25000,
      },
    },
    delivery: {
      radiusMiles,
      restaurantLat: lat,
      restaurantLng: lng,
    },
    restaurant: tenant
      ? {
          address: tenant.address,
          city: tenant.city,
          state: tenant.state,
          postcode: tenant.postcode,
          phone: tenant.pickupPhone,
          email:
            typeof tenant.theme?.contactEmail === "string"
              ? tenant.theme.contactEmail
              : null,
          facebookUrl:
            typeof tenant.theme?.facebookUrl === "string"
              ? tenant.theme.facebookUrl
              : null,
        }
      : null,
  });
});

export default router;
