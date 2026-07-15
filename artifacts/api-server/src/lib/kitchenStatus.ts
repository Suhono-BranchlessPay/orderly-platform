/**
 * Kitchen / Live Orders status — shared by owner PIN + dashboard console.
 * Does not touch payment_status, charges, or refunds.
 */
import { and, desc, eq, inArray, isNotNull, not } from "drizzle-orm";
import { db, ordersTable } from "@workspace/db";
import {
  getSquareFulfillmentState,
  syncSquareOrderFromOwnerStatus,
} from "../integrations/square";
import { notifyPickupReady } from "./expoPush";
import { statusTimestampPatch } from "./orderSeams";
import { getTenantSlugById } from "./squareMenuSync";

export const KITCHEN_STATUSES = [
  "pending",
  "preparing",
  "ready",
  "completed",
  "cancelled",
] as const;

export type KitchenStatus = (typeof KITCHEN_STATUSES)[number];

const RANK: Record<KitchenStatus, number> = {
  pending: 0,
  preparing: 1,
  ready: 2,
  completed: 3,
  cancelled: 4,
};

export function isKitchenStatus(raw: unknown): raw is KitchenStatus {
  return (
    typeof raw === "string" &&
    (KITCHEN_STATUSES as readonly string[]).includes(raw)
  );
}

/** Square fulfillment → Orderly kitchen status (honest mapping). */
export function mapSquareFulfillmentToKitchen(
  state: string | null | undefined,
): KitchenStatus | null {
  switch ((state || "").toUpperCase()) {
    case "PROPOSED":
      return "pending";
    case "RESERVED":
      return "preparing";
    case "PREPARED":
      return "ready";
    case "COMPLETED":
      return "completed";
    case "CANCELED":
    case "CANCELLED":
    case "FAILED":
      return "cancelled";
    default:
      return null;
  }
}

/**
 * Only advance kitchen progress, or allow cancel.
 * Never invent a regression (e.g. ready → preparing) from Square pull.
 */
export function shouldApplyKitchenStatus(
  current: string | null | undefined,
  next: KitchenStatus,
): boolean {
  const cur = (current || "pending").toLowerCase();
  if (cur === next) return false;
  if (next === "cancelled") return cur !== "cancelled" && cur !== "completed";
  if (cur === "cancelled" || cur === "completed") return false;
  const from = RANK[cur as KitchenStatus];
  const to = RANK[next];
  if (from == null || to == null) return false;
  return to > from;
}

type ApplyResult =
  | { ok: true; previous: string; status: KitchenStatus; squareSynced: boolean }
  | { ok: false; error: string; http?: number };

export async function applyKitchenStatus(input: {
  orderId: string;
  status: KitchenStatus;
  /** When set, order must belong to this tenant. */
  tenantId?: string | null;
  tenantSlug?: string | null;
  restaurantName?: string | null;
  log?: {
    error?: (obj: unknown, msg?: string) => void;
    warn?: (obj: unknown, msg?: string) => void;
    info?: (obj: unknown, msg?: string) => void;
    debug?: (obj: unknown, msg?: string) => void;
  };
  /** When true, push Square fulfillment for ready/completed/cancelled. Default true. */
  writeSquare?: boolean;
}): Promise<ApplyResult> {
  const parts = [eq(ordersTable.id, input.orderId)];
  if (input.tenantId) parts.push(eq(ordersTable.tenantId, input.tenantId));

  const rows = await db
    .select()
    .from(ordersTable)
    .where(and(...parts))
    .limit(1);
  const order = rows[0];
  if (!order) return { ok: false, error: "Order not found", http: 404 };

  const previous = order.status || "pending";
  if (previous === input.status) {
    return { ok: true, previous, status: input.status, squareSynced: false };
  }

  await db
    .update(ordersTable)
    .set({ status: input.status, ...statusTimestampPatch(input.status) })
    .where(eq(ordersTable.id, order.id));

  let squareSynced = false;
  const writeSquare = input.writeSquare !== false;
  if (
    writeSquare &&
    order.squareOrderId &&
    (input.status === "ready" ||
      input.status === "completed" ||
      input.status === "cancelled")
  ) {
    try {
      const slug =
        input.tenantSlug ||
        (await getTenantSlugById(order.tenantId)) ||
        undefined;
      await syncSquareOrderFromOwnerStatus(
        order.squareOrderId,
        input.status,
        slug,
      );
      squareSynced = true;
    } catch (err) {
      input.log?.error?.(
        { err, squareOrderId: order.squareOrderId },
        "Square status sync failed",
      );
    }
  }

  if (input.status === "ready" && previous !== "ready") {
    void notifyPickupReady({
      orderId: order.id,
      restaurantName: input.restaurantName ?? null,
      sourceDetail: (order.sourceDetail ?? {}) as Record<string, unknown>,
      log: input.log as never,
    }).catch((err) => {
      input.log?.warn?.({ err, orderId: order.id }, "pickup ready push failed");
    });
  }

  return { ok: true, previous, status: input.status, squareSynced };
}

/**
 * Read-only pull: Square fulfillment → Orderly status for open paid orders.
 * Never touches payment fields. Does not write back to Square.
 */
export async function syncKitchenStatusFromSquare(input: {
  tenantId: string;
  limit?: number;
  log?: { warn?: (obj: unknown, msg?: string) => void };
}): Promise<{
  scanned: number;
  updated: number;
  skipped: number;
  errors: number;
  samples: Array<{ id: string; from: string; to: string; square: string }>;
}> {
  const limit = Math.min(50, Math.max(1, input.limit ?? 25));
  const slug = await getTenantSlugById(input.tenantId);
  if (!slug) {
    return { scanned: 0, updated: 0, skipped: 0, errors: 0, samples: [] };
  }

  const open = await db
    .select()
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.tenantId, input.tenantId),
        eq(ordersTable.paymentStatus, "paid"),
        isNotNull(ordersTable.squareOrderId),
        not(inArray(ordersTable.status, ["completed", "cancelled"])),
      ),
    )
    .orderBy(desc(ordersTable.createdAt))
    .limit(limit);

  let updated = 0;
  let skipped = 0;
  let errors = 0;
  const samples: Array<{ id: string; from: string; to: string; square: string }> =
    [];

  for (const order of open) {
    if (!order.squareOrderId) {
      skipped += 1;
      continue;
    }
    try {
      const sq = await getSquareFulfillmentState(order.squareOrderId, slug);
      const mapped = mapSquareFulfillmentToKitchen(sq.state);
      if (!mapped || !shouldApplyKitchenStatus(order.status, mapped)) {
        skipped += 1;
        continue;
      }
      const result = await applyKitchenStatus({
        orderId: order.id,
        status: mapped,
        tenantId: input.tenantId,
        tenantSlug: slug,
        writeSquare: false,
        log: input.log,
      });
      if (result.ok) {
        updated += 1;
        if (samples.length < 8) {
          samples.push({
            id: order.id,
            from: result.previous,
            to: result.status,
            square: sq.state || "—",
          });
        }
      } else {
        skipped += 1;
      }
    } catch (err) {
      errors += 1;
      input.log?.warn?.(
        { err, orderId: order.id, squareOrderId: order.squareOrderId },
        "Square kitchen pull failed for order",
      );
    }
  }

  return {
    scanned: open.length,
    updated,
    skipped,
    errors,
    samples,
  };
}
