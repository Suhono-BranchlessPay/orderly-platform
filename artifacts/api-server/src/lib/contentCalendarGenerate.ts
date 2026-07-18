/**
 * Gather Square + Orderly + inbox facts, call AI Gateway content_calendar,
 * persist draft rows with auto src_slug + short_link.
 */
import { and, desc, eq, gte } from "drizzle-orm";
import {
  db,
  socialInboxTable,
  socialPostsTable,
  tenantsTable,
  CONTENT_PILLARS,
  type ContentPillar,
} from "@workspace/db";
import { run as aiRun } from "./ai";
import type { ContentCalendarLlmPost } from "./ai/guardrails";
import {
  deleteDraftsForMonth,
  fetchPastContentPerformance,
  getContentCalendarConfig,
  insertCalendarDrafts,
  insertId,
  listMenuItemsWithPhotos,
  listUnavailableMenuItems,
  resolveShortLinkForPost,
  suggestTimeBeforePeak,
  captionHasBannedClaim,
  wordCount,
} from "./contentCalendar";
import { logger } from "./logger";
import {
  fetchSquareBusyHours,
  fetchSquareTopProducts,
  parseBusyHourRows,
  parseTopProductRows,
} from "./squareReporting";

function usHolidaysForMonth(year: number, month: number): string[] {
  // Lightweight fixed + observed — not a full calendar lib. Tenant events override.
  const m = String(month).padStart(2, "0");
  const fixed: Record<string, string> = {
    "01-01": "New Year's Day",
    "02-14": "Valentine's Day",
    "07-04": "Independence Day",
    "10-31": "Halloween",
    "11-11": "Veterans Day",
    "12-25": "Christmas Day",
  };
  const out: string[] = [];
  for (const [md, name] of Object.entries(fixed)) {
    if (md.startsWith(m)) out.push(`${year}-${md}: ${name}`);
  }
  // Thanksgiving = 4th Thursday of November
  if (month === 11) {
    const d = new Date(Date.UTC(year, 10, 1));
    let thurs = 0;
    for (let day = 1; day <= 30; day++) {
      d.setUTCDate(day);
      if (d.getUTCDay() === 4) {
        thurs += 1;
        if (thurs === 4) {
          out.push(`${year}-11-${String(day).padStart(2, "0")}: Thanksgiving`);
          break;
        }
      }
    }
  }
  return out;
}

async function inboxThemes(tenantId: string): Promise<{
  praiseThemes: string[];
  menuRequests: string[];
  faq: string[];
  verifiedQuotes: string[];
}> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 60);
  const rows = await db
    .select({
      classification: socialInboxTable.classification,
      body: socialInboxTable.body,
      draftReply: socialInboxTable.draftReply,
    })
    .from(socialInboxTable)
    .where(
      and(
        eq(socialInboxTable.tenantId, tenantId),
        gte(socialInboxTable.createdAt, since),
      ),
    )
    .orderBy(desc(socialInboxTable.createdAt))
    .limit(200);

  const praiseThemes: string[] = [];
  const menuRequests: string[] = [];
  const faq: string[] = [];
  const verifiedQuotes: string[] = [];

  for (const r of rows) {
    const body = (r.body || "").trim();
    if (!body) continue;
    const cls = (r.classification || "").toLowerCase();
    if (cls === "praise") {
      verifiedQuotes.push(body.slice(0, 180));
      // crude theme tokens
      const lower = body.toLowerCase();
      for (const theme of [
        "sauce",
        "crab rangoon",
        "clean",
        "service",
        "friendly",
        "fresh",
        "hibachi",
        "roll",
      ]) {
        if (lower.includes(theme)) praiseThemes.push(theme);
      }
    } else if (cls === "menu_suggestion") {
      menuRequests.push(body.slice(0, 120));
    } else if (cls === "question") {
      faq.push(body.slice(0, 120));
    }
  }

  const uniq = (arr: string[]) => [...new Set(arr)].slice(0, 12);
  return {
    praiseThemes: uniq(praiseThemes),
    menuRequests: uniq(menuRequests),
    faq: uniq(faq),
    verifiedQuotes: uniq(verifiedQuotes).slice(0, 8),
  };
}

async function socialPostsPerformance(tenantId: string) {
  const rows = await db
    .select({
      srcTag: socialPostsTable.srcTag,
      menuItemName: socialPostsTable.menuItemName,
      clicks: socialPostsTable.clicks,
      orders: socialPostsTable.orders,
      revenueCents: socialPostsTable.revenueCents,
      postedAt: socialPostsTable.postedAt,
    })
    .from(socialPostsTable)
    .where(
      and(
        eq(socialPostsTable.tenantId, tenantId),
        eq(socialPostsTable.status, "posted"),
      ),
    )
    .orderBy(desc(socialPostsTable.orders), desc(socialPostsTable.clicks))
    .limit(15);
  return rows.map((r) => ({
    src: r.srcTag,
    item: r.menuItemName,
    clicks: r.clicks,
    orders: r.orders,
    revenueCents: r.revenueCents,
    postedAt: r.postedAt?.toISOString() ?? null,
  }));
}

function allocatePillars(
  n: number,
  mix: Record<string, number>,
): ContentPillar[] {
  const pillars = CONTENT_PILLARS.filter((p) => (mix[p] ?? 0) > 0);
  const weights = pillars.map((p) => Math.max(0, Number(mix[p] ?? 0)));
  const sum = weights.reduce((a: number, b: number) => a + b, 0) || 1;
  const counts: Array<{ p: ContentPillar; n: number }> = pillars.map(
    (p, i) => ({
      p,
      n: Math.floor((weights[i]! / sum) * n),
    }),
  );
  let used = counts.reduce((a, c) => a + c.n, 0);
  let i = 0;
  while (used < n && counts.length) {
    counts[i % counts.length]!.n += 1;
    used += 1;
    i += 1;
  }
  const out: ContentPillar[] = [];
  for (const c of counts) {
    for (let k = 0; k < c.n; k++) out.push(c.p);
  }
  // shuffle lightly for variety
  for (let j = out.length - 1; j > 0; j--) {
    const r = Math.floor(Math.random() * (j + 1));
    [out[j], out[r]] = [out[r]!, out[j]!];
  }
  return out.slice(0, n);
}

function datesInMonth(year: number, month: number, n: number): string[] {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // Prefer Tue–Sat for food posts; spread across month
  const preferred: string[] = [];
  const others: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(Date.UTC(year, month - 1, d));
    const dow = dt.getUTCDay(); // 0 Sun
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (dow >= 2 && dow <= 6) preferred.push(iso);
    else others.push(iso);
  }
  const pool = [...preferred, ...others];
  if (n >= pool.length) return pool.slice(0, n);
  const step = pool.length / n;
  const picked: string[] = [];
  for (let i = 0; i < n; i++) {
    picked.push(pool[Math.min(pool.length - 1, Math.floor(i * step))]!);
  }
  return [...new Set(picked)].slice(0, n);
}

function matchMenuItem(
  nameOrId: string | null | undefined,
  catalog: Array<{ id: string; name: string }>,
): { id: string; name: string } | null {
  if (!nameOrId?.trim()) return null;
  const raw = nameOrId.trim();
  const byId = catalog.find((c) => c.id === raw);
  if (byId) return byId;
  const lower = raw.toLowerCase();
  return (
    catalog.find((c) => c.name.toLowerCase() === lower) ||
    catalog.find((c) => c.name.toLowerCase().includes(lower)) ||
    null
  );
}

export async function generateContentCalendarMonth(input: {
  tenantId: string;
  /** YYYY-MM */
  monthKey: string;
  /** Replace existing drafts/skipped for the month */
  replaceDrafts?: boolean;
}): Promise<{
  monthKey: string;
  created: number;
  posts: Awaited<ReturnType<typeof insertCalendarDrafts>>;
  aiSource: "ai" | "facts";
  note?: string;
}> {
  const [tenant] = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.id, input.tenantId))
    .limit(1);
  if (!tenant) throw new Error("tenant not found");

  const config = await getContentCalendarConfig(input.tenantId);
  if (!config.enabled) throw new Error("content calendar disabled for tenant");

  const monthKey = input.monthKey;
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    throw new Error("monthKey must be YYYY-MM");
  }
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));

  if (input.replaceDrafts !== false) {
    await deleteDraftsForMonth(input.tenantId, monthKey);
  }

  const nPosts = config.nPosts;
  const photos = await listMenuItemsWithPhotos(input.tenantId);
  const unavailable = await listUnavailableMenuItems(input.tenantId);
  const photoCatalog = photos.map((p) => ({ id: p.id, name: p.name }));

  // Square — 30d top products (reuse reporting helper with last 30 days)
  const topRes = await fetchSquareTopProducts(tenant.slug, 10);
  // Prefer 30d: call reporting with dateRange override via re-fetch
  const { squareReportingLoad } = await import("./squareReporting");
  const top30 = await squareReportingLoad(tenant.slug, {
    measures: [
      "ProductMixReport.items_sold_quantity",
      "ProductMixReport.net_sales",
    ],
    dimensions: ["ProductMixReport.item_name"],
    timeDimensions: [
      {
        dimension: "ProductMixReport.reporting_day",
        dateRange: "last 30 days",
      },
    ],
    order: [["ProductMixReport.net_sales", "desc"]],
    limit: 10,
  });
  const topRows = parseTopProductRows(
    top30.ok ? top30.data : topRes.ok ? topRes.data : [],
  );

  const busyRes = await fetchSquareBusyHours(tenant.slug);
  const busy = busyRes.ok ? parseBusyHourRows(busyRes.data) : [];
  const peakHour =
    busy.sort((a, b) => b.totalSalesCents - a.totalSalesCents)[0]?.hour ?? 18;

  // Underperformers with photos: photo items not in top sellers
  const topNames = new Set(topRows.map((t) => t.name.toLowerCase()));
  const underperforming = photos
    .filter((p) => !topNames.has(p.name.toLowerCase()))
    .slice(0, 8)
    .map((p) => p.name);

  const themes = await inboxThemes(input.tenantId);
  // Refresh metrics first so AI sees multi-day closed-loop, not stale zeros.
  try {
    const { refreshContentCalendarMetrics } = await import("./contentCalendar");
    await refreshContentCalendarMetrics(input.tenantId);
  } catch {
    /* non-fatal */
  }
  const pastCal = await fetchPastContentPerformance(input.tenantId, 45);
  const pastSocial = await socialPostsPerformance(input.tenantId);
  const past_content_performance = [...pastCal, ...pastSocial].slice(0, 20);

  const holidays = usHolidaysForMonth(year, month);
  const localEvents = [
    ...holidays,
    ...(config.localEvents || []).map(String),
  ];

  const pillarSlots = allocatePillars(nPosts, config.pillarMix || {});
  const scheduleDates = datesInMonth(year, month, nPosts);
  const prePeak =
    Math.round(
      (config.prePeakMinutesMin + config.prePeakMinutesMax) / 2,
    ) || 105;

  const aiInput = {
    tenant_name: tenant.name,
    cuisine: config.cuisine,
    city: tenant.city || "",
    state: tenant.state || "",
    tenant_tone: config.tone,
    tenant_language: config.language,
    month: monthKey,
    n_posts: nPosts,
    pillar_mix: config.pillarMix,
    top_items_with_qty_and_sales: topRows.map((t) => ({
      name: t.name,
      qty: t.quantity,
      net_sales_cents: t.netSalesCents,
    })),
    underperforming_items: underperforming,
    peak_hours: busy.slice(0, 5).map((b) => ({
      hour: b.hour,
      sales_cents: b.totalSalesCents,
      orders: b.orderCount,
    })),
    praise_themes: themes.praiseThemes,
    menu_requests: themes.menuRequests,
    faq_from_inbox: themes.faq,
    verified_quotes: themes.verifiedQuotes,
    past_content_performance,
    items_with_photos: photoCatalog,
    unavailable_items: unavailable.map((u) => u.name),
    local_events: localEvents,
    suggested_dates: scheduleDates,
    suggested_pillars: pillarSlots,
    suggested_time: suggestTimeBeforePeak(peakHour, prePeak).slice(0, 5),
  };

  const ai = await aiRun({
    task: "content_calendar",
    tenantId: input.tenantId,
    language: config.language,
    input: aiInput,
    opts: { maxTokens: 4000, temperature: 0.4, responseFormat: "json" },
  });

  let llmPosts: ContentCalendarLlmPost[] = [];
  let aiSource: "ai" | "facts" = "facts";
  if (ai.ok && ai.output && typeof ai.output === "object") {
    const out = ai.output as { posts?: ContentCalendarLlmPost[] };
    if (Array.isArray(out.posts) && out.posts.length) {
      llmPosts = out.posts;
      aiSource = "ai";
    }
  }
  if (!llmPosts.length) {
    logger.warn(
      { tenantId: input.tenantId, error: ai.error },
      "content_calendar AI failed — using fact fallback posts",
    );
    llmPosts = buildFactFallbackPosts({
      dates: scheduleDates,
      pillars: pillarSlots,
      topItems: topRows.map((t) => t.name),
      photoItems: photoCatalog,
      suggestedTime: suggestTimeBeforePeak(peakHour, prePeak).slice(0, 5),
      restaurantName: tenant.name,
      city: tenant.city || "",
    });
  }

  const inserts: Array<{
    id: string;
    tenantId: string;
    scheduledDate: string;
    suggestedTime: string | null;
    pillar: string;
    targetItemId: string | null;
    targetItemName: string | null;
    hook: string;
    caption: string;
    hashtags: string[];
    ctaType: string;
    platform: string;
    srcSlug: string;
    shortLink: string;
    photoAssetId: string | null;
    designBrief: Record<string, unknown>;
    status: string;
    monthKey: string;
  }> = [];

  const usedDates = new Set<string>();
  for (let i = 0; i < Math.min(llmPosts.length, nPosts); i++) {
    const p = llmPosts[i]!;
    const date =
      /^\d{4}-\d{2}-\d{2}$/.test(String(p.date || ""))
        ? String(p.date)
        : scheduleDates[i] || scheduleDates[scheduleDates.length - 1]!;
    if (!date.startsWith(monthKey)) continue;
    // avoid duplicate dates when possible
    let scheduledDate = date;
    if (usedDates.has(scheduledDate) && scheduleDates[i]) {
      scheduledDate = scheduleDates[i]!;
    }
    usedDates.add(scheduledDate);

    const pillarRaw = String(p.pillar || pillarSlots[i] || "hero_product");
    const pillar = (CONTENT_PILLARS as readonly string[]).includes(pillarRaw)
      ? pillarRaw
      : "hero_product";
    const platform = String(p.platform || "facebook").toLowerCase();
    const platOk = ["facebook", "instagram", "gbp", "blog"].includes(platform)
      ? platform
      : "facebook";

    const needsItem = [
      "hero_product",
      "offer_cta",
      "menu_education",
      "customer_voice",
    ].includes(pillar);

    let matched = matchMenuItem(
      p.target_item_id || p.target_item_name || null,
      photoCatalog,
    );
    if (needsItem && !matched && photoCatalog[i % Math.max(1, photoCatalog.length)]) {
      matched = photoCatalog[i % photoCatalog.length]!;
    }
    // Visual posts require a photo item when pillar is product-ish
    if (needsItem && !matched) {
      logger.info({ pillar, date: scheduledDate }, "skip calendar slot — no photo item");
      continue;
    }
    if (matched && unavailable.some((u) => u.id === matched!.id)) {
      continue;
    }

    let hook = String(p.hook || "").trim();
    if (!hook || wordCount(hook) > 8) {
      hook = matched
        ? `${matched.name} tonight`
        : "See you soon";
      hook = hook.split(/\s+/).slice(0, 8).join(" ");
    }
    let caption = String(p.caption || "").trim();
    if (!caption) {
      caption = matched
        ? `${matched.name} is ready for pickup — order ahead.`
        : `Stop by ${tenant.name} this week.`;
    }
    if (captionHasBannedClaim(caption) || captionHasBannedClaim(hook)) {
      caption = caption.replace(BANNED_SOFT, "").trim();
      hook = hook.replace(BANNED_SOFT, "").trim();
    }

    const hashtags = Array.isArray(p.hashtags)
      ? p.hashtags.map((h) => String(h).replace(/^#/, "").trim()).filter(Boolean).slice(0, 8)
      : [];
    const ctaType = ["order_online", "visit", "engage"].includes(
      String(p.cta_type || ""),
    )
      ? String(p.cta_type)
      : "order_online";

    const timeRaw = String(p.suggested_time || "").trim();
    const suggestedTime = /^\d{1,2}:\d{2}/.test(timeRaw)
      ? (timeRaw.length === 5 ? `${timeRaw}:00` : timeRaw.slice(0, 8))
      : suggestTimeBeforePeak(peakHour, prePeak);

    const links = await resolveShortLinkForPost({
      tenantId: input.tenantId,
      platform: platOk,
      scheduledDate,
      pillar,
      targetItemId: matched?.id ?? null,
      targetItemName: matched?.name ?? null,
    });

    if (!caption.includes(links.shortLink) && !/[?&]src=/i.test(caption)) {
      caption = `${caption.trim()}\n\n${links.shortLink}`;
    }

    inserts.push({
      id: insertId(),
      tenantId: input.tenantId,
      scheduledDate,
      suggestedTime,
      pillar,
      targetItemId: matched?.id ?? null,
      targetItemName: matched?.name ?? null,
      hook,
      caption,
      hashtags,
      ctaType,
      platform: platOk,
      srcSlug: links.srcSlug,
      shortLink: links.shortLink,
      photoAssetId: links.photoAssetId,
      designBrief: {
        photo_needed: Boolean(p.photo_needed) || !links.photoAssetId,
        pillar,
        hook,
        phase: 1,
      },
      status: "draft",
      monthKey,
    });
  }

  const posts = await insertCalendarDrafts(inserts);
  return {
    monthKey,
    created: inserts.length,
    posts,
    aiSource,
    note:
      photoCatalog.length < 3
        ? "Few menu items have photos — visual posts are limited. Schedule a photo session for top sellers."
        : undefined,
  };
}

const BANNED_SOFT =
  /\b(best|#1|number\s*one|top[\s-]?rated|award[\s-]?winning|healthiest)\b/gi;

function buildFactFallbackPosts(input: {
  dates: string[];
  pillars: ContentPillar[];
  topItems: string[];
  photoItems: Array<{ id: string; name: string }>;
  suggestedTime: string;
  restaurantName: string;
  city: string;
}): ContentCalendarLlmPost[] {
  return input.dates.map((date, i) => {
    const pillar = input.pillars[i] || "hero_product";
    const item =
      input.photoItems[i % Math.max(1, input.photoItems.length)] ||
      (input.topItems[0]
        ? { id: "", name: input.topItems[0] }
        : null);
    const name = item?.name || "Tonight's special";
    return {
      date,
      suggested_time: input.suggestedTime,
      pillar,
      target_item_id: item?.id || null,
      target_item_name: item?.name || null,
      hook: name.split(/\s+/).slice(0, 5).join(" "),
      caption: `${name} at ${input.restaurantName}${input.city ? ` in ${input.city}` : ""}. Order ahead for pickup.`,
      hashtags: [input.city.replace(/\s+/g, "") || "localfood", "pickup"].filter(Boolean),
      cta_type: "order_online",
      platform: "facebook",
      photo_needed: !item?.id,
    };
  });
}
