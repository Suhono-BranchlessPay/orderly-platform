/**
 * Orderly-side slices for the daily report (closed-loop + reputation).
 * These are SUBSETS — never add them into Square totals (anti double-count).
 */
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import {
  db,
  contentCalendarTable,
  gbpInboxTable,
  ordersTable,
  qrScansTable,
  socialInboxTable,
  socialPostsTable,
} from "@workspace/db";
import { isLikelyBotUserAgent } from "./qrScanBotFilter";
import { isOpsTestOrderDetail, isOpsTestSrc } from "./opsTestSrc";

export type ChannelAttribution = {
  src: string;
  orders: number;
  totalCents: number;
};

export type ReputationBucket = {
  praise: number;
  question: number;
  complaint: number;
  allergy_health: number;
  menu_suggestion: number;
  other: number;
};

export type ReputationQuote = {
  classification: string;
  excerpt: string;
  platform: string;
  status?: string;
};

export type QrScanDaySummary = {
  total: number;
  human: number;
  bot: number;
  /** Human+bot rows with test/probe src omitted from bySrc (same as dashboard). */
  hiddenTestSrcRows: number;
  bySrc: { src: string; human: number; bot: number }[];
};

export type SocialPostHighlight = {
  itemName: string;
  platform: string;
  srcTag: string;
  clicks: number;
  /** Paid orders with this src (any menu items) — primary closed-loop. */
  orders: number;
  /** Subset: orders with this src that include the promoted item name. */
  ordersPromotedItem: number;
  revenueCents: number;
};

export type SocialPostsDaySummary = {
  drafted: number;
  pendingApproval: number;
  posted: number;
  /** Posted rows with cached closed-loop metrics (facts only). */
  highlights: SocialPostHighlight[];
  /** High clicks + zero paid orders (recent posts) — fact anomalies for insight. */
  clickAnomalies: SocialPostHighlight[];
};

/** Content calendar posts with multi-day closed-loop (not same-day only). */
export type ContentCalendarDaySummary = {
  draft: number;
  approved: number;
  postedInWindow: number;
  /** Posted in lookback window with cached metrics (facts only). */
  highlights: SocialPostHighlight[];
  lookbackDays: number;
};

export type UnansweredInboxItem = {
  classification: string;
  excerpt: string;
  platform: string;
  status: string;
};

export type GbpDaySummary = {
  available: boolean;
  note?: string;
  reviews: number;
  questions: number;
  unanswered: number;
  quotes: { stars: number | null; excerpt: string; kind: string }[];
};

function dayBoundsUtc(localDate: string, timeZone: string): { from: Date; to: Date } {
  const start = wallTimeToUtc(`${localDate}T00:00:00`, timeZone);
  const end = wallTimeToUtc(`${localDate}T23:59:59.999`, timeZone);
  return { from: start, to: end };
}

function wallTimeToUtc(localIso: string, timeZone: string): Date {
  const fakeUtc = new Date(`${localIso}Z`);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(fakeUtc).map((p) => [p.type, p.value]),
  );
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const offset = asIfUtc - fakeUtc.getTime();
  return new Date(fakeUtc.getTime() - offset);
}

/** Local hour 0–23 in the restaurant timezone. */
export function localHourInTz(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const raw = parts.find((p) => p.type === "hour")?.value ?? "0";
  const h = Number(raw);
  return Number.isFinite(h) ? ((h % 24) + 24) % 24 : 0;
}

/**
 * Paid ops-test orders by local hour over the last N days (default 7).
 * Used to scrub Square "busy hours" so 2am smoke tests don't look like peaks.
 */
export async function fetchOrderlyOpsTestHourCounts(input: {
  tenantId: string;
  localDate: string;
  timeZone: string;
  lookbackDays?: number;
}): Promise<Map<number, number>> {
  const lookback = input.lookbackDays ?? 7;
  const from = wallTimeToUtc(
    `${addLocalDays(input.localDate, -(lookback - 1))}T00:00:00`,
    input.timeZone,
  );
  const to = wallTimeToUtc(`${input.localDate}T23:59:59.999`, input.timeZone);
  const orders = await db
    .select({
      createdAt: ordersTable.createdAt,
      sourceDetail: ordersTable.sourceDetail,
    })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.tenantId, input.tenantId),
        eq(ordersTable.paymentStatus, "paid"),
        gte(ordersTable.createdAt, from),
        lte(ordersTable.createdAt, to),
      ),
    );

  const byHour = new Map<number, number>();
  for (const o of orders) {
    const detail = (o.sourceDetail ?? {}) as Record<string, unknown>;
    if (!isOpsTestOrderDetail(detail)) continue;
    if (!o.createdAt) continue;
    const hour = localHourInTz(o.createdAt, input.timeZone);
    byHour.set(hour, (byHour.get(hour) ?? 0) + 1);
  }
  return byHour;
}

/** Subtract ops-test Orderly orders from Square busy-hour buckets. */
export function scrubBusyHoursOfOpsTests(
  busyHours: { hour: number; totalSalesCents: number; orderCount: number }[],
  testByHour: Map<number, number>,
): { hour: number; totalSalesCents: number; orderCount: number }[] {
  if (!testByHour.size) return busyHours;
  return busyHours
    .map((h) => {
      const drop = testByHour.get(h.hour) ?? 0;
      if (!drop) return h;
      return {
        ...h,
        orderCount: Math.max(0, h.orderCount - drop),
      };
    })
    .filter((h) => h.orderCount > 0);
}

export async function fetchOrderlyChannelAttribution(input: {
  tenantId: string;
  localDate: string;
  timeZone: string;
}): Promise<ChannelAttribution[]> {
  const { from, to } = dayBoundsUtc(input.localDate, input.timeZone);
  const orders = await db
    .select()
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.tenantId, input.tenantId),
        eq(ordersTable.paymentStatus, "paid"),
        gte(ordersTable.createdAt, from),
        lte(ordersTable.createdAt, to),
      ),
    );

  const map = new Map<string, ChannelAttribution>();
  for (const o of orders) {
    const detail = (o.sourceDetail ?? {}) as Record<string, unknown>;
    // Same rule as QR dashboard / CE: hide ops test + probe traffic.
    if (isOpsTestOrderDetail(detail)) continue;
    const src =
      String(detail.src ?? o.channel ?? "other")
        .trim()
        .toLowerCase() || "other";
    const cur = map.get(src) ?? { src, orders: 0, totalCents: 0 };
    cur.orders += 1;
    cur.totalCents += o.totalCents || 0;
    map.set(src, cur);
  }
  return [...map.values()].sort((a, b) => b.totalCents - a.totalCents);
}

const UNANSWERED_STATUSES = ["new", "drafted", "pending_approval"] as const;

/** Day-seeded rotation so the same praise quotes don't repeat every morning. */
export function pickRotatedPraiseQuotes(
  candidates: ReputationQuote[],
  reportDate: string,
  max = 2,
): ReputationQuote[] {
  const seen = new Set<string>();
  const unique: ReputationQuote[] = [];
  for (const q of candidates) {
    const key = q.excerpt.toLowerCase().replace(/\s+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(q);
  }
  if (!unique.length) return [];
  // Fewer quotes when the pool is small (no padding with repeats).
  const cap = Math.min(max, unique.length === 1 ? 1 : unique.length <= 2 ? unique.length : max);
  let seed = 0;
  for (let i = 0; i < reportDate.length; i++) seed = (seed + reportDate.charCodeAt(i) * (i + 1)) % 997;
  const start = unique.length ? seed % unique.length : 0;
  const out: ReputationQuote[] = [];
  for (let i = 0; i < unique.length && out.length < cap; i++) {
    out.push(unique[(start + i) % unique.length]!);
  }
  return out;
}

export async function fetchOrderlyReputation(input: {
  tenantId: string;
  localDate: string;
  timeZone: string;
}): Promise<{
  buckets: ReputationBucket;
  quotes: ReputationQuote[];
  urgent: ReputationQuote[];
  unanswered: UnansweredInboxItem[];
  unansweredQuestions: number;
}> {
  const { from, to } = dayBoundsUtc(input.localDate, input.timeZone);

  // Prefer original platform time (external_created_at) so backfill ingest
  // dates do not inflate "yesterday" reputation. Fall back to created_at.
  // Counts AND quotes use the same report-day window (no 7d quote mismatch).
  const eventTime = sql`coalesce(${socialInboxTable.externalCreatedAt}, ${socialInboxTable.createdAt})`;

  const rows = await db
    .select()
    .from(socialInboxTable)
    .where(
      and(
        eq(socialInboxTable.tenantId, input.tenantId),
        eq(socialInboxTable.direction, "in"),
        gte(eventTime, from),
        lte(eventTime, to),
      ),
    )
    .orderBy(desc(eventTime))
    .limit(200);

  const buckets: ReputationBucket = {
    praise: 0,
    question: 0,
    complaint: 0,
    allergy_health: 0,
    menu_suggestion: 0,
    other: 0,
  };
  const praisePool: ReputationQuote[] = [];
  const urgent: ReputationQuote[] = [];
  const unanswered: UnansweredInboxItem[] = [];
  let unansweredQuestions = 0;

  for (const r of rows) {
    const when = r.externalCreatedAt ?? r.createdAt;
    const created = when ? new Date(when).getTime() : 0;
    const onReportDay = created >= from.getTime() && created <= to.getTime();
    const cls = String(r.classification || "unknown").toLowerCase();
    const status = String(r.status || "new").toLowerCase();

    if (onReportDay) {
      if (cls === "praise") buckets.praise += 1;
      else if (cls === "question") buckets.question += 1;
      else if (cls === "complaint") buckets.complaint += 1;
      else if (cls === "allergy_health") buckets.allergy_health += 1;
      else if (cls === "menu_suggestion") buckets.menu_suggestion += 1;
      else buckets.other += 1;
    }

    const excerpt = String(r.body || "").trim().slice(0, 160);
    if (!excerpt) continue;
    const q: ReputationQuote = {
      classification: cls,
      excerpt,
      platform: String(r.platform || "social"),
      status,
    };
    if (onReportDay && (cls === "complaint" || cls === "allergy_health")) {
      urgent.push(q);
    }
    if (onReportDay && cls === "praise") {
      praisePool.push(q);
    }

    if (
      onReportDay &&
      (UNANSWERED_STATUSES as readonly string[]).includes(status) &&
      unanswered.length < 12
    ) {
      unanswered.push({
        classification: cls,
        excerpt,
        platform: String(r.platform || "social"),
        status,
      });
      if (cls === "question") unansweredQuestions += 1;
    }
  }

  const quotes = pickRotatedPraiseQuotes(praisePool, input.localDate, 2);
  return { buckets, quotes, urgent, unanswered, unansweredQuestions };
}

function addLocalDays(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d, 12, 0, 0) + delta * 24 * 60 * 60 * 1000;
  const dt = new Date(utc);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export async function fetchOrderlyQrScans(input: {
  tenantId: string;
  localDate: string;
  timeZone: string;
}): Promise<QrScanDaySummary> {
  const { from, to } = dayBoundsUtc(input.localDate, input.timeZone);
  const rows = await db
    .select({
      userAgent: qrScansTable.userAgent,
      meta: qrScansTable.meta,
    })
    .from(qrScansTable)
    .where(
      and(
        eq(qrScansTable.tenantId, input.tenantId),
        gte(qrScansTable.createdAt, from),
        lte(qrScansTable.createdAt, to),
      ),
    )
    .limit(500);

  const bySrc = new Map<string, { human: number; bot: number }>();
  let human = 0;
  let bot = 0;
  let hiddenTestSrcRows = 0;
  for (const r of rows) {
    const isBot = isLikelyBotUserAgent(r.userAgent);
    if (isBot) bot += 1;
    else human += 1;
    const meta = (r.meta || {}) as Record<string, unknown>;
    const src =
      typeof meta.src === "string" && meta.src.trim()
        ? meta.src.trim().toLowerCase()
        : "(none)";
    if (isOpsTestSrc(src)) {
      hiddenTestSrcRows += 1;
      continue;
    }
    const cur = bySrc.get(src) ?? { human: 0, bot: 0 };
    if (isBot) cur.bot += 1;
    else cur.human += 1;
    bySrc.set(src, cur);
  }

  return {
    total: rows.length,
    human,
    bot,
    hiddenTestSrcRows,
    bySrc: [...bySrc.entries()]
      .map(([src, v]) => ({ src, human: v.human, bot: v.bot }))
      .sort((a, b) => b.human - a.human)
      .slice(0, 8),
  };
}

export async function fetchOrderlySocialPosts(input: {
  tenantId: string;
  localDate: string;
  timeZone: string;
}): Promise<SocialPostsDaySummary> {
  const { from, to } = dayBoundsUtc(input.localDate, input.timeZone);
  const lookbackFrom = wallTimeToUtc(
    `${addLocalDays(input.localDate, -13)}T00:00:00`,
    input.timeZone,
  );

  const [statusRows, postedRows, recentPosted] = await Promise.all([
    db
      .select({
        status: socialPostsTable.status,
        count: sql<number>`count(*)::int`,
      })
      .from(socialPostsTable)
      .where(
        and(
          eq(socialPostsTable.tenantId, input.tenantId),
          gte(socialPostsTable.createdAt, from),
          lte(socialPostsTable.createdAt, to),
        ),
      )
      .groupBy(socialPostsTable.status),
    db
      .select()
      .from(socialPostsTable)
      .where(
        and(
          eq(socialPostsTable.tenantId, input.tenantId),
          eq(socialPostsTable.status, "posted"),
          gte(socialPostsTable.postedAt, from),
          lte(socialPostsTable.postedAt, to),
        ),
      )
      .orderBy(desc(socialPostsTable.postedAt))
      .limit(5),
    db
      .select()
      .from(socialPostsTable)
      .where(
        and(
          eq(socialPostsTable.tenantId, input.tenantId),
          eq(socialPostsTable.status, "posted"),
          gte(socialPostsTable.postedAt, lookbackFrom),
          lte(socialPostsTable.postedAt, to),
        ),
      )
      .orderBy(desc(socialPostsTable.clicks))
      .limit(40),
  ]);

  let drafted = 0;
  let pendingApproval = 0;
  let posted = 0;
  for (const r of statusRows) {
    const st = String(r.status);
    const n = Number(r.count) || 0;
    if (st === "draft") drafted += n;
    else if (st === "pending_approval" || st === "approved") pendingApproval += n;
    else if (st === "posted") posted += n;
  }
  if (postedRows.length) posted = Math.max(posted, postedRows.length);

  const toHighlight = (p: (typeof recentPosted)[number]): SocialPostHighlight => {
    const facts =
      p.facts && typeof p.facts === "object" && !Array.isArray(p.facts)
        ? (p.facts as Record<string, unknown>)
        : {};
    const loop =
      facts.closed_loop && typeof facts.closed_loop === "object"
        ? (facts.closed_loop as Record<string, unknown>)
        : {};
    const ordersPromotedItem = Number(loop.orders_promoted_item ?? 0);
    return {
      itemName: p.menuItemName,
      platform: p.platform,
      srcTag: p.srcTag || "",
      clicks: p.clicks ?? 0,
      orders: p.orders ?? 0,
      ordersPromotedItem: Number.isFinite(ordersPromotedItem)
        ? ordersPromotedItem
        : 0,
      revenueCents: p.revenueCents ?? 0,
    };
  };

  const highlights = (postedRows.length ? postedRows : recentPosted.slice(0, 5)).map(
    toHighlight,
  );

  // Age gate: only surface click→order gaps for posts within 3 local days of
  // the report date (stale Jul-16 posts must not keep appearing on Jul-17+).
  const anomalyFloor = wallTimeToUtc(
    `${addLocalDays(input.localDate, -2)}T00:00:00`,
    input.timeZone,
  ).getTime();

  const clickAnomalies = recentPosted
    .filter((p) => {
      const posted = p.postedAt ? new Date(p.postedAt).getTime() : 0;
      return posted >= anomalyFloor;
    })
    .map(toHighlight)
    // Primary closed-loop = any order with this src (not only promoted item).
    .filter((h) => h.clicks >= 8 && h.orders === 0)
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 3);

  return {
    drafted,
    pendingApproval,
    posted,
    highlights,
    clickAnomalies,
  };
}

/**
 * Content calendar performance for daily report.
 * Lookback is multi-day (default 14) — click→order is rarely same-day.
 */
export async function fetchOrderlyContentCalendar(input: {
  tenantId: string;
  localDate: string;
  timeZone: string;
  lookbackDays?: number;
}): Promise<ContentCalendarDaySummary> {
  const lookbackDays = input.lookbackDays ?? 14;
  const draft = (
    await db
      .select({ c: sql<number>`count(*)::int` })
      .from(contentCalendarTable)
      .where(
        and(
          eq(contentCalendarTable.tenantId, input.tenantId),
          eq(contentCalendarTable.status, "draft"),
        ),
      )
  )[0]?.c ?? 0;
  const approved = (
    await db
      .select({ c: sql<number>`count(*)::int` })
      .from(contentCalendarTable)
      .where(
        and(
          eq(contentCalendarTable.tenantId, input.tenantId),
          eq(contentCalendarTable.status, "approved"),
        ),
      )
  )[0]?.c ?? 0;

  const floor = wallTimeToUtc(
    `${addLocalDays(input.localDate, -(lookbackDays - 1))}T00:00:00`,
    input.timeZone,
  );

  const postedRows = await db
    .select()
    .from(contentCalendarTable)
    .where(
      and(
        eq(contentCalendarTable.tenantId, input.tenantId),
        eq(contentCalendarTable.status, "posted"),
        gte(contentCalendarTable.postedAt, floor),
      ),
    )
    .orderBy(desc(contentCalendarTable.postedAt))
    .limit(20);

  const highlights: SocialPostHighlight[] = postedRows.map((p) => ({
    itemName: p.targetItemName || p.hook || p.pillar,
    platform: p.platform,
    srcTag: p.srcSlug || "",
    clicks: p.clicks ?? 0,
    orders: p.orders ?? 0,
    ordersPromotedItem: 0,
    revenueCents: p.revenueCents ?? 0,
  }));

  return {
    draft: Number(draft),
    approved: Number(approved),
    postedInWindow: postedRows.length,
    highlights,
    lookbackDays,
  };
}

export async function fetchOrderlyGbpDay(input: {
  tenantId: string;
  localDate: string;
  timeZone: string;
}): Promise<GbpDaySummary> {
  try {
    const { from, to } = dayBoundsUtc(input.localDate, input.timeZone);
    const rows = await db
      .select()
      .from(gbpInboxTable)
      .where(
        and(
          eq(gbpInboxTable.tenantId, input.tenantId),
          gte(gbpInboxTable.createdAt, from),
          lte(gbpInboxTable.createdAt, to),
        ),
      )
      .orderBy(desc(gbpInboxTable.createdAt))
      .limit(50);

    if (!rows.length) {
      return {
        available: false,
        note: "No Google reviews/Q&A in range (sync may be quota-limited).",
        reviews: 0,
        questions: 0,
        unanswered: 0,
        quotes: [],
      };
    }

    let reviews = 0;
    let questions = 0;
    let unanswered = 0;
    const quotes: GbpDaySummary["quotes"] = [];
    for (const r of rows) {
      if (r.kind === "review") reviews += 1;
      else questions += 1;
      if ((UNANSWERED_STATUSES as readonly string[]).includes(String(r.status))) {
        unanswered += 1;
      }
      const excerpt = String(r.body || "").trim().slice(0, 140);
      if (excerpt && quotes.length < 3) {
        quotes.push({
          stars: r.starRating ?? null,
          excerpt,
          kind: String(r.kind),
        });
      }
    }

    return {
      available: true,
      reviews,
      questions,
      unanswered,
      quotes,
    };
  } catch {
    return {
      available: false,
      note: "Google reviews unavailable (GBP API / table).",
      reviews: 0,
      questions: 0,
      unanswered: 0,
      quotes: [],
    };
  }
}

export function localYesterday(timeZone: string, now = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayLocal = fmt.format(now);
  const [y, m, d] = todayLocal.split("-").map(Number);
  const utcNoon = Date.UTC(y, m - 1, d, 12, 0, 0);
  const yest = new Date(utcNoon - 24 * 60 * 60 * 1000);
  return fmt.format(yest);
}

export function localToday(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function localHour(timeZone: string, now = new Date()): number {
  const h = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hourCycle: "h23",
  }).format(now);
  return Number(h);
}
