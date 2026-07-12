import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  ordersTable,
  orderLinesTable,
  menuItemsTable,
  tenantsTable,
} from "@workspace/db";
import { defaultExplorerUrl } from "./bridgeWebhook";

export type ReportRange = "today" | "7d" | "28d" | "30d";

export function rangeToDates(range: ReportRange): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date(to);
  if (range === "today") {
    from.setHours(0, 0, 0, 0);
  } else {
    const days = range === "7d" ? 7 : range === "28d" ? 28 : 30;
    from.setDate(from.getDate() - (days - 1));
    from.setHours(0, 0, 0, 0);
  }
  return { from, to };
}

function paidTenantFilter(tenantId: string | null, from: Date, to: Date) {
  const parts = [
    eq(ordersTable.paymentStatus, "paid"),
    gte(ordersTable.createdAt, from),
    lte(ordersTable.createdAt, to),
  ];
  if (tenantId) parts.push(eq(ordersTable.tenantId, tenantId));
  return and(...parts);
}

export async function buildReportSummary(input: {
  tenantId: string | null;
  range: ReportRange;
}) {
  const { from, to } = rangeToDates(input.range);
  const where = paidTenantFilter(input.tenantId, from, to);

  const orders = await db.select().from(ordersTable).where(where);

  const totalOrders = orders.length;
  const subtotalCents = orders.reduce((s, o) => s + (o.subtotalCents || 0), 0);
  const taxCents = orders.reduce((s, o) => s + (o.taxCents || 0), 0);
  const tipCents = orders.reduce((s, o) => s + (o.tipCents || 0), 0);
  const totalCents = orders.reduce((s, o) => s + (o.totalCents || 0), 0);
  const aovCents = totalOrders > 0 ? Math.round(subtotalCents / totalOrders) : 0;

  const anchored = orders.filter((o) => Boolean(o.chainTxHash)).length;
  const anchorQueued = orders.filter(
    (o) => o.bpAnchorStatus && !o.chainTxHash,
  ).length;

  return {
    range: input.range,
    from: from.toISOString(),
    to: to.toISOString(),
    tenant_id: input.tenantId,
    totals: {
      orders: totalOrders,
      sales_subtotal_cents: subtotalCents,
      tax_cents: taxCents,
      tip_cents: tipCents,
      total_cents: totalCents,
      average_order_value_cents: aovCents,
    },
    anchors: {
      with_chain_tx: anchored,
      pending_or_queued: anchorQueued,
      rate:
        totalOrders > 0 ? Math.round((anchored / totalOrders) * 1000) / 10 : 0,
    },
    coming_soon: {
      payouts: "Requires Stripe Connect (legal hold)",
      platform_service_fee: "Not active until Stripe Connect",
      third_party_savings: "Needs marketplace comparison data",
    },
  };
}

export async function buildItemSales(input: {
  tenantId: string | null;
  range: ReportRange;
}) {
  const { from, to } = rangeToDates(input.range);
  const where = paidTenantFilter(input.tenantId, from, to);

  const orders = await db.select({ id: ordersTable.id }).from(ordersTable).where(where);
  const orderIds = new Set(orders.map((o) => o.id));
  if (orderIds.size === 0) {
    return { items: [], categories: [] };
  }

  const orderIdList = [...orderIds];
  const lines = await db
    .select()
    .from(orderLinesTable)
    .where(inArray(orderLinesTable.orderId, orderIdList));

  const itemMap = new Map<
    string,
    { name: string; qty: number; sales_cents: number; category: string }
  >();
  const catMap = new Map<string, { qty: number; sales_cents: number }>();

  const menuFilter = input.tenantId
    ? eq(menuItemsTable.tenantId, input.tenantId)
    : undefined;
  const menuRows = menuFilter
    ? await db.select().from(menuItemsTable).where(menuFilter)
    : await db.select().from(menuItemsTable);
  const menuById = new Map(menuRows.map((m) => [m.id, m]));

  for (const line of lines) {
    const menu = menuById.get(line.menuItemId);
    const category = menu?.category || "Uncategorized";
    const sales = Math.round(line.subtotal * 100);
    const prev = itemMap.get(line.menuItemId) || {
      name: line.menuItemName,
      qty: 0,
      sales_cents: 0,
      category,
    };
    prev.qty += line.quantity;
    prev.sales_cents += sales;
    itemMap.set(line.menuItemId, prev);

    const cat = catMap.get(category) || { qty: 0, sales_cents: 0 };
    cat.qty += line.quantity;
    cat.sales_cents += sales;
    catMap.set(category, cat);
  }

  const items = [...itemMap.entries()]
    .map(([menu_item_id, v]) => ({ menu_item_id, ...v }))
    .sort((a, b) => b.sales_cents - a.sales_cents);

  const categories = [...catMap.entries()]
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.sales_cents - a.sales_cents);

  return { items, categories };
}

export async function buildOrdersByHourDay(input: {
  tenantId: string | null;
  range: ReportRange;
}) {
  const { from, to } = rangeToDates(input.range);
  const where = paidTenantFilter(input.tenantId, from, to);
  const orders = await db.select().from(ordersTable).where(where);

  const byHour = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    orders: 0,
    sales_cents: 0,
  }));
  const byDow = Array.from({ length: 7 }, (_, dow) => ({
    dow,
    label: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dow],
    orders: 0,
    sales_cents: 0,
  }));

  for (const o of orders) {
    if (!o.createdAt) continue;
    const d = new Date(o.createdAt);
    const hour = d.getHours();
    const dow = d.getDay();
    byHour[hour].orders += 1;
    byHour[hour].sales_cents += o.totalCents || 0;
    byDow[dow].orders += 1;
    byDow[dow].sales_cents += o.totalCents || 0;
  }

  return { by_hour: byHour, by_day_of_week: byDow };
}

export async function buildAnchorReport(input: {
  tenantId: string | null;
  range: ReportRange;
}) {
  const { from, to } = rangeToDates(input.range);
  const where = paidTenantFilter(input.tenantId, from, to);
  const orders = await db
    .select()
    .from(ordersTable)
    .where(where)
    .orderBy(desc(ordersTable.createdAt))
    .limit(200);

  return {
    orders: orders.map((o) => ({
      id: o.id,
      tenant_id: o.tenantId,
      total_cents: o.totalCents,
      created_at: o.createdAt?.toISOString() ?? null,
      bp_anchor_status: o.bpAnchorStatus,
      chain_tx_hash: o.chainTxHash,
      explorer_url: o.bpExplorerUrl ?? defaultExplorerUrl(o.chainTxHash),
    })),
  };
}

export async function listTenantsForMaster() {
  return db
    .select({
      id: tenantsTable.id,
      slug: tenantsTable.slug,
      name: tenantsTable.name,
      city: tenantsTable.city,
      state: tenantsTable.state,
      status: tenantsTable.status,
    })
    .from(tenantsTable)
    .orderBy(tenantsTable.name);
}

export function ordersToCsv(
  rows: Array<{
    id: string;
    tenant_id: string;
    created_at: string | null;
    order_type: string;
    payment_status: string;
    subtotal_cents: number;
    tax_cents: number;
    tip_cents: number;
    total_cents: number;
    chain_tx_hash: string | null;
    explorer_url: string | null;
  }>,
): string {
  const header = [
    "order_id",
    "tenant_id",
    "created_at",
    "order_type",
    "payment_status",
    "subtotal_cents",
    "tax_cents",
    "tip_cents",
    "total_cents",
    "chain_tx_hash",
    "explorer_url",
  ];
  const escape = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.tenant_id,
        r.created_at,
        r.order_type,
        r.payment_status,
        r.subtotal_cents,
        r.tax_cents,
        r.tip_cents,
        r.total_cents,
        r.chain_tx_hash,
        r.explorer_url,
      ]
        .map(escape)
        .join(","),
    );
  }
  return lines.join("\n");
}

export async function buildExportRows(input: {
  tenantId: string | null;
  range: ReportRange;
}) {
  const { from, to } = rangeToDates(input.range);
  const where = paidTenantFilter(input.tenantId, from, to);
  const orders = await db
    .select()
    .from(ordersTable)
    .where(where)
    .orderBy(desc(ordersTable.createdAt));

  return orders.map((o) => ({
    id: o.id,
    tenant_id: o.tenantId,
    created_at: o.createdAt?.toISOString() ?? null,
    order_type: o.orderType,
    payment_status: o.paymentStatus,
    subtotal_cents: o.subtotalCents,
    tax_cents: o.taxCents,
    tip_cents: o.tipCents,
    total_cents: o.totalCents,
    chain_tx_hash: o.chainTxHash,
    explorer_url: o.bpExplorerUrl ?? defaultExplorerUrl(o.chainTxHash),
  }));
}
