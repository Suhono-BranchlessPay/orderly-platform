/**
 * Square POS — prepaid web orders, credentials resolved per tenant.
 * Flow: CreateOrder → Charge card → Accept kitchen (RESERVED).
 */

import type { StructuredAddress } from "../lib/address";
import {
  SQUARE_ORDER_SOURCE_NAME,
  tenantSecret,
} from "../lib/tenant";

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
  specialInstructions?: string | null;
  squarePaymentSourceId: string;
  /** Tenant slug for secret lookup + kitchen note branding. */
  tenantSlug: string;
  tenantName?: string;
}

export interface SquareOrderResult {
  squareOrderId: string;
  squareOrderVersion: number;
  squarePaymentId: string;
  chargedTotalCents: number;
}

const SQUARE_API_VERSION = "2024-11-20";
const PREP_TIME_DURATION = "PT20M";

type SquareCreds = {
  accessToken: string;
  locationId: string;
  applicationId: string;
  environment: string;
  baseUrl: string;
};

type CatalogVariation = { id: string; version: number };
const catalogBySku = new Map<string, CatalogVariation>();

function resolveSquareCreds(slug: string): SquareCreds | null {
  const accessToken = tenantSecret(slug, "SQUARE_ACCESS_TOKEN");
  const locationId = tenantSecret(slug, "SQUARE_LOCATION_ID");
  const applicationId = tenantSecret(slug, "SQUARE_APPLICATION_ID");
  if (!accessToken || !locationId || !applicationId) return null;
  const environment =
    tenantSecret(slug, "SQUARE_ENVIRONMENT") ??
    process.env.SQUARE_ENVIRONMENT ??
    "sandbox";
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

export function isSquareConfigured(slug?: string): boolean {
  const s = slug ?? process.env.TENANT_ID?.trim() ?? "samurai";
  const c = resolveSquareCreds(s);
  return Boolean(c?.accessToken && c?.locationId);
}

export function isSquareWebPaymentsConfigured(slug?: string): boolean {
  return resolveSquareCreds(slug ?? process.env.TENANT_ID?.trim() ?? "samurai") !== null;
}

export function getSquarePublicConfig(slug?: string):
  | { enabled: false }
  | {
      enabled: true;
      applicationId: string;
      locationId: string;
      environment: string;
    } {
  const c = resolveSquareCreds(slug ?? process.env.TENANT_ID?.trim() ?? "samurai");
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
  const creds = resolveSquareCreds(input.tenantSlug);
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

  // DoorDash Drive = last mile; Square uses PICKUP so POS + kitchen print work.
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
            note: input.specialInstructions ?? `${brand} website pickup`,
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
            percentage: "7",
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
  const creds = resolveSquareCreds(slug);
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

export async function refundSquarePayment(
  squarePaymentId: string,
  amountCents: number,
  orderId: string,
  tenantSlug?: string,
): Promise<void> {
  const slug = tenantSlug ?? process.env.TENANT_ID?.trim() ?? "samurai";
  const creds = resolveSquareCreds(slug);
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
