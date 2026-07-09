/**
 * Square POS Integration — prepaid web orders only.
 *
 * Flow: CreateOrder → Charge card (Web Payments token) → Accept kitchen (RESERVED).
 * Payment MUST succeed before charge. No EXTERNAL / fake-paid payments.
 */

import type { StructuredAddress } from "../lib/address";
import { SQUARE_ORDER_SOURCE_NAME } from "../lib/tenant";

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
  specialInstructions?: string | null;
  /** Card nonce from Square Web Payments SDK — required for every web order. */
  squarePaymentSourceId: string;
}

export interface SquareOrderResult {
  squareOrderId: string;
  squareOrderVersion: number;
  squarePaymentId: string;
  chargedTotalCents: number;
}

const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
const SQUARE_LOCATION_ID = process.env.SQUARE_LOCATION_ID;
const SQUARE_APPLICATION_ID = process.env.SQUARE_APPLICATION_ID;
const SQUARE_ENVIRONMENT = process.env.SQUARE_ENVIRONMENT ?? "sandbox";
const SQUARE_API_VERSION = "2024-11-20";

const SQUARE_BASE_URL =
  SQUARE_ENVIRONMENT === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";

const PREP_TIME_DURATION = "PT20M";

type CatalogVariation = { id: string; version: number };
const catalogBySku = new Map<string, CatalogVariation>();

export function isSquareConfigured(): boolean {
  return Boolean(SQUARE_ACCESS_TOKEN && SQUARE_LOCATION_ID);
}

export function isSquareWebPaymentsConfigured(): boolean {
  return Boolean(
    SQUARE_APPLICATION_ID && SQUARE_ACCESS_TOKEN && SQUARE_LOCATION_ID,
  );
}

export function getSquarePublicConfig():
  | { enabled: false }
  | {
      enabled: true;
      applicationId: string;
      locationId: string;
      environment: string;
    } {
  if (!isSquareWebPaymentsConfigured()) {
    return { enabled: false };
  }
  return {
    enabled: true,
    applicationId: SQUARE_APPLICATION_ID!,
    locationId: SQUARE_LOCATION_ID!,
    environment: SQUARE_ENVIRONMENT,
  };
}

async function squareRequest<T>(
  path: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetch(`${SQUARE_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
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
  sku: string | null | undefined,
): Promise<CatalogVariation | null> {
  const trimmed = sku?.trim();
  if (!trimmed) return null;

  const cacheKey = trimmed.toUpperCase();
  const cached = catalogBySku.get(cacheKey);
  if (cached) return cached;

  try {
    const data = await squareRequest<{
      objects?: Array<{ id: string; version: number }>;
    }>("/v2/catalog/search", {
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
  items: SquareOrderItem[],
): Promise<Array<Record<string, unknown>>> {
  return Promise.all(
    items.map(async (item) => {
      const catalog = await resolveCatalogVariation(item.sku);
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
    fulfillments?: Array<{ uid?: string; state?: string }>;
  };
};

async function fetchSquareOrder(squareOrderId: string): Promise<SquareOrderPayload> {
  return squareRequest<SquareOrderPayload>(`/v2/orders/${squareOrderId}`, {
    method: "GET",
  });
}

async function updateFulfillmentState(
  squareOrderId: string,
  version: number,
  fulfillmentUid: string,
  state: string,
  idempotencySuffix: string,
): Promise<SquareOrderPayload> {
  return squareRequest<SquareOrderPayload>(`/v2/orders/${squareOrderId}`, {
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
  squareOrderId: string,
  version: number,
): Promise<void> {
  try {
    await squareRequest(`/v2/orders/${squareOrderId}/cancel`, {
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

/** Auto-accept → RESERVED → kitchen ticket prints. Only after successful card charge. */
async function acceptOrderForKitchen(squareOrderId: string): Promise<void> {
  const current = await fetchSquareOrder(squareOrderId);
  const fulfillment = current.order?.fulfillments?.[0];
  if (!fulfillment?.uid) {
    throw new Error("Square order has no fulfillment to accept");
  }

  if (fulfillment.state === "RESERVED" || fulfillment.state === "PREPARED") {
    return;
  }

  await updateFulfillmentState(
    squareOrderId,
    current.order.version,
    fulfillment.uid,
    "RESERVED",
    "accept-kitchen",
  );
}

async function chargeCardPayment(
  input: SquareOrderInput,
  squareOrderId: string,
  amountCents: number,
): Promise<string> {
  const data = await squareRequest<{ payment: { id: string } }>("/v2/payments", {
    method: "POST",
    body: JSON.stringify({
      idempotency_key: `pay-${input.orderId}`,
      source_id: input.squarePaymentSourceId,
      amount_money: { amount: amountCents, currency: "USD" },
      order_id: squareOrderId,
      location_id: SQUARE_LOCATION_ID,
      autocomplete: true,
    }),
  });
  return data.payment.id;
}

/**
 * Prepaid web order: CreateOrder → Charge card → Fire kitchen.
 * If card charge fails, order is cancelled and kitchen is NOT fired.
 */
export async function sendOrderToSquare(
  input: SquareOrderInput,
): Promise<SquareOrderResult> {
  if (!isSquareWebPaymentsConfigured()) {
    throw new Error(
      "Web checkout unavailable. Set SQUARE_APPLICATION_ID, SQUARE_ACCESS_TOKEN, and SQUARE_LOCATION_ID.",
    );
  }

  if (!input.squarePaymentSourceId?.trim()) {
    throw new Error("Card payment is required. Complete the secure card form.");
  }

  const lineItems = await buildSquareLineItems(input.items);
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

  // DoorDash Drive handles last-mile delivery. Square must use PICKUP so the
  // order appears in Order Manager and kitchen printers (DELIVERY is beta-only).
  const fulfillmentBase =
    input.orderType === "pickup"
      ? {
          type: "PICKUP" as const,
          pickup_details: {
            schedule_type: "ASAP",
            prep_time_duration: PREP_TIME_DURATION,
            auto_complete_duration: "PT60M",
            recipient: {
              display_name: input.customerName,
              phone_number: input.customerPhone,
            },
            note: input.specialInstructions ?? "Samurai website pickup",
          },
        }
      : {
          type: "PICKUP" as const,
          pickup_details: {
            schedule_type: "ASAP",
            prep_time_duration: PREP_TIME_DURATION,
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
    order: { id: string; version: number; total_money?: { amount: number } };
  }>(
    "/v2/orders",
    {
      method: "POST",
      body: JSON.stringify({
        idempotency_key: input.orderId,
        order: {
          location_id: SQUARE_LOCATION_ID,
          reference_id: input.orderId.slice(0, 40),
          state: "OPEN",
          ticket_name: ticketName,
          source: { name: SQUARE_ORDER_SOURCE_NAME },
          line_items: lineItems,
          taxes: [
            {
              name: "Sales Tax",
              percentage: "7",
              scope: "ORDER",
            },
          ],
          fulfillments: [{ ...fulfillmentBase, state: "PROPOSED" }],
          metadata: {
            source: "orderly-website",
            payment_timing: "prepaid",
            ...(input.specialInstructions
              ? { special_instructions: input.specialInstructions }
              : {}),
          },
        },
      }),
    },
  );

  const squareOrderId = data.order.id;
  const orderVersion = data.order.version;
  const chargedTotalCents =
    data.order.total_money?.amount ?? Math.round(input.total * 100);

  let squarePaymentId: string;
  try {
    squarePaymentId = await chargeCardPayment(
      input,
      squareOrderId,
      chargedTotalCents,
    );
  } catch (err) {
    await cancelSquareOrder(squareOrderId, orderVersion);
    const message =
      err instanceof Error ? err.message : "Card payment was declined";
    throw new Error(`Payment failed: ${message}`);
  }

  await acceptOrderForKitchen(squareOrderId);

  return {
    squareOrderId,
    squareOrderVersion: orderVersion,
    squarePaymentId,
    chargedTotalCents,
  };
}

type OwnerFulfillmentSync = "ready" | "completed" | "cancelled";

const FULFILLMENT_STATE: Record<OwnerFulfillmentSync, string> = {
  ready: "PREPARED",
  completed: "COMPLETED",
  cancelled: "CANCELED",
};

/**
 * Sync owner dashboard status → Square fulfillment so paid orders leave "In progress".
 * completed → COMPLETED (order hilang dari Active di kasir Square).
 */
export async function syncSquareOrderFromOwnerStatus(
  squareOrderId: string,
  status: OwnerFulfillmentSync,
): Promise<void> {
  if (!isSquareConfigured()) return;

  const targetState = FULFILLMENT_STATE[status];
  const current = await fetchSquareOrder(squareOrderId);
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

  await squareRequest(`/v2/orders/${squareOrderId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

/** Refund card charge when DoorDash dispatch fails after payment. */
export async function refundSquarePayment(
  squarePaymentId: string,
  amountCents: number,
  orderId: string,
): Promise<void> {
  if (!SQUARE_ACCESS_TOKEN || !SQUARE_LOCATION_ID) {
    throw new Error("Square not configured for refund");
  }
  await squareRequest("/v2/refunds", {
    method: "POST",
    body: JSON.stringify({
      idempotency_key: `refund-${orderId}`,
      payment_id: squarePaymentId,
      amount_money: { amount: amountCents, currency: "USD" },
    }),
  });
}
