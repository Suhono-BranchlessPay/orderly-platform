import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  customersTable,
  ordersTable,
  orderLinesTable,
} from "@workspace/db";

export type CustomerSegment = "lead" | "new" | "regular" | "vip" | "churn_risk";

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

export function segmentCustomer(input: {
  orderCount: number;
  totalSpentCents: number;
  lastOrderAt: Date | null;
  now?: Date;
}): CustomerSegment {
  const now = input.now ?? new Date();
  const last = input.lastOrderAt;
  const daysSince = last ? daysBetween(last, now) : 9999;

  // Consent/account capture without any paid order — not a real customer yet.
  if (input.orderCount <= 0) return "lead";
  if (input.orderCount <= 1) return "new";
  if (daysSince >= 45) return "churn_risk";
  if (input.orderCount >= 8 || input.totalSpentCents >= 25000) return "vip";
  return "regular";
}

export async function buildCustomerIntelligence(input: {
  tenantId: string | null;
  limit?: number;
}) {
  const limit = Math.min(input.limit ?? 100, 500);
  const customers = input.tenantId
    ? await db
        .select()
        .from(customersTable)
        .where(eq(customersTable.tenantId, input.tenantId))
        .orderBy(desc(customersTable.totalSpentCents))
        .limit(limit)
    : await db
        .select()
        .from(customersTable)
        .orderBy(desc(customersTable.totalSpentCents))
        .limit(limit);

  // Favorite items: from paid orders linked by phone/email is hard;
  // use customerId on orders when present.
  const customerIds = customers.map((c) => c.id);
  const favoriteByCustomer = new Map<
    string,
    { menu_item_id: string; name: string; qty: number }
  >();

  if (customerIds.length > 0) {
    const paidOrders = await db
      .select({
        id: ordersTable.id,
        customerId: ordersTable.customerId,
      })
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.paymentStatus, "paid"),
          ...(input.tenantId
            ? [eq(ordersTable.tenantId, input.tenantId)]
            : []),
        ),
      );

    const orderToCustomer = new Map<string, string>();
    for (const o of paidOrders) {
      if (o.customerId && customerIds.includes(o.customerId)) {
        orderToCustomer.set(o.id, o.customerId);
      }
    }

    const orderIds = [...orderToCustomer.keys()];
    if (orderIds.length > 0) {
      const lines = await db
        .select()
        .from(orderLinesTable)
        .where(inArray(orderLinesTable.orderId, orderIds));

      const tally = new Map<string, Map<string, { name: string; qty: number }>>();
      for (const line of lines) {
        const cid = orderToCustomer.get(line.orderId);
        if (!cid) continue;
        const per = tally.get(cid) ?? new Map();
        const prev = per.get(line.menuItemId) ?? {
          name: line.menuItemName,
          qty: 0,
        };
        prev.qty += line.quantity;
        per.set(line.menuItemId, prev);
        tally.set(cid, per);
      }

      for (const [cid, per] of tally) {
        let best: { menu_item_id: string; name: string; qty: number } | null =
          null;
        for (const [menuItemId, v] of per) {
          if (!best || v.qty > best.qty) {
            best = { menu_item_id: menuItemId, name: v.name, qty: v.qty };
          }
        }
        if (best) favoriteByCustomer.set(cid, best);
      }
    }
  }

  const profiles = customers.map((c) => {
    const aovCents =
      c.orderCount > 0 ? Math.round(c.totalSpentCents / c.orderCount) : 0;
    const segment = segmentCustomer({
      orderCount: c.orderCount,
      totalSpentCents: c.totalSpentCents,
      lastOrderAt: c.lastOrderAt,
    });
    return {
      id: c.id,
      tenant_id: c.tenantId,
      name: [c.firstName, c.lastName].filter(Boolean).join(" "),
      phone: c.phone,
      email: c.email,
      order_count: c.orderCount,
      total_spent_cents: c.totalSpentCents,
      aov_cents: aovCents,
      ltv_cents: c.totalSpentCents,
      first_order_at: c.firstOrderAt?.toISOString() ?? null,
      last_order_at: c.lastOrderAt?.toISOString() ?? null,
      segment,
      favorite_item: favoriteByCustomer.get(c.id) ?? null,
      marketing_consent_email: c.marketingConsentEmail,
      marketing_consent_sms: c.marketingConsentSms,
    };
  });

  const segments = {
    lead: profiles.filter((p) => p.segment === "lead").length,
    new: profiles.filter((p) => p.segment === "new").length,
    regular: profiles.filter((p) => p.segment === "regular").length,
    vip: profiles.filter((p) => p.segment === "vip").length,
    churn_risk: profiles.filter((p) => p.segment === "churn_risk").length,
  };

  const withOrders = profiles.filter((p) => p.order_count > 0);
  const newCustomers = withOrders.filter((p) => p.order_count === 1).length;
  const returningCustomers = withOrders.filter((p) => p.order_count >= 2).length;
  const repeatRate =
    withOrders.length > 0
      ? Math.round((returningCustomers / withOrders.length) * 1000) / 10
      : 0;

  return {
    tenant_id: input.tenantId,
    note: "Insight only — no marketing send (C5 hold).",
    segments,
    retention: {
      new_customers: newCustomers,
      returning_customers: returningCustomers,
      repeat_rate_pct: repeatRate,
      vip_customers: segments.vip,
    },
    customers: profiles,
  };
}
