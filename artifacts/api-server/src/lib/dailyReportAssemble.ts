/**
 * Build one tenant's daily report payload.
 * Anti double-count: Square = all-channel total; Orderly = online attribution subset.
 */
import { eq } from "drizzle-orm";
import { db, tenantsTable } from "@workspace/db";
import { run as aiRun } from "./ai";
import type { DailyReportLlmOutput } from "./ai/guardrails";
import {
  fetchOrderlyChannelAttribution,
  fetchOrderlyGbpDay,
  fetchOrderlyQrScans,
  fetchOrderlyReputation,
  fetchOrderlySocialPosts,
  localYesterday,
  type ChannelAttribution,
  type GbpDaySummary,
  type QrScanDaySummary,
  type ReputationBucket,
  type ReputationQuote,
  type SocialPostsDaySummary,
  type UnansweredInboxItem,
} from "./dailyReportOrderly";
import {
  buildSupplyUsageFromProducts,
  formatSupplyReminderLine,
  type SupplyUsage,
} from "./dailyReportSupply";
import { logger } from "./logger";
import {
  fetchSquareBusyHours,
  fetchSquareDailySales,
  fetchSquareProductMixForSupply,
  fetchSquareTopProducts,
  parseBusyHourRows,
  parseDailySalesRows,
  parseTopProductRows,
} from "./squareReporting";

export type DailyReportDay = {
  date: string;
  totalSalesCents: number;
  netSalesCents: number;
  orderCount: number;
  avgNetSalesCents: number;
  tipsCents: number;
  taxCents: number;
  uniqueCustomers: number;
};

export type DailyReportNarrative = {
  greeting: string;
  body: string;
  attention: string;
  ideaForToday: string;
  source: "ai" | "facts";
};

export type DailyReportPayload = {
  tenantId: string;
  tenantSlug: string;
  restaurantName: string;
  reportDate: string;
  timeZone: string;
  squareAvailable: boolean;
  squareError?: string;
  /** Yesterday (or reportDate) from Square — all channels. */
  day: DailyReportDay | null;
  /** 7-day average of Square daily totals (for "vs 7-day avg"). */
  avg7d: {
    totalSalesCents: number;
    orderCount: number;
    uniqueCustomers: number;
    avgNetSalesCents: number;
  } | null;
  trend7d: DailyReportDay[];
  topProducts: { name: string; quantity: number; netSalesCents: number }[];
  busyHours: { hour: number; totalSalesCents: number; orderCount: number }[];
  peakHour: number | null;
  /** Orderly online attribution — DO NOT add to Square totals. */
  orderlyChannels: ChannelAttribution[];
  reputation: {
    buckets: ReputationBucket;
    quotes: ReputationQuote[];
    urgent: ReputationQuote[];
    unanswered: UnansweredInboxItem[];
  };
  qrScans: QrScanDaySummary;
  socialPosts: SocialPostsDaySummary;
  gbp: GbpDaySummary;
  /** Food vs drink — blocked until Square menu categories exist. */
  foodDrinkNote: string;
  /** Level-1 supply usage from weekly product mix (facts only). */
  supplyUsage: SupplyUsage[];
  supplyReminder: string;
  narrative: DailyReportNarrative;
  insights: string[];
  disclaimer: string;
};

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function peakLabel(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

function weekdayName(isoDate: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "long",
    }).format(new Date(`${isoDate}T12:00:00Z`));
  } catch {
    return "";
  }
}

export function buildFactInsights(
  p: Pick<
    DailyReportPayload,
    | "topProducts"
    | "peakHour"
    | "day"
    | "avg7d"
    | "orderlyChannels"
    | "supplyReminder"
    | "restaurantName"
    | "reportDate"
    | "timeZone"
  >,
): string[] {
  const out: string[] = [];
  if (p.peakHour != null) {
    out.push(
      `Busiest hour (last 7 days): around ${peakLabel(p.peakHour)}. Consider staffing and posting 1–2 hours before that window.`,
    );
  }
  if (p.topProducts[0]) {
    const top = p.topProducts[0];
    out.push(
      `Top seller (last 7 days): ${top.name} — ${top.quantity} sold, ${dollars(top.netSalesCents)} net. Promote what already sells.`,
    );
  }
  if (p.day && p.avg7d && p.avg7d.totalSalesCents > 0) {
    const pct = Math.round(
      ((p.day.totalSalesCents - p.avg7d.totalSalesCents) / p.avg7d.totalSalesCents) *
        100,
    );
    const dir = pct >= 0 ? "above" : "below";
    out.push(
      `Yesterday's total sales were ${Math.abs(pct)}% ${dir} the 7-day average (weekday/weekend mix varies — this is not a forecast).`,
    );
  }
  const google = p.orderlyChannels.find((c) => c.src.includes("google"));
  if (google && google.orders > 0) {
    out.push(
      `Orderly tracked ${google.orders} paid online order(s) from Google (${dollars(google.totalCents)}) — marketplace-fee free. This is a subset of Square totals, not extra revenue.`,
    );
  }
  if (p.supplyReminder) out.push(p.supplyReminder);
  return out.slice(0, 3);
}

function buildFactNarrative(
  p: Omit<DailyReportPayload, "narrative" | "insights" | "disclaimer">,
): DailyReportNarrative {
  const dayName = weekdayName(p.reportDate, p.timeZone) || "yesterday";
  const parts: string[] = [];
  if (p.day) {
    let vs = "";
    if (p.avg7d && p.avg7d.totalSalesCents > 0) {
      const pct = Math.round(
        ((p.day.totalSalesCents - p.avg7d.totalSalesCents) /
          p.avg7d.totalSalesCents) *
          100,
      );
      vs =
        pct === 0
          ? " Right on your 7-day average."
          : pct > 0
            ? ` About ${pct}% above your 7-day average — solid for a ${dayName}.`
            : ` About ${Math.abs(pct)}% below your 7-day average — often normal for a ${dayName}.`;
    }
    parts.push(
      `Yesterday you rang ${dollars(p.day.totalSalesCents)} across ${p.day.orderCount} orders (all channels via Square).${vs}`,
    );
  } else if (!p.squareAvailable) {
    parts.push(
      `Square totals were unavailable for ${p.reportDate}. Below is Orderly online attribution and inbox only — incomplete picture of the full day.`,
    );
  }

  if (p.topProducts[0]) {
    const top = p.topProducts[0];
    parts.push(
      `Your standout seller this week: ${top.name} (${top.quantity} sold, ${dollars(top.netSalesCents)} net).`,
    );
  }

  if (p.peakHour != null) {
    parts.push(
      `Peak traffic sits around ${peakLabel(p.peakHour)} — staff ahead of that rush and schedule posts 1–2 hours earlier.`,
    );
  }

  const google = p.orderlyChannels.find((c) => c.src.includes("google"));
  if (google && (google.orders > 0 || google.totalCents > 0)) {
    parts.push(
      `Online via Orderly: Google contributed ${google.orders} paid order(s) (${dollars(google.totalCents)}) with no marketplace fee — already inside the Square total, not extra.`,
    );
  }

  if (p.reputation.quotes[0]) {
    parts.push(`A guest note: “${p.reputation.quotes[0].excerpt}”`);
  }

  let idea = "";
  if (p.topProducts[0] && p.peakHour != null) {
    idea = `Promote ${p.topProducts[0].name} with a post about 1–2 hours before ${peakLabel(p.peakHour)}.`;
  } else if (p.topProducts[0]) {
    idea = `Lean into what already sells — feature ${p.topProducts[0].name} in today’s post.`;
  } else {
    idea = "Review unanswered inbox items first, then schedule one post before your usual rush.";
  }

  const attentionParts: string[] = [];
  if (p.reputation.urgent.length) {
    attentionParts.push(
      `${p.reputation.urgent.length} complaint/health item(s) need a look.`,
    );
  }
  if (p.reputation.unanswered.length) {
    attentionParts.push(
      `${p.reputation.unanswered.length} inbox message(s) still unanswered.`,
    );
  }

  return {
    greeting: `Good morning — here’s ${p.restaurantName} for ${p.reportDate}.`,
    body: parts.join("\n\n"),
    attention: attentionParts.join(" "),
    ideaForToday: idea,
    source: "facts",
  };
}

function factsForAi(
  p: Omit<DailyReportPayload, "narrative" | "insights" | "disclaimer">,
): Record<string, unknown> {
  return {
    restaurant_name: p.restaurantName,
    report_date: p.reportDate,
    weekday: weekdayName(p.reportDate, p.timeZone),
    time_zone: p.timeZone,
    square_available: p.squareAvailable,
    sales_yesterday: p.day
      ? {
          total_sales: dollars(p.day.totalSalesCents),
          orders: p.day.orderCount,
          customers: p.day.uniqueCustomers,
          avg_ticket: dollars(p.day.avgNetSalesCents),
          tips: dollars(p.day.tipsCents),
          tax: dollars(p.day.taxCents),
        }
      : null,
    vs_7day_avg: p.day && p.avg7d
      ? {
          total_sales_pct:
            p.avg7d.totalSalesCents > 0
              ? Math.round(
                  ((p.day.totalSalesCents - p.avg7d.totalSalesCents) /
                    p.avg7d.totalSalesCents) *
                    100,
                )
              : null,
          note: "Compare to 7-day average, not yesterday — weekday/weekend varies.",
        }
      : null,
    peak_hour_7d: p.peakHour,
    top_products_7d: p.topProducts.slice(0, 5).map((t) => ({
      name: t.name,
      qty: t.quantity,
      net: dollars(t.netSalesCents),
    })),
    orderly_online_attribution_subset: p.orderlyChannels.map((c) => ({
      src: c.src,
      orders: c.orders,
      dollars: dollars(c.totalCents),
    })),
    reputation: {
      buckets: p.reputation.buckets,
      urgent: p.reputation.urgent.map((u) => ({
        classification: u.classification,
        platform: u.platform,
        excerpt: u.excerpt,
      })),
      praise_quotes: p.reputation.quotes.map((q) => q.excerpt),
      unanswered: p.reputation.unanswered.map((u) => ({
        classification: u.classification,
        status: u.status,
        excerpt: u.excerpt,
      })),
    },
    qr_scans: {
      human: p.qrScans.human,
      bot: p.qrScans.bot,
      top_src: p.qrScans.bySrc.slice(0, 5),
    },
    social_posts: p.socialPosts,
    google_reviews: p.gbp,
    food_drink_note: p.foodDrinkNote,
    supply_reminder: p.supplyReminder || null,
    anti_double_count:
      "Square totals include all channels. Orderly channel dollars are a subset — never add them to Square.",
  };
}

async function generateNarrative(
  base: Omit<DailyReportPayload, "narrative" | "insights" | "disclaimer">,
): Promise<{ narrative: DailyReportNarrative; insights: string[] }> {
  const factInsights = buildFactInsights(base);
  const fallback = buildFactNarrative(base);

  try {
    const result = await aiRun({
      task: "daily_report",
      tenantId: base.tenantId,
      input: { facts: factsForAi(base) },
      opts: { maxTokens: 900, temperature: 0.4, responseFormat: "json" },
    });
    if (result.ok && result.output && typeof result.output === "object") {
      const out = result.output as DailyReportLlmOutput;
      return {
        narrative: {
          greeting: out.greeting || fallback.greeting,
          body: out.narrative,
          attention: out.attention || fallback.attention,
          ideaForToday: out.ideaForToday || fallback.ideaForToday,
          source: "ai",
        },
        insights: out.insights.length ? out.insights : factInsights,
      };
    }
    logger.warn(
      { tenantSlug: base.tenantSlug, error: result.error },
      "daily report AI narrative unavailable — using fact narrative",
    );
  } catch (err) {
    logger.warn({ err, tenantSlug: base.tenantSlug }, "daily report AI failed");
  }

  return { narrative: fallback, insights: factInsights };
}

export async function assembleDailyReport(input: {
  tenantSlug: string;
  timeZone: string;
  /** Defaults to yesterday in tenant TZ. */
  reportDate?: string;
}): Promise<DailyReportPayload | null> {
  const [tenant] = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, input.tenantSlug))
    .limit(1);
  if (!tenant) {
    logger.warn({ slug: input.tenantSlug }, "daily report: tenant not found");
    return null;
  }

  const reportDate = input.reportDate ?? localYesterday(input.timeZone);

  const [salesRes, productsRes, hoursRes, supplyMixRes] = await Promise.all([
    fetchSquareDailySales(input.tenantSlug),
    fetchSquareTopProducts(input.tenantSlug, 10),
    fetchSquareBusyHours(input.tenantSlug),
    fetchSquareProductMixForSupply(input.tenantSlug),
  ]);

  let squareAvailable = salesRes.ok;
  let squareError: string | undefined;
  if (!salesRes.ok) {
    squareError = salesRes.error;
    squareAvailable = false;
  }

  const trend7d = salesRes.ok ? parseDailySalesRows(salesRes.data) : [];
  const day =
    trend7d.find((d) => d.date === reportDate) ??
    trend7d[trend7d.length - 1] ??
    null;

  let avg7d: DailyReportPayload["avg7d"] = null;
  if (trend7d.length) {
    const n = trend7d.length;
    avg7d = {
      totalSalesCents: Math.round(
        trend7d.reduce((s, d) => s + d.totalSalesCents, 0) / n,
      ),
      orderCount: Math.round(
        trend7d.reduce((s, d) => s + d.orderCount, 0) / n,
      ),
      uniqueCustomers: Math.round(
        trend7d.reduce((s, d) => s + d.uniqueCustomers, 0) / n,
      ),
      avgNetSalesCents: Math.round(
        trend7d.reduce((s, d) => s + d.avgNetSalesCents, 0) / n,
      ),
    };
  }

  const topProducts = productsRes.ok
    ? parseTopProductRows(productsRes.data).slice(0, 5)
    : [];
  const busyHours = hoursRes.ok ? parseBusyHourRows(hoursRes.data) : [];
  let peakHour: number | null = null;
  if (busyHours.length) {
    peakHour = busyHours.reduce((best, h) =>
      h.orderCount > best.orderCount ? h : best,
    ).hour;
  }

  const supplyProducts = supplyMixRes.ok
    ? parseTopProductRows(supplyMixRes.data)
    : productsRes.ok
      ? parseTopProductRows(productsRes.data)
      : [];
  const supplyUsage = buildSupplyUsageFromProducts(supplyProducts);
  const supplyReminder = formatSupplyReminderLine(supplyUsage);

  const [orderlyChannels, reputation, qrScans, socialPosts, gbp] =
    await Promise.all([
      fetchOrderlyChannelAttribution({
        tenantId: tenant.id,
        localDate: reportDate,
        timeZone: input.timeZone,
      }),
      fetchOrderlyReputation({
        tenantId: tenant.id,
        localDate: reportDate,
        timeZone: input.timeZone,
      }),
      fetchOrderlyQrScans({
        tenantId: tenant.id,
        localDate: reportDate,
        timeZone: input.timeZone,
      }),
      fetchOrderlySocialPosts({
        tenantId: tenant.id,
        localDate: reportDate,
        timeZone: input.timeZone,
      }),
      fetchOrderlyGbpDay({
        tenantId: tenant.id,
        localDate: reportDate,
        timeZone: input.timeZone,
      }),
    ]);

  const base = {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    restaurantName: tenant.name,
    reportDate,
    timeZone: input.timeZone,
    squareAvailable,
    squareError,
    day,
    avg7d,
    trend7d,
    topProducts,
    busyHours,
    peakHour,
    orderlyChannels,
    reputation,
    qrScans,
    socialPosts,
    gbp,
    foodDrinkNote:
      "Food vs drink breakdown needs Square menu categories (most items are Uncategorized today).",
    supplyUsage,
    supplyReminder,
  };

  const { narrative, insights } = await generateNarrative(base);

  return {
    ...base,
    narrative,
    insights,
    disclaimer:
      "Totals = Square (all channels). Online channel $ = Orderly attribution only — never added to Square. Narrative & insights use actual data only; no forecasts. Supply reminder = usage from sales (Level 1), not inventory prediction.",
  };
}
