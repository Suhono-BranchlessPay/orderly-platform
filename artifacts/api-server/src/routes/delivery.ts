import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { menuItemsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  createDeliveryQuote,
  isDoordashConfigured,
} from "../integrations/doordash";
import {
  isWithinDeliveryRadius,
  OUT_OF_RADIUS_MESSAGE,
  structuredAddressSchema,
} from "../lib/address";
import { getTenantId, envFallbackTenant } from "../lib/tenant";
import { resolveTenantTaxRate } from "../lib/tenantTax";

const router = Router();

const quoteInputSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().nullable().optional(),
  customerPhone: z.string().min(10),
  address: structuredAddressSchema,
  items: z
    .array(
      z.object({
        menuItemId: z.string(),
        quantity: z.number().int().min(1),
      }),
    )
    .min(1),
});

router.post("/delivery/quote", async (req, res): Promise<void> => {
  if (!isDoordashConfigured(req.tenant?.slug ?? getTenantId())) {
    res.status(503).json({
      error:
        "Delivery is not available right now. Please try pickup or call the restaurant.",
    });
    return;
  }

  const parsed = quoteInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid delivery quote request" });
    return;
  }

  const input = parsed.data;
  const tenant = req.tenant ?? envFallbackTenant();
  const tenantId = tenant.id;

  if (
    !isWithinDeliveryRadius(
      input.address.lat,
      input.address.lng,
      tenant.serviceAreaRadius,
      tenant.lat,
      tenant.lng,
    )
  ) {
    res.status(400).json({ error: OUT_OF_RADIUS_MESSAGE });
    return;
  }

  const taxRate = resolveTenantTaxRate(tenant);
  if (taxRate == null) {
    res.status(503).json({
      error:
        "Online ordering is not available yet for this restaurant. Please call to place your order.",
      code: "tax_rate_unconfigured",
    });
    return;
  }

  let subtotal = 0;

  for (const item of input.items) {
    const rows = await db
      .select()
      .from(menuItemsTable)
      .where(
        and(
          eq(menuItemsTable.id, item.menuItemId),
          eq(menuItemsTable.tenantId, tenantId),
        ),
      );
    const price = rows[0]?.price ?? 0;
    subtotal += price * item.quantity;
  }

  const tax = Math.round(subtotal * taxRate * 100) / 100;
  const orderValueCents = Math.round((subtotal + tax) * 100);

  try {
    const quote = await createDeliveryQuote({
      firstName: input.firstName,
      lastName: input.lastName,
      customerPhone: input.customerPhone,
      address: input.address,
      orderValueCents,
      tenant,
    });

    res.json({
      ...quote,
      foodSubtotal: subtotal,
      foodTax: tax,
      foodTotal: subtotal + tax,
      grandTotal: Math.round((subtotal + tax + quote.deliveryFee) * 100) / 100,
    });
  } catch (err) {
    req.log.error({ err }, "DoorDash quote failed");
    const message =
      err instanceof Error
        ? err.message
        : "We cannot deliver to this address right now.";
    res.status(400).json({ error: message });
  }
});

export default router;
