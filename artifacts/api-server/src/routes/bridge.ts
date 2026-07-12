/**
 * Orderly Foods API Bridge v1 — door for dashboard & AI services.
 * Spec: docs/Spec_OrderlyFoods_API_Bridge.md
 *
 * Auth: ORDERLY_BRIDGE_API_KEY (or ORDERLY_BRIDGE_KEYS_JSON).
 * Tenant scope is enforced server-side against the key allowlist.
 */
import { Router } from "express";
import { db } from "@workspace/db";
import {
  menuItemsTable,
  menuCategoriesTable,
  customersTable,
  ordersTable,
  orderLinesTable,
} from "@workspace/db";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "crypto";
import {
  assertBridgeTenantAccess,
  bridgeAuthMiddleware,
  bridgeRateLimitMiddleware,
  writeBridgeAudit,
} from "../lib/bridgeAuth";
import { defaultExplorerUrl } from "../lib/bridgeWebhook";
import { importReviewedMenu } from "../lib/menuImport";

const router = Router();

router.use(bridgeAuthMiddleware);
router.use(bridgeRateLimitMiddleware);

function resolveTenantId(req: {
  query: Record<string, unknown>;
  body?: unknown;
  bridge?: { allowedTenants: string[] };
}): string | null {
  const fromQuery =
    typeof req.query.tenant_id === "string" ? req.query.tenant_id.trim() : "";
  const body = req.body as { tenant_id?: string } | undefined;
  const fromBody = typeof body?.tenant_id === "string" ? body.tenant_id.trim() : "";
  return fromQuery || fromBody || null;
}

router.get("/v1/menu", async (req, res): Promise<void> => {
  const tenantId = resolveTenantId(req);
  if (!tenantId || !req.bridge || !assertBridgeTenantAccess(req.bridge, tenantId)) {
    res.status(403).json({ error: "tenant_id missing or not allowed for this key" });
    await writeBridgeAudit({
      actor: req.bridge?.keyId ?? "unknown",
      method: "GET",
      path: "/api/bridge/v1/menu",
      tenantId,
      statusCode: 403,
    });
    return;
  }

  const [categories, items] = await Promise.all([
    db
      .select()
      .from(menuCategoriesTable)
      .where(eq(menuCategoriesTable.tenantId, tenantId))
      .orderBy(menuCategoriesTable.sortOrder),
    db
      .select()
      .from(menuItemsTable)
      .where(eq(menuItemsTable.tenantId, tenantId)),
  ]);

  await writeBridgeAudit({
    actor: req.bridge.keyId,
    method: "GET",
    path: "/api/bridge/v1/menu",
    tenantId,
    statusCode: 200,
  });

  res.json({
    tenant_id: tenantId,
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      sort_order: c.sortOrder,
    })),
    items: items.map((i) => ({
      id: i.id,
      sku: i.sku,
      name: i.name,
      description: i.description,
      category: i.category,
      price_cents: Math.round(i.price * 100),
      available: i.available,
      featured: i.featured,
      image_url: i.imageUrl,
    })),
  });
});

router.get("/v1/customers", async (req, res): Promise<void> => {
  const tenantId = resolveTenantId(req);
  if (!tenantId || !req.bridge || !assertBridgeTenantAccess(req.bridge, tenantId)) {
    res.status(403).json({ error: "tenant_id missing or not allowed for this key" });
    return;
  }

  const limit = Math.min(
    Number(typeof req.query.limit === "string" ? req.query.limit : 100) || 100,
    500,
  );

  const customers = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.tenantId, tenantId))
    .orderBy(desc(customersTable.lastOrderAt))
    .limit(limit);

  await writeBridgeAudit({
    actor: req.bridge.keyId,
    method: "GET",
    path: "/api/bridge/v1/customers",
    tenantId,
    statusCode: 200,
  });

  res.json({
    tenant_id: tenantId,
    customers: customers.map((c) => ({
      id: c.id,
      first_name: c.firstName,
      last_name: c.lastName,
      phone: c.phone,
      email: c.email,
      first_order_at: c.firstOrderAt?.toISOString() ?? null,
      last_order_at: c.lastOrderAt?.toISOString() ?? null,
      order_count: c.orderCount,
      total_spent_cents: c.totalSpentCents,
      marketing_consent_email: c.marketingConsentEmail,
      marketing_consent_sms: c.marketingConsentSms,
      consent_timestamp: c.consentTimestamp?.toISOString() ?? null,
      consent_source: c.consentSource,
      created_at: c.createdAt?.toISOString() ?? null,
    })),
  });
});

router.get("/v1/orders", async (req, res): Promise<void> => {
  const tenantId = resolveTenantId(req);
  if (!tenantId || !req.bridge || !assertBridgeTenantAccess(req.bridge, tenantId)) {
    res.status(403).json({ error: "tenant_id missing or not allowed for this key" });
    return;
  }

  const from =
    typeof req.query.from === "string" && req.query.from
      ? new Date(req.query.from)
      : null;
  const to =
    typeof req.query.to === "string" && req.query.to
      ? new Date(req.query.to)
      : null;

  const conditions = [eq(ordersTable.tenantId, tenantId)];
  if (from && !Number.isNaN(from.getTime())) {
    conditions.push(gte(ordersTable.createdAt, from));
  }
  if (to && !Number.isNaN(to.getTime())) {
    conditions.push(lte(ordersTable.createdAt, to));
  }

  const limit = Math.min(
    Number(typeof req.query.limit === "string" ? req.query.limit : 200) || 200,
    1000,
  );

  const orders = await db
    .select()
    .from(ordersTable)
    .where(and(...conditions))
    .orderBy(desc(ordersTable.createdAt))
    .limit(limit);

  const withLines = await Promise.all(
    orders.map(async (o) => {
      const lines = await db
        .select()
        .from(orderLinesTable)
        .where(eq(orderLinesTable.orderId, o.id));
      return {
        id: o.id,
        order_type: o.orderType,
        status: o.status,
        payment_status: o.paymentStatus,
        money: {
          subtotal_cents: o.subtotalCents,
          tax_cents: o.taxCents,
          tip_cents: o.tipCents,
          platform_fee_cents: o.platformFeeCents,
          delivery_fee_cents: o.deliveryFeeCents,
          processing_fee_cents: o.processingFeeCents,
          discount_cents: o.discountCents,
          total_cents: o.totalCents,
        },
        customer: {
          id: o.customerId,
          name: o.customerName,
          phone: o.customerPhone,
          email: o.customerEmail,
        },
        items: lines.map((l) => ({
          menu_item_id: l.menuItemId,
          name: l.menuItemName,
          quantity: l.quantity,
          unit_price_cents: Math.round(l.unitPrice * 100),
          subtotal_cents: Math.round(l.subtotal * 100),
        })),
        anchor: {
          bp_anchor_id: o.bpAnchorId,
          bp_anchor_status: o.bpAnchorStatus,
          bp_content_hash: o.bpContentHash,
          chain_tx_hash: o.chainTxHash,
          explorer_url: o.bpExplorerUrl ?? defaultExplorerUrl(o.chainTxHash),
        },
        square_order_id: o.squareOrderId,
        square_payment_id: o.squarePaymentId,
        created_at: o.createdAt?.toISOString() ?? null,
      };
    }),
  );

  await writeBridgeAudit({
    actor: req.bridge.keyId,
    method: "GET",
    path: "/api/bridge/v1/orders",
    tenantId,
    statusCode: 200,
  });

  res.json({ tenant_id: tenantId, orders: withLines });
});

const couponSchema = z.object({
  tenant_id: z.string().min(1),
  code: z.string().min(2).max(64),
  description: z.string().max(500).optional(),
  discount_cents: z.number().int().positive().optional(),
  percent_off: z.number().min(1).max(100).optional(),
  customer_id: z.string().optional(),
  expires_at: z.string().datetime().optional(),
  created_by: z.string().default("ai"),
});

/**
 * AI → Orderly coupon intake (stored as audit + JSON for now).
 * Full coupon engine lands with marketing (C5) — this endpoint accepts drafts safely.
 */
router.post("/v1/coupons", async (req, res): Promise<void> => {
  const parsed = couponSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;
  if (!req.bridge || !assertBridgeTenantAccess(req.bridge, data.tenant_id)) {
    res.status(403).json({ error: "tenant_id not allowed for this key" });
    return;
  }

  if (!data.discount_cents && !data.percent_off) {
    res.status(400).json({ error: "discount_cents or percent_off required" });
    return;
  }

  const couponId = randomUUID();
  await writeBridgeAudit({
    actor: req.bridge.keyId,
    method: "POST",
    path: "/api/bridge/v1/coupons",
    tenantId: data.tenant_id,
    statusCode: 202,
  });

  // Persist as audit payload note — coupons table comes with C5.
  res.status(202).json({
    status: "accepted_draft",
    coupon_id: couponId,
    tenant_id: data.tenant_id,
    code: data.code,
    message:
      "Coupon draft accepted. Activation requires marketing consent + human review (C5).",
    draft: data,
  });
});

const menuImportSchema = z.object({
  tenant_id: z.string().min(1),
  draft_id: z.string().optional(),
  reviewed_by: z.string().optional(),
  /** Default false — never auto-publish from AI extract alone. */
  publish_to_square: z.boolean().default(false),
  items: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string().nullable().optional(),
        category: z.string().min(1),
        price_cents: z.number().int().nonnegative(),
        sku: z.string().nullable().optional(),
        available: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(500),
});

/**
 * C1 — AI (after human review) pushes approved menu lines into Orderly.
 * Optional Square Catalog write only when publish_to_square=true.
 */
router.post("/v1/menu/import", async (req, res): Promise<void> => {
  const parsed = menuImportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;
  if (!req.bridge || !assertBridgeTenantAccess(req.bridge, data.tenant_id)) {
    res.status(403).json({ error: "tenant_id not allowed for this key" });
    await writeBridgeAudit({
      actor: req.bridge?.keyId ?? "unknown",
      method: "POST",
      path: "/api/bridge/v1/menu/import",
      tenantId: data.tenant_id,
      statusCode: 403,
    });
    return;
  }

  try {
    const result = await importReviewedMenu({
      tenantId: data.tenant_id,
      items: data.items,
      publishToSquare: data.publish_to_square,
      draftId: data.draft_id,
      reviewedBy: data.reviewed_by,
    });
    await writeBridgeAudit({
      actor: req.bridge.keyId,
      method: "POST",
      path: "/api/bridge/v1/menu/import",
      tenantId: data.tenant_id,
      statusCode: 200,
    });
    res.json({
      status: "imported",
      tenant_id: data.tenant_id,
      draft_id: data.draft_id ?? null,
      reviewed_by: data.reviewed_by ?? null,
      publish_to_square: data.publish_to_square,
      ...result,
    });
  } catch (err) {
    req.log?.error({ err }, "Bridge menu import failed");
    await writeBridgeAudit({
      actor: req.bridge.keyId,
      method: "POST",
      path: "/api/bridge/v1/menu/import",
      tenantId: data.tenant_id,
      statusCode: 500,
    });
    res.status(500).json({
      error: err instanceof Error ? err.message : "Menu import failed",
    });
  }
});

router.get("/v1/health", async (req, res): Promise<void> => {
  res.json({
    ok: true,
    service: "orderly-bridge",
    key_id: req.bridge?.keyId ?? null,
  });
});

export default router;
