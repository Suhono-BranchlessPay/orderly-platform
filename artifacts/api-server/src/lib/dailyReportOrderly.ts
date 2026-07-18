/**
 * Orderly-side slices for the daily report (closed-loop + reputation).
 * These are SUBSETS — never add them into Square totals (anti double-count).
 */
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import {
  db,
  gbpInboxTable,
  ordersTable,
  qrScansTable,
  socialInboxTable,
  socialPostsTable,
} from "@workspace/db";
import { isLikelyBotUserAgent } from "./qrScanBotFilter";

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
  bySrc: { src: string; human: number; bot: number }[];
};

export type SocialPostsDaySummary = {
  drafted: number;
  pendingApproval: number;
  posted: number;
  /** Posted rows with cached closed-loop metrics (facts only). */
  highlights: {
    itemName: string;
    platform: string;
    clicks: number;
    orders: number;
    revenueCents: number;
  }[];
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

export async function fetchOrderlyReputation(input: {
  tenantId: string;
  localDate: string;
  timeZone: string;
}): Promise<{
  buckets: ReputationBucket;
  quotes: ReputationQuote[];
  urgent: ReputationQuote[];
  unanswered: UnansweredInboxItem[];
}> {
  const { from, to } = dayBoundsUtc(input.localDate, input.timeZone);
  const rows = await db
    .select()
    .from(socialInboxTable)
    .where(
      and(
        eq(socialInboxTable.tenantId, input.tenantId),
        eq(socialInboxTable.direction, "in"),
        gte(socialInboxTable.createdAt, from),
        lte(socialInboxTable.createdAt, to),
      ),
    )
    .orderBy(desc(socialInboxTable.createdAt))
    .limit(100);

  const buckets: ReputationBucket = {
    praise: 0,
    question: 0,
    complaint: 0,
    allergy_health: 0,
    other: 0,
  };
  const quotes: ReputationQuote[] = [];
  const urgent: ReputationQuote[] = [];
  const unanswered: UnansweredInboxItem[] = [];

  for (const r of rows) {
    const cls = String(r.classification || "unknown").toLowerCase();
    const status = String(r.status || "new").toLowerCase();
    if (cls === "praise") buckets.praise += 1;
    else if (cls === "question") buckets.question += 1;
    else if (cls === "complaint") buckets.complaint += 1;
    else if (cls === "allergy_health") buckets.allergy_health += 1;
    else buckets.other += 1;

    const excerpt = String(r.body || "").trim().slice(0, 160);
    if (!excerpt) continue;
    const q: ReputationQuote = {
      classification: cls,
      excerpt,
      platform: String(r.platform || "social"),
      status,
    };
    if (cls === "complaint" || cls === "allergy_health") {
      urgent.push(q);
    } else if (cls === "praise" && quotes.length < 3) {
      quotes.push(q);
    }

    if (
      (UNANSWERED_STATUSES as readonly string[]).includes(status) &&
      unanswered.length < 8
    ) {
      unanswered.push({
        classification: cls,
        excerpt,
        platform: String(r.platform || "social"),
        status,
      });
    }
  }

  return { buckets, quotes, urgent, unanswered };
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
  for (const r of rows) {
    const isBot = isLikelyBotUserAgent(r.userAgent);
    if (isBot) bot += 1;
    else human += 1;
    const meta = (r.meta || {}) as Record<string, unknown>;
    const src =
      typeof meta.src === "string" && meta.src.trim()
        ? meta.src.trim().toLowerCase()
        : "(none)";
    const cur = bySrc.get(src) ?? { human: 0, bot: 0 };
    if (isBot) cur.bot += 1;
    else cur.human += 1;
    bySrc.set(src, cur);
  }

  return {
    total: rows.length,
    human,
    bot,
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

  const [statusRows, postedRows] = await Promise.all([
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
  // Prefer postedAt window count when available.
  if (postedRows.length) posted = Math.max(posted, postedRows.length);

  return {
    drafted,
    pendingApproval,
    posted,
    highlights: postedRows.map((p) => ({
      itemName: p.menuItemName,
      platform: p.platform,
      clicks: p.clicks ?? 0,
      orders: p.orders ?? 0,
      revenueCents: p.revenueCents ?? 0,
    })),
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
