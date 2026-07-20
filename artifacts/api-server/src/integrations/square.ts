/**
 * Square POS — prepaid web orders, credentials resolved per tenant.
 * Flow: CreateOrder → Charge card → Accept kitchen (RESERVED).
 */

import type { StructuredAddress } from "../lib/address";
import {
  SQUARE_ORDER_SOURCE_NAME,
  tenantOnlySecret,
} from "../lib/tenant";
import {
  reconcileSquareTax,
  taxRateToSquarePercentage,
} from "../lib/tenantTax";
import { resolveSquareCredsFromDb } from "../lib/squareOauth";
import { logger } from "../lib/logger";

export interface SquareOrderItem {
  menuItemId: string;
  menuItemName: string;
  sku?: string | null;
  quantity: number;
  unitPrice: number;
  specialInstructions?: string | null;
}

export interface SquareOrderInput {
  orderId: string;
  customerName: string;
  firstName: string;
  lastName?: string | null;
  customerPhone: string;
  orderType: "pickup" | "delivery";
  deliveryAddress?: string | null;
  deliveryAddressStructured?: StructuredAddress | null;
  items: SquareOrderItem[];
  subtotal: number;
  tax: number;
  deliveryFee?: number;
  total: number;
  /** Tip in dollars — charged via Square tip_money (100% restaurant). */
  tip?: number;
  tipCents?: number;
  /**
   * Tenant sales-tax decimal (0.06 = 6%). Required — never invent 7%.
   * Applied as Square ORDER-scoped ADDITIVE tax percentage.
   */
  taxRate: number;
  /** Orderly tax cents — reconciled against Square CreateOrder before charge. */
  expectedTaxCents: number;
  specialInstructions?: string | null;
  squarePaymentSourceId: string;
  /** Tenant slug for secret lookup + kitchen note branding. */
  tenantSlug: string;
  tenantName?: string;
  /** Effective prep minutes from kitchen settings (busy-aware). */
  prepTimeMinutes?: number;
}

export interface SquareOrderResult {
  squareOrderId: string;
  squareOrderVersion: number;
  squarePaymentId: string;
  chargedTotalCents: number;
  /** Square-reported tax cents (must equal Orderly expectedTaxCents). */
  squareTaxCents: number;
}

const SQUARE_API_VERSION = "2024-11-20";
const DEFAULT_PREP_TIME_MINUTES = 20;

/** Square pickup_details.prep_time_duration (ISO-8601 duration). */
export function toSquarePrepTimeDuration(minutes?: number | null): string {
  if (minutes == null) return `PT${DEFAULT_PREP_TIME_MINUTES}M`;
  const n = Number(minutes);
  const m = Number.isFinite(n)
    ? Math.min(240, Math.max(1, Math.round(n)))
    : DEFAULT_PREP_TIME_MINUTES;
  return `PT${m}M`;
}

export type SquareCreds = {
  accessToken: string;
  locationId: string;
  applicationId: string;
  environment: string;
  baseUrl: string;
};

type CatalogVariation = { id: string; version: number };
const catalogBySku = new Map<string, CatalogVariation>();

/**
 * Env path — FAIL-CLOSED per tenant (same anti-pattern fix as Meta CAPI).
 * Uses TENANT_{SLUG}_SQUARE_* only. Never falls back to global SQUARE_* —
 * that silently routed Kirin payments to Samurai's location.
 *
 * Samurai production must set TENANT_SAMURAI_SQUARE_* (mirror former SQUARE_*).
 * Exported for unit tests.
 */
export function resolveSquareCredsFromEnv(slug: string): SquareCreds | null {
  const accessToken = tenantOnlySecret(slug, "SQUARE_ACCESS_TOKEN");
  const locationId = tenantOnlySecret(slug, "SQUARE_LOCATION_ID");
  const applicationId = tenantOnlySecret(slug, "SQUARE_APPLICATION_ID");
  const environment = tenantOnlySecret(slug, "SQUARE_ENVIRONMENT");
  if (!accessToken || !locationId || !applicationId || !environment) {
    return null;
  }
  return {
    accessToken,
    locationId,
    applicationId,
    environment,
    baseUrl:
      environment === "production"
        ? "https://connect.squareup.com"
        : "https://connect.squareupsandbox.com",
  };
}

/**
 * Env TENANT_{SLUG}_SQUARE_* first (fail-closed, no global SQUARE_*).
 * Else Square OAuth row for that tenant (onboarding). Never borrow another
 * tenant's credentials.
 */
export async function getSquareCredsForTenantSlug(
  slug: string,
): Promise<SquareCreds | null> {
  const envCreds = resolveSquareCredsFromEnv(slug);
  if (envCreds) return envCreds;

  const dbCreds = await resolveSquareCredsFromDb(slug);
  if (!dbCreds) return null;
  const applicationId = process.env.SQUARE_OAUTH_APPLICATION_ID?.trim() ?? "";
  if (!applicationId) return null;
  return {
    accessToken: dbCreds.accessToken,
    locationId: dbCreds.locationId,
    applicationId,
    environment: dbCreds.environment,
    baseUrl:
      dbCreds.environment === "production"
        ? "https://connect.squareup.com"
        : "https://connect.squareupsandbox.com",
  };
}

/** @deprecated Use the exported `getSquareCredsForTenantSlug` instead. */
const resolveSquareCreds = getSquareCredsForTenantSlug;

export async function isSquareConfigured(slug?: string): Promise<boolean> {
  const s = slug ?? process.env.TENANT_ID?.trim() ?? "samurai";
  const c = await resolveSquareCreds(s);
  return Boolean(c?.accessToken && c?.locationId);
}

export async function isSquareWebPaymentsConfigured(slug?: string): Promise<boolean> {
  return (
    (await resolveSquareCreds(slug ?? process.env.TENANT_ID?.trim() ?? "samurai")) !== null
  );
}

export async function getSquarePublicConfig(slug?: string): Promise<
  | { enabled: false }
  | {
      enabled: true;
      applicationId: string;
      locationId: string;
      environment: string;
    }
> {
  const c = await resolveSquareCreds(slug ?? process.env.TENANT_ID?.trim() ?? "samurai");
  if (!c) return { enabled: false };
  return {
    enabled: true,
    applicationId: c.applicationId,
    locationId: c.locationId,
    environment: c.environment,
  };
}

async function squareRequest<T>(
  creds: SquareCreds,
  path: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetch(`${creds.baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${creds.accessToken}`,
      "Square-Version": SQUARE_API_VERSION,
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Square API error ${response.status}: ${text}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function resolveCatalogVariation(
  creds: SquareCreds,
  sku: string | null | undefined,
): Promise<CatalogVariation | null> {
  const trimmed = sku?.trim();
  if (!trimmed) return null;

  const cacheKey = `${creds.locationId}:${trimmed.toUpperCase()}`;
  const cached = catalogBySku.get(cacheKey);
  if (cached) return cached;

  try {
    const data = await squareRequest<{
      objects?: Array<{ id: string; version: number }>;
    }>(creds, "/v2/catalog/search", {
      method: "POST",
      body: JSON.stringify({
        object_types: ["ITEM_VARIATION"],
        query: {
          exact_query: {
            attribute_name: "sku",
            attribute_value: trimmed,
          },
        },
        limit: 1,
      }),
    });

    const variation = data.objects?.[0];
    if (!variation?.id) return null;

    const entry = { id: variation.id, version: variation.version };
    catalogBySku.set(cacheKey, entry);
    return entry;
  } catch (err) {
    console.error(`[Square] catalog lookup failed for SKU ${trimmed}:`, err);
    return null;
  }
}

async function buildSquareLineItems(
  creds: SquareCreds,
  items: SquareOrderItem[],
): Promise<Array<Record<string, unknown>>> {
  return Promise.all(
    items.map(async (item) => {
      const catalog = await resolveCatalogVariation(creds, item.sku);
      const note = item.specialInstructions?.trim() || undefined;

      if (catalog) {
        return {
          catalog_object_id: catalog.id,
          catalog_version: catalog.version,
          quantity: String(item.quantity),
          ...(note ? { note } : {}),
        };
      }

      return {
        name: item.menuItemName,
        quantity: String(item.quantity),
        base_price_money: {
          amount: Math.round(item.unitPrice * 100),
          currency: "USD",
        },
        ...(note ? { note } : {}),
      };
    }),
  );
}

type SquareOrderPayload = {
  order: {
    id: string;
    version: number;
    state?: string;
    fulfillments?: Array<{ uid?: string; state?: string }>;
  };
};

async function fetchSquareOrder(
  creds: SquareCreds,
  squareOrderId: string,
): Promise<SquareOrderPayload> {
  return squareRequest<SquareOrderPayload>(creds, `/v2/orders/${squareOrderId}`, {
    method: "GET",
  });
}

/** Read-only: current Square fulfillment state for kitchen sync into Orderly. */
export async function getSquareFulfillmentState(
  squareOrderId: string,
  tenantSlug?: string,
): Promise<{ state: string | null; orderState: string | null }> {
  const slug = tenantSlug ?? process.env.TENANT_ID?.trim() ?? "samurai";
  const creds = await resolveSquareCreds(slug);
  if (!creds) return { state: null, orderState: null };
  const current = await fetchSquareOrder(creds, squareOrderId);
  const fulfillment = current.order?.fulfillments?.[0];
  return {
    state: fulfillment?.state ?? null,
    orderState: current.order?.state ?? null,
  };
}

async function updateFulfillmentState(
  creds: SquareCreds,
  squareOrderId: string,
  version: number,
  fulfillmentUid: string,
  state: string,
  idempotencySuffix: string,
): Promise<SquareOrderPayload> {
  return squareRequest<SquareOrderPayload>(creds, `/v2/orders/${squareOrderId}`, {
    method: "PUT",
    body: JSON.stringify({
      idempotency_key: `${idempotencySuffix}-${squareOrderId}-${version}`,
      order: {
        version,
        fulfillments: [{ uid: fulfillmentUid, state }],
      },
    }),
  });
}

async function cancelSquareOrder(
  creds: SquareCreds,
  squareOrderId: string,
  version: number,
): Promise<void> {
  try {
    await squareRequest(creds, `/v2/orders/${squareOrderId}/cancel`, {
      method: "POST",
      body: JSON.stringify({
        idempotency_key: `cancel-${squareOrderId}`,
        version,
      }),
    });
  } catch (err) {
    console.error("[Square] failed to cancel unpaid order:", err);
  }
}

async function acceptOrderForKitchen(
  creds: SquareCreds,
  squareOrderId: string,
): Promise<void> {
  const current = await fetchSquareOrder(creds, squareOrderId);
  const fulfillment = current.order?.fulfillments?.[0];
  if (!fulfillment?.uid) {
    throw new Error("Square order has no fulfillment to accept");
  }

  if (fulfillment.state === "RESERVED" || fulfillment.state === "PREPARED") {
    return;
  }

  await updateFulfillmentState(
    creds,
    squareOrderId,
    current.order.version,
    fulfillment.uid,
    "RESERVED",
    "accept-kitchen",
  );
}

async function chargeCardPayment(
  creds: SquareCreds,
  input: SquareOrderInput,
  squareOrderId: string,
  amountCents: number,
  tipCents: number,
): Promise<string> {
  const body: Record<string, unknown> = {
    idempotency_key: `pay-${input.orderId}`,
    source_id: input.squarePaymentSourceId,
    amount_money: { amount: amountCents, currency: "USD" },
    order_id: squareOrderId,
    location_id: creds.locationId,
    autocomplete: true,
  };
  if (tipCents > 0) {
    body.tip_money = { amount: tipCents, currency: "USD" };
  }
  const data = await squareRequest<{ payment: { id: string } }>(
    creds,
    "/v2/payments",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
  return data.payment.id;
}

export async function sendOrderToSquare(
  input: SquareOrderInput,
): Promise<SquareOrderResult> {
  const creds = await resolveSquareCreds(input.tenantSlug);
  if (!creds) {
    throw new Error(
      "Web checkout unavailable. Set SQUARE_APPLICATION_ID, SQUARE_ACCESS_TOKEN, and SQUARE_LOCATION_ID for this tenant.",
    );
  }

  if (!input.squarePaymentSourceId?.trim()) {
    throw new Error("Card payment is required. Complete the secure card form.");
  }

  const brand = input.tenantName?.trim() || "Website";
  const lineItems = await buildSquareLineItems(creds, input.items);
  if (input.deliveryFee && input.deliveryFee > 0) {
    lineItems.push({
      name: "Delivery Fee",
      quantity: "1",
      taxable: false,
      base_price_money: {
        amount: Math.round(input.deliveryFee * 100),
        currency: "USD",
      },
    });
  }
  const ticketName = input.customerName.slice(0, 30);
  const prepTimeDuration = toSquarePrepTimeDuration(input.prepTimeMinutes);

  // DoorDash Drive = last mile; Square uses PICKUP so POS + kitchen print work.
  const fulfillmentBase =
    input.orderType === "pickup"
      ? {
          type: "PICKUP" as const,
          pickup_details: {
            schedule_type: "ASAP",
            prep_time_duration: prepTimeDuration,
            auto_complete_duration: "PT60M",
            recipient: {
              display_name: input.customerName,
              phone_number: input.customerPhone,
            },
            note: input.specialInstructions ?? `${brand} website pickup`,
          },
        }
      : {
          type: "PICKUP" as const,
          pickup_details: {
            schedule_type: "ASAP",
            prep_time_duration: prepTimeDuration,
            auto_complete_duration: "PT60M",
            recipient: {
              display_name: input.customerName,
              phone_number: input.customerPhone,
            },
            note: [
              "DoorDash delivery",
              input.deliveryAddress,
              input.specialInstructions,
            ]
              .filter(Boolean)
              .join(" · "),
          },
        };

  const data = await squareRequest<{
    order: {
      id: string;
      version: number;
      total_money?: { amount: number };
      total_tax_money?: { amount: number };
      taxes?: Array<{
        percentage?: string;
        applied_money?: { amount: number };
      }>;
    };
  }>(creds, "/v2/orders", {
    method: "POST",
    body: JSON.stringify({
      idempotency_key: input.orderId,
      order: {
        location_id: creds.locationId,
        reference_id: input.orderId.slice(0, 40),
        state: "OPEN",
        ticket_name: ticketName,
        source: { name: SQUARE_ORDER_SOURCE_NAME },
        line_items: lineItems,
        taxes: [
          {
            name: "Sales Tax",
            percentage: taxRateToSquarePercentage(input.taxRate),
            scope: "ORDER",
          },
        ],
        fulfillments: [{ ...fulfillmentBase, state: "PROPOSED" }],
        metadata: {
          source: "orderly-website",
          payment_timing: "prepaid",
          tenant_id: input.tenantSlug,
          tenant: input.tenantSlug,
          ...(input.specialInstructions
            ? { special_instructions: input.specialInstructions }
            : {}),
        },
      },
    }),
  });

  const squareOrderId = data.order.id;
  const orderVersion = data.order.version;
  const squareTaxCents = data.order.total_tax_money?.amount ?? null;
  const taxCheck = reconcileSquareTax({
    expectedTaxCents: input.expectedTaxCents,
    squareTaxCents,
    tenantSlug: input.tenantSlug,
    orderId: input.orderId,
  });
  if (!taxCheck.ok) {
    logger.error(
      {
        code: taxCheck.code,
        tenantSlug: input.tenantSlug,
        orderId: input.orderId,
        squareOrderId,
        expectedTaxCents: taxCheck.expectedTaxCents,
        squareTaxCents: taxCheck.squareTaxCents,
        deltaCents: taxCheck.deltaCents,
        squareTaxPercentage: data.order.taxes?.[0]?.percentage ?? null,
        orderlyTaxRate: input.taxRate,
      },
      "CRITICAL: Square vs Orderly tax mismatch — canceling unpaid order (no charge)",
    );
    await cancelSquareOrder(creds, squareOrderId, orderVersion);
    throw new Error(
      `Payment failed: ${taxCheck.message}. Please try again or call the restaurant.`,
    );
  }

  const orderTotalCents =
    data.order.total_money?.amount ?? Math.round(input.total * 100);
  const tipCents = Math.max(
    0,
    Math.round(
      input.tipCents ??
        (input.tip != null ? Math.round(input.tip * 100) : 0),
    ),
  );

  let squarePaymentId: string;
  try {
    squarePaymentId = await chargeCardPayment(
      creds,
      input,
      squareOrderId,
      orderTotalCents,
      tipCents,
    );
  } catch (err) {
    await cancelSquareOrder(creds, squareOrderId, orderVersion);
    const message =
      err instanceof Error ? err.message : "Card payment was declined";
    throw new Error(`Payment failed: ${message}`);
  }

  await acceptOrderForKitchen(creds, squareOrderId);

  return {
    squareOrderId,
    squareOrderVersion: orderVersion,
    squarePaymentId,
    chargedTotalCents: orderTotalCents + tipCents,
    squareTaxCents: taxCheck.squareTaxCents,
  };
}

type OwnerFulfillmentSync = "ready" | "completed" | "cancelled";

const FULFILLMENT_STATE: Record<OwnerFulfillmentSync, string> = {
  ready: "PREPARED",
  completed: "COMPLETED",
  cancelled: "CANCELED",
};

export async function syncSquareOrderFromOwnerStatus(
  squareOrderId: string,
  status: OwnerFulfillmentSync,
  tenantSlug?: string,
): Promise<void> {
  const slug = tenantSlug ?? process.env.TENANT_ID?.trim() ?? "samurai";
  const creds = await resolveSquareCreds(slug);
  if (!creds) return;

  const targetState = FULFILLMENT_STATE[status];
  const current = await fetchSquareOrder(creds, squareOrderId);
  const fulfillment = current.order?.fulfillments?.[0];
  if (!fulfillment?.uid) return;

  if (fulfillment.state === targetState) return;

  const body: Record<string, unknown> = {
    idempotency_key: `owner-${status}-${squareOrderId}-${current.order.version}`,
    order: {
      version: current.order.version,
      fulfillments: [{ uid: fulfillment.uid, state: targetState }],
    },
  };

  if (status === "completed") {
    (body.order as Record<string, unknown>).state = "COMPLETED";
  }

  await squareRequest(creds, `/v2/orders/${squareOrderId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

/**
 * Charge a card without attaching a Square Order (gift card purchase, etc.).
 * Caller must have already validated amount + tenant Square config.
 */
export async function createSquarePaymentOnly(input: {
  tenantSlug: string;
  sourceId: string;
  amountCents: number;
  note?: string;
  buyerEmail?: string;
  buyerName?: string;
  idempotencyKey?: string;
}): Promise<{ paymentId: string }> {
  const creds = await resolveSquareCreds(input.tenantSlug);
  if (!creds) {
    throw new Error("Square not configured for tenant");
  }
  if (!input.sourceId?.trim()) {
    throw new Error("Card payment source is required");
  }
  const amountCents = Math.round(input.amountCents);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new Error("amountCents must be a positive integer");
  }
  const body: Record<string, unknown> = {
    idempotency_key:
      input.idempotencyKey?.trim() ||
      `gc-pay-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    source_id: input.sourceId.trim(),
    amount_money: { amount: amountCents, currency: "USD" },
    location_id: creds.locationId,
    autocomplete: true,
  };
  if (input.note?.trim()) body.note = input.note.trim().slice(0, 500);
  if (input.buyerEmail?.trim()) {
    body.buyer_email_address = input.buyerEmail.trim();
  }
  const data = await squareRequest<{ payment: { id: string } }>(
    creds,
    "/v2/payments",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
  if (!data.payment?.id) {
    throw new Error("Square payment created without id");
  }
  return { paymentId: data.payment.id };
}

export async function refundSquarePayment(
  squarePaymentId: string,
  amountCents: number,
  orderId: string,
  tenantSlug?: string,
): Promise<void> {
  const slug = tenantSlug ?? process.env.TENANT_ID?.trim() ?? "samurai";
  const creds = await resolveSquareCreds(slug);
  if (!creds) {
    throw new Error("Square not configured for refund");
  }
  await squareRequest(creds, "/v2/refunds", {
    method: "POST",
    body: JSON.stringify({
      idempotency_key: `refund-${orderId}`,
      payment_id: squarePaymentId,
      amount_money: { amount: amountCents, currency: "USD" },
    }),
  });
}
