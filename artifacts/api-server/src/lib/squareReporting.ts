/**
 * Square Reporting API (Cube) — read-only. Never touches Payments/Orders write.
 * Docs: POST https://connect.squareup.com/reporting/v1/load
 */
import { getSquareCredsForTenantSlug } from "../integrations/square";
import { logger } from "./logger";

export type SquareReportingRow = Record<string, string | number | null | undefined>;

export type SquareReportingLoadResult = {
  ok: true;
  data: SquareReportingRow[];
} | {
  ok: false;
  error: string;
  status?: number;
};

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Parse Square money fields that may be dollars (string/number). Return cents. */
export function moneyToCents(v: unknown): number {
  return Math.round(num(v) * 100);
}

export async function squareReportingLoad(
  tenantSlug: string,
  query: Record<string, unknown>,
): Promise<SquareReportingLoadResult> {
  const creds = await getSquareCredsForTenantSlug(tenantSlug);
  if (!creds?.accessToken) {
    return { ok: false, error: "Square credentials not configured for tenant" };
  }

  const url = `${creds.baseUrl}/reporting/v1/load`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${creds.accessToken}`,
        // Reporting API may ignore Square-Version; keep for consistency.
        "Square-Version": "2024-11-20",
      },
      body: JSON.stringify({ query }),
    });
    const text = await res.text();
    if (!res.ok) {
      logger.warn(
        { tenantSlug, status: res.status, body: text.slice(0, 400) },
        "Square reporting load failed",
      );
      return {
        ok: false,
        error: `Square reporting ${res.status}: ${text.slice(0, 300)}`,
        status: res.status,
      };
    }
    const json = text ? (JSON.parse(text) as { data?: SquareReportingRow[] }) : {};
    return { ok: true, data: Array.isArray(json.data) ? json.data : [] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/** Query A — daily sales summary (last 7 days). */
export async function fetchSquareDailySales(tenantSlug: string) {
  return squareReportingLoad(tenantSlug, {
    measures: [
      "Sales.total_sales_amount",
      "Sales.net_sales",
      "Sales.order_count",
      "Sales.avg_net_sales",
      "Sales.tips_amount",
      "Sales.sales_tax_amount",
      "Sales.unique_customers",
    ],
    dimensions: ["Sales.local_date"],
    timeDimensions: [
      {
        dimension: "Sales.reporting_day",
        dateRange: "last 7 days",
        granularity: "day",
      },
    ],
    order: [["Sales.local_date", "asc"]],
    limit: 100,
  });
}

/** Query B — top products by net sales (last 7 days). */
export async function fetchSquareTopProducts(
  tenantSlug: string,
  limit = 10,
) {
  const primary = await squareReportingLoad(tenantSlug, {
    measures: [
      "ProductMixReport.items_sold_quantity",
      "ProductMixReport.net_sales",
    ],
    dimensions: ["ProductMixReport.item_name"],
    timeDimensions: [
      {
        dimension: "ProductMixReport.reporting_day",
        dateRange: "last 7 days",
      },
    ],
    order: [["ProductMixReport.net_sales", "desc"]],
    limit,
  });
  if (primary.ok) return primary;

  // Fallback view name if ProductMixReport is unavailable for this merchant.
  return squareReportingLoad(tenantSlug, {
    measures: ["ItemSales.items_sold_quantity", "ItemSales.net_sales"],
    dimensions: ["ItemSales.item_name"],
    timeDimensions: [
      {
        dimension: "ItemSales.local_reporting_timestamp",
        dateRange: "last 7 days",
      },
    ],
    order: [["ItemSales.net_sales", "desc"]],
    limit,
  });
}

/**
 * Broader product mix for supply Level-1 (usage from sales).
 * Same cube as Query B, higher limit — still read-only.
 */
export async function fetchSquareProductMixForSupply(tenantSlug: string) {
  return fetchSquareTopProducts(tenantSlug, 100);
}

/** Query C — sales by local hour (last 7 days). */
export async function fetchSquareBusyHours(tenantSlug: string) {
  return squareReportingLoad(tenantSlug, {
    measures: ["Sales.total_sales_amount", "Sales.order_count"],
    dimensions: ["Sales.local_hour"],
    timeDimensions: [
      {
        dimension: "Sales.reporting_day",
        dateRange: "last 7 days",
      },
    ],
    order: [["Sales.local_hour", "asc"]],
    limit: 24,
  });
}

export function parseDailySalesRows(rows: SquareReportingRow[]) {
  return rows.map((r) => {
    const dateRaw =
      r["Sales.local_date"] ??
      r["Sales.reporting_day"] ??
      r["Sales.local_reporting_timestamp"] ??
      "";
    const date = String(dateRaw).slice(0, 10);
    return {
      date,
      totalSalesCents: moneyToCents(r["Sales.total_sales_amount"]),
      netSalesCents: moneyToCents(r["Sales.net_sales"]),
      orderCount: Math.round(num(r["Sales.order_count"])),
      avgNetSalesCents: moneyToCents(r["Sales.avg_net_sales"]),
      tipsCents: moneyToCents(r["Sales.tips_amount"]),
      taxCents: moneyToCents(r["Sales.sales_tax_amount"]),
      uniqueCustomers: Math.round(num(r["Sales.unique_customers"])),
    };
  }).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date));
}

export function parseTopProductRows(rows: SquareReportingRow[]) {
  return rows.map((r) => {
    const name = String(
      r["ProductMixReport.item_name"] ?? r["ItemSales.item_name"] ?? "Item",
    );
    const qty = num(
      r["ProductMixReport.items_sold_quantity"] ??
        r["ItemSales.items_sold_quantity"],
    );
    const net = moneyToCents(
      r["ProductMixReport.net_sales"] ?? r["ItemSales.net_sales"],
    );
    return { name, quantity: qty, netSalesCents: net };
  });
}

export function parseBusyHourRows(rows: SquareReportingRow[]) {
  return rows.map((r) => {
    const hour = Math.round(num(r["Sales.local_hour"]));
    return {
      hour,
      totalSalesCents: moneyToCents(r["Sales.total_sales_amount"]),
      orderCount: Math.round(num(r["Sales.order_count"])),
    };
  });
}
