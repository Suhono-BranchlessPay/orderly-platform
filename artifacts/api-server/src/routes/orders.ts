import { Router } from "express";
import { db } from "@workspace/db";
import {
  ordersTable,
  orderLinesTable,
  menuItemsTable,
  customersTable,
} from "@workspace/db";
import { and, eq, gte, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { z } from "zod";
import { checkPin } from "../lib/ownerAuth";
import {
  isSquareConfigured,
  isSquareWebPaymentsConfigured,
  sendOrderToSquare,
  syncSquareOrderFromOwnerStatus,
  refundSquarePayment,
} from "../integrations/square";
import {
  isDoordashConfigured,
  acceptDeliveryQuote,
  getCachedQuote,
} from "../integrations/doordash";
import {
  isBranchlesspayConfigured,
  auditOrderWithBpShield,
  isBpAnchorConfigured,
  anchorPaidOrder,
  anchorRefundedOrder,
} from "../integrations/branchlesspay";
import {
  isOwnerConfigured,
  syncOrderToOwner,
} from "../integrations/owner";
import { upsertCustomerAndAddress, recordCustomerPaidOrder } from "../lib/customers";
import { enqueuePurchaseFromOrder } from "../lib/metaCapi";
import {
  addressFingerprint,
  isWithinDeliveryRadius,
  OUT_OF_RADIUS_MESSAGE,
  structuredAddressSchema,
} from "../lib/address";
import { displayName } from "../lib/phone";
import { envFallbackTenant, getTenantId } from "../lib/tenant";
import {
  buildOrderMoneyCents,
  centsToDollars,
  dollarsToCents,
} from "../lib/money";
import {
  defaultExplorerUrl,
  enqueueOrderCompletedWebhook,
} from "../lib/bridgeWebhook";
import { isPosNativeAnchor } from "../lib/anchorMode";
import { syncOrderAnchorFromBp } from "../lib/anchorProof";
import {
  resolveOrderChannel,
  resolveTipCents,
  statusTimestampPatch,
} from "../lib/orderSeams";
import { isExpoPushToken, notifyPickupReady } from "../lib/expoPush";

const router = Router();

const orderLineInputSchema = z.object({
  menuItemId: z.string(),
  quantity: z.number().int().min(1),
  specialInstructions: z.string().nullable().optional(),
});

const orderInputSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().nullable().optional(),
  customerPhone: z.string().min(10),
  customerEmail: z
    .union([z.string().email(), z.literal(""), z.null()])
    .optional(),
  orderType: z.enum(["pickup", "delivery"]),
  address: structuredAddressSchema.nullable().optional(),
  items: z.array(orderLineInputSchema).min(1),
  specialInstructions: z.string().nullable().optional(),
  squarePaymentSourceId: z.string().min(1, "Card payment token is required"),
  doordashExternalDeliveryId: z.string().nullable().optional(),
  /** Tip in cents (preferred) — 100% restaurant-owned. */
  tipCents: z.preprocess(
    (v) =>
      v == null || v === ""
        ? v
        : Number.isFinite(Number(v))
          ? Math.round(Number(v))
          : v,
    z.number().int().min(0).max(100_000).nullable().optional(),
  ),
  /** Tip as percent of subtotal (15/18/20). Ignored if tipCents set. */
  tipPercent: z.number().min(0).max(100).nullable().optional(),
  channel: z.string().nullable().optional(),
  sourceDetail: z.record(z.string(), z.unknown()).nullable().optional(),
  /** Expo push token for “ready for pickup” alerts (optional). */
  expoPushToken: z.string().nullable().optional(),
});

router.post("/orders", async (req, res): Promise<void> => {
  const rawBody =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>)
      : {};

  // Pickup clients sometimes still send address: {} from form state — treat as null.
  if (
    rawBody.address &&
    typeof rawBody.address === "object" &&
    !Array.isArray(rawBody.address)
  ) {
    const a = rawBody.address as Record<string, unknown>;
    const blank =
      !a.street &&
      !a.city &&
      !a.state &&
      !a.postcode &&
      (a.lat == null || a.lat === 0) &&
      (a.lng == null || a.lng === 0);
    if (blank) rawBody.address = null;
  }

  // Tip may arrive as float from JS money math — coerce to int cents.
  if (typeof rawBody.tipCents === "number" && !Number.isInteger(rawBody.tipCents)) {
    rawBody.tipCents = Math.round(rawBody.tipCents);
  }

  const parsed = orderInputSchema.safeParse(rawBody);
  if (!parsed.success) {
    req.log?.warn(
      { issues: parsed.error.issues, keys: Object.keys(rawBody) },
      "Invalid order data",
    );
    res.status(400).json({
      error: "Invalid order data",
      details: parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
    return;
  }

  const input = parsed.data;
  const tenant = req.tenant ?? envFallbackTenant();
  const tenantId = tenant.id;
  const customerDisplayName = displayName(input.firstName, input.lastName);

  try {
    if (input.orderType === "delivery") {
      if (!input.address) {
        res.status(400).json({ error: "Delivery address is required" });
        return;
      }
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
    }

    const menuItemIds = input.items.map((i) => i.menuItemId);
    const menuItemMap: Record<
      string,
      { name: string; price: number; sku: string }
    > = {};
    for (const id of menuItemIds) {
      const rows = await db
        .select()
        .from(menuItemsTable)
        .where(
          and(
            eq(menuItemsTable.id, id),
            eq(menuItemsTable.tenantId, tenantId),
          ),
        );
      if (rows[0]) {
        menuItemMap[id] = {
          name: rows[0].name,
          price: rows[0].price,
          sku: rows[0].sku,
        };
      }
    }

    const TAX_RATE = 0.07;
    let subtotalCents = 0;
    const lines = input.items.map((item) => {
      const menuItem = menuItemMap[item.menuItemId];
      const unitPrice = menuItem?.price ?? 0;
      const unitPriceCents = dollarsToCents(unitPrice);
      const lineSubtotalCents = unitPriceCents * item.quantity;
      subtotalCents += lineSubtotalCents;
      return {
        menuItemId: item.menuItemId,
        menuItemName: menuItem?.name ?? "Unknown item",
        quantity: item.quantity,
        unitPrice,
        subtotal: centsToDollars(lineSubtotalCents),
        specialInstructions: item.specialInstructions ?? null,
      };
    });

    const taxCents = Math.round(subtotalCents * TAX_RATE);
    const orderId = randomUUID();

    let deliveryFeeCents = 0;
    let deliveryAddressFormatted: string | null = null;

    if (input.orderType === "delivery") {
      const addr = input.address!;
      deliveryAddressFormatted = [
        [addr.street, addr.unit].filter(Boolean).join(" "),
        `${addr.city}, ${addr.state} ${addr.postcode}`,
      ].join(", ");

      if (!isDoordashConfigured(tenant.slug)) {
        res.status(503).json({
          error: "Delivery is not available right now. Please choose pickup.",
        });
        return;
      }
      if (!input.doordashExternalDeliveryId) {
        res.status(400).json({
          error: "Delivery quote required. Please confirm your delivery address.",
        });
        return;
      }
      const quote = getCachedQuote(input.doordashExternalDeliveryId);
      if (!quote) {
        res.status(400).json({
          error: "Delivery quote expired. Please get a new delivery quote.",
        });
        return;
      }
      if (quote.addressKey !== addressFingerprint(addr)) {
        res.status(400).json({ error: "Delivery address does not match quote." });
        return;
      }
      deliveryFeeCents = quote.deliveryFeeCents;
    }

    const tipCents = resolveTipCents({
      subtotalCents,
      tipCents: input.tipCents,
      tipPercent: input.tipPercent,
    });
    const channel = resolveOrderChannel({
      bodyChannel: input.channel,
      headerChannel: req.headers["x-orderly-channel"],
      userAgent: String(req.headers["user-agent"] ?? ""),
    });
    const sourceDetail: Record<string, unknown> = {
      ...(input.sourceDetail && typeof input.sourceDetail === "object"
        ? input.sourceDetail
        : {}),
    };
    if (isExpoPushToken(input.expoPushToken)) {
      sourceDetail.expo_push_token = input.expoPushToken.trim();
    } else if (
      typeof sourceDetail.expo_push_token === "string" &&
      !isExpoPushToken(sourceDetail.expo_push_token)
    ) {
      delete sourceDetail.expo_push_token;
    }

    const moneyPreview = buildOrderMoneyCents({
      subtotalCents,
      taxCents,
      tipCents,
      platformFeeCents: 0,
      deliveryFeeCents,
      processingFeeCents: 0,
      discountCents: 0,
    });
    const subtotal = centsToDollars(moneyPreview.subtotalCents);
    const tax = centsToDollars(moneyPreview.taxCents);
    const tip = centsToDollars(moneyPreview.tipCents);
    const deliveryFee = centsToDollars(moneyPreview.deliveryFeeCents);
    // Square order total excludes tip (tip charged via tip_money).
    const total = centsToDollars(
      moneyPreview.subtotalCents +
        moneyPreview.taxCents +
        moneyPreview.deliveryFeeCents,
    );

    const customerRecord = await upsertCustomerAndAddress({
      tenantId,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.customerPhone,
      email: input.customerEmail,
      address: input.orderType === "delivery" ? input.address! : null,
    });

    if (isBranchlesspayConfigured(tenant.slug)) {
      try {
        const auditResult = await auditOrderWithBpShield({
          orderId,
          customerName: customerDisplayName,
          customerPhone: customerRecord.phoneE164,
          orderType: input.orderType,
          total: centsToDollars(moneyPreview.totalCents),
          items: lines.map((l) => ({
            name: l.menuItemName,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
          })),
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
          tenantSlug: tenant.slug,
        });
        if (!auditResult.approved) {
          req.log.warn({ auditResult }, "Order rejected by BP Audit Shield");
          res.status(403).json({
            error: "Order could not be processed. Please contact the restaurant.",
          });
          return;
        }
        req.log.info(
          { auditId: auditResult.auditId, riskScore: auditResult.riskScore },
          "BP Audit Shield approved",
        );
      } catch (err) {
        req.log.error(
          { err },
          "BP Audit Shield check failed — continuing without audit",
        );
      }
    }

    const paymentTiming = "pay_now";
    const paymentStatus = "paid";

    if (!(await isSquareWebPaymentsConfigured(tenant.slug))) {
      res.status(503).json({
        error:
          "Online ordering is temporarily unavailable. Please call the restaurant to place your order.",
      });
      return;
    }

    let squareResult: Awaited<ReturnType<typeof sendOrderToSquare>> | null =
      null;
    try {
      squareResult = await sendOrderToSquare({
        orderId,
        customerName: customerDisplayName,
        firstName: input.firstName,
        lastName: input.lastName,
        customerPhone: customerRecord.phoneE164,
        orderType: input.orderType,
        deliveryAddress: deliveryAddressFormatted,
        deliveryAddressStructured:
          input.orderType === "delivery" ? input.address! : null,
        items: lines.map((l) => ({
          menuItemId: l.menuItemId,
          menuItemName: l.menuItemName,
          sku: menuItemMap[l.menuItemId]?.sku,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          specialInstructions: l.specialInstructions,
        })),
        subtotal,
        tax,
        deliveryFee,
        total,
        tip,
        tipCents,
        specialInstructions: input.specialInstructions,
        squarePaymentSourceId: input.squarePaymentSourceId,
        tenantSlug: tenant.slug,
        tenantName: tenant.name,
      });
      req.log.info(
        {
          squareOrderId: squareResult.squareOrderId,
          squarePaymentId: squareResult.squarePaymentId,
          chargedTotalCents: squareResult.chargedTotalCents,
        },
        "Square prepaid order charged and sent to kitchen",
      );
    } catch (err) {
      req.log.error({ err }, "Square payment failed — order not saved");
      const message =
        err instanceof Error
          ? err.message.replace(/^Payment failed: /, "")
          : "Your card could not be charged. Please try another card.";
      res.status(402).json({ error: message });
      return;
    }

    const chargedTotalCents = Math.round(squareResult.chargedTotalCents);
    const money = buildOrderMoneyCents({
      subtotalCents,
      taxCents,
      tipCents,
      platformFeeCents: 0,
      deliveryFeeCents,
      processingFeeCents: 0,
      discountCents: 0,
      chargedTotalCents,
    });
    const chargedTotal = centsToDollars(money.totalCents);
    const paidAt = new Date();

    await db.insert(ordersTable).values({
      id: orderId,
      tenantId,
      customerId: customerRecord.customerId,
      addressId: customerRecord.addressId,
      customerName: customerDisplayName,
      customerPhone: customerRecord.phoneE164,
      customerEmail: customerRecord.email,
      orderType: input.orderType,
      deliveryAddress: deliveryAddressFormatted,
      subtotal: centsToDollars(money.subtotalCents),
      tax: centsToDollars(money.taxCents),
      tip: centsToDollars(money.tipCents),
      platformFee: centsToDollars(money.platformFeeCents),
      processingFee: centsToDollars(money.processingFeeCents),
      discount: centsToDollars(money.discountCents),
      total: chargedTotal,
      deliveryFee: centsToDollars(money.deliveryFeeCents),
      subtotalCents: money.subtotalCents,
      taxCents: money.taxCents,
      tipCents: money.tipCents,
      platformFeeCents: money.platformFeeCents,
      deliveryFeeCents: money.deliveryFeeCents,
      processingFeeCents: money.processingFeeCents,
      discountCents: money.discountCents,
      totalCents: money.totalCents,
      status: "pending",
      paymentTiming,
      paymentStatus,
      channel,
      sourceDetail,
      paidAt,
      acceptedAt: paidAt,
      doordashExternalDeliveryId:
        input.orderType === "delivery"
          ? (input.doordashExternalDeliveryId ?? null)
          : null,
      squareOrderId: squareResult.squareOrderId,
      squarePaymentId: squareResult.squarePaymentId,
      specialInstructions: input.specialInstructions ?? null,
    });

    for (const line of lines) {
      await db.insert(orderLinesTable).values({
        id: randomUUID(),
        orderId,
        ...line,
      });
    }

    try {
      await recordCustomerPaidOrder({
        tenantId,
        customerId: customerRecord.customerId,
        totalCents: money.totalCents,
      });
    } catch (err) {
      req.log.error({ err, orderId }, "Customer aggregate update failed");
    }

    let doordashTrackingUrl: string | null = null;
    let doordashStatus: string | null = null;
    let estimatedDropoffTime: string | null = null;

    if (input.orderType === "delivery" && input.doordashExternalDeliveryId) {
      try {
        const ddResult = await acceptDeliveryQuote({
          externalDeliveryId: input.doordashExternalDeliveryId,
          firstName: input.firstName,
          lastName: input.lastName,
          customerPhone: customerRecord.phoneE164,
          address: input.address!,
          orderValueCents: subtotalCents + taxCents,
          items: lines.map((l) => ({
            name: l.menuItemName,
            quantity: l.quantity,
          })),
          specialInstructions: input.specialInstructions,
          tenant,
        });
        doordashTrackingUrl = ddResult.trackingUrl || null;
        doordashStatus = ddResult.status;
        estimatedDropoffTime = ddResult.estimatedDropoffTime || null;

        await db
          .update(ordersTable)
          .set({
            doordashTrackingUrl,
            doordashStatus,
            estimatedDropoffTime,
          })
          .where(eq(ordersTable.id, orderId));

        req.log.info(
          {
            deliveryId: ddResult.deliveryId,
            trackingUrl: ddResult.trackingUrl,
          },
          "DoorDash delivery dispatched after payment",
        );
      } catch (err) {
        req.log.error(
          { err, orderId },
          "DoorDash dispatch failed after payment — issuing refund",
        );
        try {
          await refundSquarePayment(
            squareResult.squarePaymentId,
            squareResult.chargedTotalCents,
            orderId,
            tenant.slug,
          );
          await db
            .update(ordersTable)
            .set({
              status: "cancelled",
              paymentStatus: "refunded",
              refundCents: squareResult.chargedTotalCents,
              refundedAt: new Date(),
            })
            .where(eq(ordersTable.id, orderId));
          if (isBpAnchorConfigured(tenant.slug)) {
            void anchorRefundedOrder({
              orderId,
              tenantSlug: tenant.slug,
              tenantName: tenant.name,
              amount: squareResult.chargedTotalCents / 100,
              squarePaymentId: squareResult.squarePaymentId,
              channel,
            }).catch((err) => {
              req.log.warn({ err, orderId }, "BP refund anchor failed");
            });
          }
        } catch (refundErr) {
          req.log.error(
            { refundErr, orderId, squarePaymentId: squareResult.squarePaymentId },
            "CRITICAL: refund failed after DoorDash dispatch failure — manual intervention required",
          );
        }
        res.status(503).json({
          error:
            "Your card was charged but we could not dispatch delivery. A refund has been initiated. Please call the restaurant.",
        });
        return;
      }
    }

    const posNative = isPosNativeAnchor({
      slug: tenant.slug,
      anchorMode: tenant.anchorMode,
    });

    // Always POST create-anchor after paid when BP is configured.
    // (Samurai was previously pos-native / poll-only — BP never received reference_id.)
    // Callback + poll remain the proof-back path; POST registers the Orderly UUID.
    if (isBpAnchorConfigured(tenant.slug)) {
      try {
        if (posNative) {
          req.log.info(
            { orderId, mode: "pos-native" },
            "pos-native tenant: still POSTing Orderly reference_id to BP (platform register)",
          );
        }
        const anchor = await anchorPaidOrder({
          orderId,
          tenantSlug: tenant.slug,
          tenantName: tenant.name,
          orderType: input.orderType,
          total: chargedTotal,
          squarePaymentId: squareResult.squarePaymentId,
          squareOrderId: squareResult.squareOrderId,
          customerName: customerDisplayName,
          channel,
          items: lines.map((l) => ({
            name: l.menuItemName,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
          })),
        });
        if (anchor.ok) {
          const chainTxHash = anchor.txHash ?? null;
          const bpExplorerUrl = defaultExplorerUrl(chainTxHash);
          await db
            .update(ordersTable)
            .set({
              bpAnchorId: anchor.anchorId ?? null,
              bpContentHash: anchor.contentHash ?? null,
              bpAnchorStatus: anchor.status ?? "queued",
              chainTxHash,
              bpExplorerUrl,
            })
            .where(eq(ordersTable.id, orderId));
          req.log.info(
            { anchorId: anchor.anchorId, status: anchor.status, chainTxHash },
            "BP post-pay anchor queued",
          );
          if (!chainTxHash) {
            void syncOrderAnchorFromBp({
              id: orderId,
              tenantId: tenant.id,
              bpAnchorId: anchor.anchorId ?? null,
              squarePaymentId: squareResult.squarePaymentId ?? null,
              chainTxHash: null,
            }).catch((err) => {
              req.log.warn({ err, orderId }, "anchor poll after POST failed");
            });
          }
        } else {
          req.log.error(
            { anchor },
            "BP post-pay anchor failed — order still paid",
          );
          await db
            .update(ordersTable)
            .set({ bpAnchorStatus: "pending" })
            .where(eq(ordersTable.id, orderId));
        }
      } catch (err) {
        req.log.error({ err }, "BP post-pay anchor threw — order still paid");
        try {
          await db
            .update(ordersTable)
            .set({ bpAnchorStatus: "pending" })
            .where(eq(ordersTable.id, orderId));
        } catch {
          /* ignore */
        }
      }
    } else if (posNative) {
      try {
        await db
          .update(ordersTable)
          .set({ bpAnchorStatus: "pending" })
          .where(eq(ordersTable.id, orderId));
      } catch (err) {
        req.log.error(
          { err },
          "Failed to mark pos-native pending — order still paid",
        );
      }
    }

    if (isOwnerConfigured()) {
      try {
        const ownerResult = await syncOrderToOwner({
          orderId,
          customerName: customerDisplayName,
          customerPhone: customerRecord.phoneE164,
          customerEmail: customerRecord.email,
          orderType: input.orderType,
          deliveryAddress: deliveryAddressFormatted,
          items: lines.map((l) => ({
            name: l.menuItemName,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
          })),
          subtotal,
          tax,
          total,
          specialInstructions: input.specialInstructions,
        });
        req.log.info(
          {
            ownerOrderId: ownerResult.ownerOrderId,
            loyaltyPoints: ownerResult.loyaltyPointsEarned,
          },
          "Order synced to Owner.com",
        );
      } catch (err) {
        req.log.error({ err }, "Failed to sync order to Owner.com");
      }
    }

    const order = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId));
    const orderLines = await db
      .select()
      .from(orderLinesTable)
      .where(eq(orderLinesTable.orderId, orderId));

    const saved = order[0];
    if (saved) {
      void enqueueOrderCompletedWebhook({
        event: "order.completed.v1",
        idempotency_key: `order.completed.v1:${saved.id}`,
        tenant_id: saved.tenantId,
        order: {
          id: saved.id,
          order_type: saved.orderType,
          payment_status: saved.paymentStatus,
          status: saved.status,
          money: {
            subtotal_cents: saved.subtotalCents,
            tax_cents: saved.taxCents,
            tip_cents: saved.tipCents,
            platform_fee_cents: saved.platformFeeCents,
            delivery_fee_cents: saved.deliveryFeeCents,
            processing_fee_cents: saved.processingFeeCents,
            discount_cents: saved.discountCents,
            total_cents: saved.totalCents,
          },
          customer: {
            id: saved.customerId,
            name: saved.customerName,
            phone: saved.customerPhone,
            email: saved.customerEmail,
          },
          square_order_id: saved.squareOrderId,
          square_payment_id: saved.squarePaymentId,
          created_at: saved.createdAt?.toISOString() ?? null,
        },
        anchor: {
          bp_anchor_id: saved.bpAnchorId,
          bp_anchor_status: saved.bpAnchorStatus,
          bp_content_hash: saved.bpContentHash,
          chain_tx_hash: saved.chainTxHash,
          explorer_url:
            saved.bpExplorerUrl ?? defaultExplorerUrl(saved.chainTxHash),
        },
      }).catch((err) => {
        req.log.error({ err, orderId }, "Bridge order.completed webhook failed");
      });

      // Meta CAPI Purchase — async outbox only (never block 201 on Graph).
      void (async () => {
        let marketingConsentEmail = false;
        let marketingConsentSms = false;
        if (saved.customerId) {
          try {
            const rows = await db
              .select({
                marketingConsentEmail: customersTable.marketingConsentEmail,
                marketingConsentSms: customersTable.marketingConsentSms,
              })
              .from(customersTable)
              .where(eq(customersTable.id, saved.customerId))
              .limit(1);
            if (rows[0]) {
              marketingConsentEmail = rows[0].marketingConsentEmail;
              marketingConsentSms = rows[0].marketingConsentSms;
            }
          } catch {
            /* proceed without PII hashes if lookup fails */
          }
        }
        await enqueuePurchaseFromOrder({
          tenantId: saved.tenantId,
          orderId: saved.id,
          valueCents: saved.totalCents ?? 0,
          contentIds: orderLines
            .map((l) => l.menuItemId)
            .filter((id): id is string => Boolean(id)),
          email: saved.customerEmail,
          phoneE164: saved.customerPhone,
          marketingConsentEmail,
          marketingConsentSms,
          clientIp: typeof req.ip === "string" ? req.ip : null,
          userAgent:
            typeof req.headers["user-agent"] === "string"
              ? req.headers["user-agent"]
              : null,
        });
      })().catch((err) => {
        req.log.warn({ err, orderId }, "meta CAPI Purchase enqueue failed");
      });
    }

    res.status(201).json({
      ...order[0],
      firstName: input.firstName,
      lastName: input.lastName ?? null,
      items: orderLines,
      doordashTrackingUrl,
      estimatedDropoffTime,
      createdAt: order[0]?.createdAt?.toISOString(),
      chainTxHash: order[0]?.chainTxHash ?? null,
      bpExplorerUrl:
        order[0]?.bpExplorerUrl ?? defaultExplorerUrl(order[0]?.chainTxHash),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create order");
    res.status(500).json({ error: "Failed to create order" });
  }
});

router.get("/orders/:id", async (req, res): Promise<void> => {
  const { id } = req.params;
  const tenantId = req.tenant?.id ?? getTenantId();
  try {
    const order = await db
      .select()
      .from(ordersTable)
      .where(
        and(eq(ordersTable.id, id), eq(ordersTable.tenantId, tenantId)),
      );
    if (!order[0]) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    const orderLines = await db
      .select()
      .from(orderLinesTable)
      .where(eq(orderLinesTable.orderId, id));
    res.json({
      ...order[0],
      items: orderLines,
      createdAt: order[0].createdAt?.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get order");
    res.status(500).json({ error: "Failed to retrieve order" });
  }
});

/** Attach / refresh Expo push token for pickup-ready alerts (device-local). */
router.post("/orders/:id/push-token", async (req, res): Promise<void> => {
  const { id } = req.params;
  const tenantId = req.tenant?.id ?? getTenantId();
  const tokenRaw =
    typeof req.body?.expoPushToken === "string"
      ? req.body.expoPushToken
      : typeof req.body?.expo_push_token === "string"
        ? req.body.expo_push_token
        : null;
  if (!isExpoPushToken(tokenRaw)) {
    res.status(400).json({ error: "Valid expoPushToken required" });
    return;
  }
  try {
    const rows = await db
      .select()
      .from(ordersTable)
      .where(and(eq(ordersTable.id, id), eq(ordersTable.tenantId, tenantId)));
    const order = rows[0];
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    const prev =
      order.sourceDetail && typeof order.sourceDetail === "object"
        ? (order.sourceDetail as Record<string, unknown>)
        : {};
    const sourceDetail = {
      ...prev,
      expo_push_token: tokenRaw.trim(),
    };
    await db
      .update(ordersTable)
      .set({ sourceDetail })
      .where(eq(ordersTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to save push token");
    res.status(500).json({ error: "Failed to save push token" });
  }
});

/** Device-local order history only — pass order IDs saved on this device. */
router.post("/account/orders", async (req, res): Promise<void> => {
  const schema = z.object({
    orderIds: z.array(z.string().uuid()).max(20),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  try {
    const ordersWithLines = await Promise.all(
      parsed.data.orderIds.map(async (id) => {
        const rows = await db
          .select()
          .from(ordersTable)
          .where(
            and(
              eq(ordersTable.id, id),
              eq(ordersTable.tenantId, req.tenant?.id ?? getTenantId()),
            ),
          )
          .limit(1);
        const order = rows[0];
        if (!order) return null;
        const lines = await db
          .select()
          .from(orderLinesTable)
          .where(eq(orderLinesTable.orderId, id));
        return {
          ...order,
          createdAt: order.createdAt?.toISOString(),
          lines,
        };
      }),
    );

    res.json({
      orders: ordersWithLines.filter(Boolean),
    });
  } catch (err) {
    req.log.error({ err }, "Account orders failed");
    res.status(500).json({ error: "Failed to load orders" });
  }
});

router.get("/owner/stats", async (req, res): Promise<void> => {
  if (!(await checkPin(req.query.pin))) {
    res.status(401).json({ error: "Invalid PIN" });
    return;
  }
  try {
    const tenantId = req.tenant?.id ?? getTenantId();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayOrders = await db
      .select()
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.tenantId, tenantId),
          gte(ordersTable.createdAt, todayStart),
        ),
      )
      .orderBy(desc(ordersTable.createdAt));

    const recentOrders = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.tenantId, tenantId))
      .orderBy(desc(ordersTable.createdAt))
      .limit(20);

    const todaySales = todayOrders.reduce((sum, o) => sum + o.total, 0);
    const avgTicket =
      todayOrders.length > 0 ? todaySales / todayOrders.length : 0;

    res.json({
      todayCount: todayOrders.length,
      todaySales,
      avgTicket,
      todayOrders: todayOrders.map((o) => ({
        ...o,
        createdAt: o.createdAt?.toISOString(),
      })),
      recentOrders: recentOrders.map((o) => ({
        ...o,
        createdAt: o.createdAt?.toISOString(),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Owner stats failed");
    res.status(500).json({ error: "Failed to load stats" });
  }
});

router.get("/owner/integrations", async (req, res): Promise<void> => {
  if (!(await checkPin(req.query.pin))) {
    res.status(401).json({ error: "Invalid PIN" });
    return;
  }
  res.json({
    square: {
      configured: await isSquareConfigured(req.tenant?.slug),
      webPayments: await isSquareWebPaymentsConfigured(req.tenant?.slug),
      environment:
        process.env.SQUARE_ENVIRONMENT ??
        process.env[`TENANT_${(req.tenant?.slug ?? "samurai").toUpperCase()}_SQUARE_ENVIRONMENT`] ??
        "sandbox",
    },
    doordash: { configured: isDoordashConfigured(req.tenant?.slug) },
    branchlesspay: {
      shield: isBranchlesspayConfigured(req.tenant?.slug),
      anchor: isBpAnchorConfigured(req.tenant?.slug),
    },
    owner: { configured: isOwnerConfigured() },
  });
});

router.patch("/owner/orders/:id/status", async (req, res): Promise<void> => {
  const { pin, status } = req.body as { pin: string; status: string };
  if (!(await checkPin(pin))) {
    res.status(401).json({ error: "Invalid PIN" });
    return;
  }
  const allowed = ["pending", "preparing", "ready", "completed", "cancelled"];
  if (!allowed.includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }
  try {
    const tenantId = req.tenant?.id ?? getTenantId();
    const rows = await db
      .select()
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.id, req.params.id),
          eq(ordersTable.tenantId, tenantId),
        ),
      );
    const order = rows[0];
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    await db
      .update(ordersTable)
      .set({ status, ...statusTimestampPatch(status) })
      .where(eq(ordersTable.id, req.params.id));

    if (
      order.squareOrderId &&
      (status === "ready" || status === "completed" || status === "cancelled")
    ) {
      try {
        await syncSquareOrderFromOwnerStatus(
          order.squareOrderId,
          status as "ready" | "completed" | "cancelled",
          req.tenant?.slug ?? getTenantId(),
        );
      } catch (err) {
        req.log.error(
          { err, squareOrderId: order.squareOrderId },
          "Square status sync failed",
        );
      }
    }

    if (status === "ready" && order.status !== "ready") {
      void notifyPickupReady({
        orderId: order.id,
        restaurantName: req.tenant?.name ?? req.tenant?.slug ?? null,
        sourceDetail: (order.sourceDetail ?? {}) as Record<string, unknown>,
        log: req.log,
      }).catch((err) => {
        req.log?.warn({ err, orderId: order.id }, "pickup ready push failed");
      });
    }

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Status update failed");
    res.status(500).json({ error: "Failed to update status" });
  }
});

/**
 * Owner-initiated refund (PIN). Money path — use only for real refunds / BP refund-anchor tests.
 * Does NOT invent sales; marks payment_status=refunded and refund_cents separately.
 */
router.post("/owner/orders/:id/refund", async (req, res): Promise<void> => {
  const { pin } = req.body as { pin?: string };
  if (!(await checkPin(pin))) {
    res.status(401).json({ error: "Invalid PIN" });
    return;
  }
  try {
    const tenantId = req.tenant?.id ?? getTenantId();
    const tenant = req.tenant ?? envFallbackTenant();
    const rows = await db
      .select()
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.id, req.params.id),
          eq(ordersTable.tenantId, tenantId),
        ),
      );
    const order = rows[0];
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    if (order.paymentStatus === "refunded") {
      res.status(400).json({ error: "Order already refunded" });
      return;
    }
    if (order.paymentStatus !== "paid" || !order.squarePaymentId) {
      res.status(400).json({ error: "Order is not a refundable paid Square charge" });
      return;
    }
    const amountCents = order.totalCents || Math.round(order.total * 100);
    await refundSquarePayment(
      order.squarePaymentId,
      amountCents,
      order.id,
      tenant.slug,
    );
    await db
      .update(ordersTable)
      .set({
        paymentStatus: "refunded",
        status: order.status === "cancelled" ? order.status : "cancelled",
        refundCents: amountCents,
        refundedAt: new Date(),
      })
      .where(eq(ordersTable.id, order.id));

    let refundAnchor: Awaited<ReturnType<typeof anchorRefundedOrder>> | null =
      null;
    if (isBpAnchorConfigured(tenant.slug)) {
      refundAnchor = await anchorRefundedOrder({
        orderId: order.id,
        tenantSlug: tenant.slug,
        tenantName: tenant.name,
        amount: amountCents / 100,
        squarePaymentId: order.squarePaymentId,
        channel: order.channel,
      });
    }

    res.json({
      ok: true,
      refund_cents: amountCents,
      bp_refund_anchor: refundAnchor,
    });
  } catch (err) {
    req.log.error({ err }, "Owner refund failed");
    res.status(500).json({
      error: err instanceof Error ? err.message : "Refund failed",
    });
  }
});

export default router;
