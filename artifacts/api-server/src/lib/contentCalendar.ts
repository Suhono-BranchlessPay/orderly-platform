/**
 * Content Engine Phase 1 — calendar CRUD, src/short-link, metrics, review actions.
 * Human approve required before anything ships. No auto-publish to Meta.
 */
import { randomUUID } from "crypto";
import {
  and,
  desc,
  eq,
  gte,
  sql,
  inArray,
} from "drizzle-orm";
import {
  db,
  contentCalendarConfigTable,
  contentCalendarTable,
  DEFAULT_PILLAR_MIX,
  CONTENT_CALENDAR_STATUSES,
  CONTENT_PILLARS,
  CONTENT_CTA_TYPES,
  CONTENT_PLATFORMS,
  menuItemsTable,
  ordersTable,
  qrScansTable,
  tenantsTable,
  type ContentCalendarRow,
  type ContentCalendarConfig,
  type ContentPillar,
  type ContentCtaType,
  type ContentPlatform,
  type ContentCalendarStatus,
} from "@workspace/db";
import { buildTrackedUrl, slugifyShortPath } from "./socialPostDraft";
import { QR_SCAN_BOT_UA_PATTERN } from "./qrScanBotFilter";
import { filterPastPerformanceForContentEngine } from "./dailyReportDataQuality";
import { sqlExcludeOpsTestOrders } from "./orderTestExclusion";
import { isOpsTestOrderDetail } from "./opsTestSrc";
import { logger } from "./logger";
import {
  itemNameInTopProducts,
  textHasRankingClaim,
} from "./contentCalendarMatch";
import {
  fetchSquareTopProducts,
  parseTopProductRows,
} from "./squareReporting";

export {
  DEFAULT_PILLAR_MIX,
  CONTENT_PILLARS,
  CONTENT_CTA_TYPES,
  CONTENT_PLATFORMS,
  CONTENT_CALENDAR_STATUSES,
};
export type {
  ContentPillar,
  ContentCtaType,
  ContentPlatform,
  ContentCalendarStatus,
  ContentCalendarRow,
  ContentCalendarConfig,
};

const BANNED_CLAIM_RE =
  /\b(best|#1|number\s*one|top[\s-]?rated|award[\s-]?winning|healthiest|gluten[\s-]?free|allergen[\s-]?free|cure|miracle)\b/i;

export function captionHasBannedClaim(text: string): boolean {
  return BANNED_CLAIM_RE.test(text);
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function platformSrcPrefix(platform: string): string {
  const p = (platform || "facebook").toLowerCase();
  if (p.startsWith("ig") || p === "instagram") return "ig";
  if (p === "tiktok" || p === "tt") return "tiktok";
  if (p === "gbp" || p === "google") return "gbp";
  if (p === "blog") return "blog";
  return "fb";
}

/**
 * Permanent bio / link-in-bio src (no date) — e.g. tiktok-bio, ig-bio.
 * Campaign calendar posts use buildCalendarSrcSlug (dated).
 */
export function buildBioSrcSlug(
  platform: "tiktok" | "instagram" | "facebook" | string,
): string {
  const p = platformSrcPrefix(platform);
  if (p === "tiktok") return "tiktok-bio";
  if (p === "ig") return "ig-bio";
  return "fb-bio";
}

/**
 * Evergreen Facebook Page "Order Now" CTA — no date suffix.
 * Historical Samurai link keeps `fb-page-cta-20260718` (do not rename — splits history).
 * New tenants / retags should use this undated slug.
 */
export function buildPageCtaSrcSlug(): string {
  return "fb-page-cta";
}

/**
 * Non-content surfaces: Page CTA, About website, bio links.
 * Orders with these src tags must never be credited to a nearby campaign post.
 */
export function isEvergreenSurfaceSrc(src: string | null | undefined): boolean {
  const s = (src || "").toLowerCase().trim();
  if (!s) return false;
  if (s === "fb-page-cta" || s.startsWith("fb-page-cta-")) return true;
  if (s === "fb-about" || s.startsWith("fb-about-")) return true;
  if (s === "fb-bio" || s === "ig-bio" || s === "tiktok-bio") return true;
  if (s.endsWith("-bio")) return true;
  return false;
}

export function buildCalendarSrcSlug(input: {
  platform: string;
  itemName: string | null | undefined;
  scheduledDate: string; // YYYY-MM-DD
  pillar: string;
}): string {
  const d = input.scheduledDate.replace(/-/g, "").slice(0, 8);
  const prefix = platformSrcPrefix(input.platform);
  // Convention: tiktok-{item}-{YYYYMMDD} | ig-{item}-{YYYYMMDD} | fb-…
  const item =
    input.itemName?.trim()
      ? slugifyShortPath(input.itemName).replace(/-/g, "").slice(0, 28)
      : slugifyShortPath(input.pillar).replace(/-/g, "").slice(0, 28);
  return `${prefix}-${item || "post"}-${d}`;
}

/** Vertical platforms need shorter thumbnail hooks. */
export function maxHookWordsForPlatform(platform: string): number {
  const p = (platform || "").toLowerCase();
  if (p === "tiktok" || p === "instagram" || p.startsWith("ig")) return 5;
  return 8;
}

export async function getContentCalendarConfig(
  tenantId: string,
): Promise<ContentCalendarConfig> {
  const [row] = await db
    .select()
    .from(contentCalendarConfigTable)
    .where(eq(contentCalendarConfigTable.tenantId, tenantId))
    .limit(1);
  if (row) return row;
  const inserted = {
    tenantId,
    enabled: true,
    nPosts: 14,
    pillarMix: { ...DEFAULT_PILLAR_MIX },
    tone: "warm, local, concrete",
    language: "en",
    cuisine: "restaurant",
    brandVoice: "",
    localEvents: [] as string[],
    prePeakMinutesMin: 90,
    prePeakMinutesMax: 120,
    updatedAt: new Date(),
    createdAt: new Date(),
  };
  await db.insert(contentCalendarConfigTable).values(inserted);
  return inserted as ContentCalendarConfig;
}

export async function upsertContentCalendarConfig(
  tenantId: string,
  patch: Partial<{
    enabled: boolean;
    nPosts: number;
    pillarMix: Record<string, number>;
    tone: string;
    language: string;
    cuisine: string;
    brandVoice: string;
    localEvents: string[];
    prePeakMinutesMin: number;
    prePeakMinutesMax: number;
  }>,
): Promise<ContentCalendarConfig> {
  await getContentCalendarConfig(tenantId);
  const nPosts =
    patch.nPosts != null
      ? Math.max(4, Math.min(31, Math.round(patch.nPosts)))
      : undefined;
  await db
    .update(contentCalendarConfigTable)
    .set({
      ...(patch.enabled != null ? { enabled: patch.enabled } : {}),
      ...(nPosts != null ? { nPosts } : {}),
      ...(patch.pillarMix ? { pillarMix: patch.pillarMix } : {}),
      ...(patch.tone != null ? { tone: patch.tone } : {}),
      ...(patch.language != null ? { language: patch.language } : {}),
      ...(patch.cuisine != null ? { cuisine: patch.cuisine } : {}),
      ...(patch.brandVoice != null ? { brandVoice: patch.brandVoice } : {}),
      ...(patch.localEvents ? { localEvents: patch.localEvents } : {}),
      ...(patch.prePeakMinutesMin != null
        ? { prePeakMinutesMin: patch.prePeakMinutesMin }
        : {}),
      ...(patch.prePeakMinutesMax != null
        ? { prePeakMinutesMax: patch.prePeakMinutesMax }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(contentCalendarConfigTable.tenantId, tenantId));
  return getContentCalendarConfig(tenantId);
}

export async function listContentCalendar(input: {
  tenantId: string;
  monthKey?: string;
  status?: string;
  pillar?: string;
}): Promise<ContentCalendarRow[]> {
  const clauses = [eq(contentCalendarTable.tenantId, input.tenantId)];
  if (input.monthKey) {
    clauses.push(eq(contentCalendarTable.monthKey, input.monthKey));
  }
  if (input.status) {
    clauses.push(eq(contentCalendarTable.status, input.status));
  }
  if (input.pillar) {
    clauses.push(eq(contentCalendarTable.pillar, input.pillar));
  }
  return db
    .select()
    .from(contentCalendarTable)
    .where(and(...clauses))
    .orderBy(contentCalendarTable.scheduledDate, contentCalendarTable.suggestedTime);
}

export async function getContentCalendarRow(
  tenantId: string,
  id: string,
): Promise<ContentCalendarRow | null> {
  const [row] = await db
    .select()
    .from(contentCalendarTable)
    .where(
      and(
        eq(contentCalendarTable.tenantId, tenantId),
        eq(contentCalendarTable.id, id),
      ),
    )
    .limit(1);
  return row ?? null;
}

function ensureLinkInCaption(caption: string, shortLink: string): string {
  if (!shortLink) return caption;
  if (caption.includes(shortLink) || /[?&]src=/i.test(caption)) {
    return caption;
  }
  return `${caption.trim()}\n\n${shortLink}`.trim();
}

export async function resolveShortLinkForPost(input: {
  tenantId: string;
  platform: string;
  scheduledDate: string;
  pillar: string;
  targetItemId: string | null;
  targetItemName: string | null;
}): Promise<{ srcSlug: string; shortLink: string; photoAssetId: string | null }> {
  const [tenant] = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.id, input.tenantId))
    .limit(1);
  if (!tenant) throw new Error("tenant not found");

  let itemName = input.targetItemName;
  let photoAssetId: string | null = null;
  let menuItemId = input.targetItemId;

  if (menuItemId) {
    const [item] = await db
      .select()
      .from(menuItemsTable)
      .where(
        and(
          eq(menuItemsTable.id, menuItemId),
          eq(menuItemsTable.tenantId, input.tenantId),
        ),
      )
      .limit(1);
    if (item) {
      if (!item.available) {
        throw new Error(`Item 86'd / unavailable: ${item.name}`);
      }
      itemName = item.name;
      if (item.imageUrl?.trim()) photoAssetId = item.id;
    }
  }

  let srcSlug = buildCalendarSrcSlug({
    platform: input.platform,
    itemName,
    scheduledDate: input.scheduledDate,
    pillar: input.pillar,
  });
  // Uniqueness: append suffix if collision
  for (let i = 0; i < 5; i++) {
    const [hit] = await db
      .select({ id: contentCalendarTable.id })
      .from(contentCalendarTable)
      .where(eq(contentCalendarTable.srcSlug, srcSlug))
      .limit(1);
    if (!hit) break;
    srcSlug = `${srcSlug.replace(/-\d+$/, "")}-${i + 2}`;
  }

  const shortLink = buildTrackedUrl({
    domain: tenant.domain,
    tenantSlug: tenant.slug,
    srcTag: srcSlug,
    menuItemId,
    menuItemName: itemName,
  });

  return { srcSlug, shortLink, photoAssetId };
}

export async function updateContentCalendarPost(input: {
  tenantId: string;
  id: string;
  hook?: string;
  caption?: string;
  hashtags?: string[];
  scheduledDate?: string;
  suggestedTime?: string;
  pillar?: string;
  ctaType?: string;
  platform?: string;
}): Promise<ContentCalendarRow> {
  const row = await getContentCalendarRow(input.tenantId, input.id);
  if (!row) throw new Error("post not found");
  if (row.status === "posted") throw new Error("cannot edit posted row");

  const hook = input.hook != null ? String(input.hook).trim() : row.hook;
  if (wordCount(hook) > 8) throw new Error("hook must be ≤8 words");
  let caption =
    input.caption != null ? String(input.caption).trim() : row.caption;
  if (captionHasBannedClaim(caption) || captionHasBannedClaim(hook)) {
    throw new Error("banned claim (superlative/health) — edit before save");
  }

  const scheduledDate = input.scheduledDate || String(row.scheduledDate);
  const platform = input.platform || row.platform;
  const pillar = input.pillar || row.pillar;

  let srcSlug = row.srcSlug;
  let shortLink = row.shortLink;
  let photoAssetId = row.photoAssetId;

  if (
    input.scheduledDate ||
    input.platform ||
    input.pillar ||
    input.caption != null
  ) {
    const links = await resolveShortLinkForPost({
      tenantId: input.tenantId,
      platform,
      scheduledDate,
      pillar,
      targetItemId: row.targetItemId,
      targetItemName: row.targetItemName,
    });
    // Keep existing src if only caption edit (attribution continuity)
    if (input.scheduledDate || input.platform) {
      srcSlug = links.srcSlug;
      shortLink = links.shortLink;
      photoAssetId = links.photoAssetId;
    }
  }

  caption = ensureLinkInCaption(caption, shortLink);

  await db
    .update(contentCalendarTable)
    .set({
      hook,
      caption,
      hashtags: input.hashtags ?? row.hashtags,
      scheduledDate,
      suggestedTime: input.suggestedTime ?? row.suggestedTime,
      pillar,
      ctaType: input.ctaType ?? row.ctaType,
      platform,
      srcSlug,
      shortLink,
      photoAssetId,
      updatedAt: new Date(),
    })
    .where(eq(contentCalendarTable.id, input.id));

  const updated = await getContentCalendarRow(input.tenantId, input.id);
  if (!updated) throw new Error("update failed");
  return updated;
}

export type ClaimRecheckCode =
  | "square_unavailable"
  | "not_top_seller"
  | "no_target_item";

/** Structured fail-closed error so the dashboard can offer a mark-posted override. */
export class ClaimRecheckError extends Error {
  readonly code: ClaimRecheckCode;
  constructor(code: ClaimRecheckCode, message: string) {
    super(message);
    this.name = "ClaimRecheckError";
    this.code = code;
  }
}

/**
 * Ranking claims (most-ordered, top seller, etc.) are stamped at generate time.
 * Re-check against live Square top products before approve / mark-posted.
 * Clears claim_recheck on success; fail-closed if Square is down or item dropped out.
 */
export async function revalidateContentClaimAtPublish(
  row: ContentCalendarRow,
): Promise<Record<string, unknown> | null> {
  const brief =
    row.designBrief && typeof row.designBrief === "object"
      ? ({ ...row.designBrief } as Record<string, unknown>)
      : {};
  const needs =
    brief.claim_recheck === true ||
    textHasRankingClaim(`${row.hook || ""}\n${row.caption || ""}`);
  if (!needs) return null;

  const itemName = String(row.targetItemName || "").trim();
  if (!itemName) {
    throw new ClaimRecheckError(
      "no_target_item",
      "This post has a ranking claim (e.g. most-ordered) but no menu item is set. Edit the post or clear the claim before continuing.",
    );
  }

  const [tenant] = await db
    .select({ slug: tenantsTable.slug })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, row.tenantId))
    .limit(1);
  if (!tenant?.slug) throw new Error("tenant not found");

  const topRes = await fetchSquareTopProducts(tenant.slug, 10);
  if (!topRes.ok) {
    throw new ClaimRecheckError(
      "square_unavailable",
      "Can't verify the ranking claim — Square sales data is unavailable right now. Retry later. If this post is already live on Facebook, you can mark it posted with a note that the claim was not re-checked.",
    );
  }
  const topRows = parseTopProductRows(topRes.data);
  const byQty = [...topRows].sort((a, b) => b.quantity - a.quantity);
  const ok =
    itemNameInTopProducts(itemName, topRows, 5) ||
    itemNameInTopProducts(itemName, byQty, 5);
  if (!ok) {
    throw new ClaimRecheckError(
      "not_top_seller",
      `Ranking claim may be outdated: "${itemName}" is not in current top sellers. Edit the caption before posting. If the post is already live, mark posted with a note.`,
    );
  }

  brief.claim_recheck = false;
  brief.claim_verified_at = new Date().toISOString();
  delete brief.claim_unverified_at;
  delete brief.claim_unverified_reason;
  delete brief.claim_unverified_by;
  return brief;
}

function briefWithUnverifiedClaim(
  row: ContentCalendarRow,
  note: string,
  forcedBy: string,
): Record<string, unknown> {
  const brief =
    row.designBrief && typeof row.designBrief === "object"
      ? ({ ...row.designBrief } as Record<string, unknown>)
      : {};
  brief.claim_recheck = false;
  brief.claim_unverified_at = new Date().toISOString();
  brief.claim_unverified_reason = note.trim().slice(0, 500);
  brief.claim_unverified_by = forcedBy.slice(0, 120);
  return brief;
}

export async function approveContentCalendarPost(input: {
  tenantId: string;
  id: string;
  approvedBy: string;
}): Promise<ContentCalendarRow> {
  const row = await getContentCalendarRow(input.tenantId, input.id);
  if (!row) throw new Error("post not found");
  if (row.status !== "draft" && row.status !== "skipped") {
    throw new Error(`cannot approve from status=${row.status}`);
  }
  if (captionHasBannedClaim(row.caption) || captionHasBannedClaim(row.hook)) {
    throw new Error("banned claim in caption/hook — edit first");
  }
  const verifiedBrief = await revalidateContentClaimAtPublish(row);
  const caption = ensureLinkInCaption(row.caption, row.shortLink);
  await db
    .update(contentCalendarTable)
    .set({
      status: "approved",
      approvedBy: input.approvedBy,
      approvedAt: new Date(),
      caption,
      skippedReason: null,
      ...(verifiedBrief ? { designBrief: verifiedBrief } : {}),
      updatedAt: new Date(),
    })
    .where(eq(contentCalendarTable.id, input.id));
  const updated = await getContentCalendarRow(input.tenantId, input.id);
  if (!updated) throw new Error("approve failed");
  return updated;
}

export async function skipContentCalendarPost(input: {
  tenantId: string;
  id: string;
  reason?: string;
}): Promise<ContentCalendarRow> {
  const row = await getContentCalendarRow(input.tenantId, input.id);
  if (!row) throw new Error("post not found");
  if (row.status === "posted") throw new Error("cannot skip posted");
  await db
    .update(contentCalendarTable)
    .set({
      status: "skipped",
      skippedReason: input.reason?.trim() || "skipped_by_human",
      updatedAt: new Date(),
    })
    .where(eq(contentCalendarTable.id, input.id));
  const updated = await getContentCalendarRow(input.tenantId, input.id);
  if (!updated) throw new Error("skip failed");
  return updated;
}

export async function rescheduleContentCalendarPost(input: {
  tenantId: string;
  id: string;
  scheduledDate: string;
  suggestedTime?: string;
}): Promise<ContentCalendarRow> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.scheduledDate)) {
    throw new Error("scheduledDate must be YYYY-MM-DD");
  }
  return updateContentCalendarPost({
    tenantId: input.tenantId,
    id: input.id,
    scheduledDate: input.scheduledDate,
    suggestedTime: input.suggestedTime,
  });
}

export async function markContentCalendarPosted(input: {
  tenantId: string;
  id: string;
  /**
   * Escape hatch when the post is already live (manual Facebook paste) but
   * claim revalidation cannot pass (Square down / item no longer top).
   * Requires forceNote for audit — approve stays fail-closed with no override.
   */
  forceUnverifiedClaim?: boolean;
  forceNote?: string;
  forcedBy?: string;
}): Promise<ContentCalendarRow> {
  const row = await getContentCalendarRow(input.tenantId, input.id);
  if (!row) throw new Error("post not found");
  if (row.status !== "approved" && row.status !== "scheduled") {
    throw new Error("approve before marking posted");
  }

  let designBrief: Record<string, unknown> | null = null;
  if (input.forceUnverifiedClaim) {
    const note = String(input.forceNote || "").trim();
    if (note.length < 8) {
      throw new Error(
        "To mark posted without claim verification, add a short note (why — e.g. already live on Facebook, Square down).",
      );
    }
    designBrief = briefWithUnverifiedClaim(
      row,
      note,
      input.forcedBy || "dashboard",
    );
  } else {
    // Re-check again at publish time — sales mix can drift after approve.
    designBrief = await revalidateContentClaimAtPublish(row);
  }

  await db
    .update(contentCalendarTable)
    .set({
      status: "posted",
      postedAt: new Date(),
      ...(designBrief ? { designBrief } : {}),
      updatedAt: new Date(),
    })
    .where(eq(contentCalendarTable.id, input.id));
  const updated = await getContentCalendarRow(input.tenantId, input.id);
  if (!updated) throw new Error("mark posted failed");
  return updated;
}

/** Multi-day lookback metrics for posted calendar rows (same closed-loop as social_posts). */
export async function refreshContentCalendarMetrics(
  tenantId: string,
): Promise<ContentCalendarRow[]> {
  const posts = await db
    .select()
    .from(contentCalendarTable)
    .where(
      and(
        eq(contentCalendarTable.tenantId, tenantId),
        eq(contentCalendarTable.status, "posted"),
      ),
    )
    .orderBy(desc(contentCalendarTable.postedAt))
    .limit(100);

  for (const post of posts) {
    const srcTag = String(post.srcSlug || "").trim().toLowerCase();
    if (!srcTag) continue;
    const srcMatch = sql`lower(coalesce(${qrScansTable.meta}->>'src','')) = ${srcTag}`;
    const botPat = QR_SCAN_BOT_UA_PATTERN;
    const clickRows = await db
      .select({
        human: sql<number>`count(*) filter (where not (coalesce(${qrScansTable.userAgent}, '') ~* ${botPat}))::int`,
      })
      .from(qrScansTable)
      .where(and(eq(qrScansTable.tenantId, tenantId), srcMatch));
    const clicks = Number(clickRows[0]?.human ?? 0);

    const orderRows = await db
      .select({
        c: sql<number>`count(*)::int`,
        rev: sql<number>`coalesce(sum(${ordersTable.totalCents}),0)::int`,
      })
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.tenantId, tenantId),
          eq(ordersTable.paymentStatus, "paid"),
          sql`lower(coalesce(${ordersTable.sourceDetail}->>'src','')) = ${srcTag}`,
          sqlExcludeOpsTestOrders(),
        ),
      );
    const orders = Number(orderRows[0]?.c ?? 0);
    const revenueCents = Number(orderRows[0]?.rev ?? 0);

    await db
      .update(contentCalendarTable)
      .set({
        clicks,
        orders,
        revenueCents,
        metricsUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(contentCalendarTable.id, post.id));
  }

  return listContentCalendar({ tenantId, status: "posted" });
}

export async function deleteDraftsForMonth(
  tenantId: string,
  monthKey: string,
): Promise<number> {
  const removable = await db
    .select({ id: contentCalendarTable.id })
    .from(contentCalendarTable)
    .where(
      and(
        eq(contentCalendarTable.tenantId, tenantId),
        eq(contentCalendarTable.monthKey, monthKey),
        inArray(contentCalendarTable.status, ["draft", "skipped"]),
      ),
    );
  if (!removable.length) return 0;
  await db.delete(contentCalendarTable).where(
    inArray(
      contentCalendarTable.id,
      removable.map((r) => r.id),
    ),
  );
  return removable.length;
}

export function monthKeyFromDate(d: Date | string): string {
  const s = typeof d === "string" ? d : d.toISOString().slice(0, 10);
  return s.slice(0, 7);
}

/** Suggest local HH:MM string N minutes before peak hour. */
export function suggestTimeBeforePeak(
  peakHour: number,
  minutesBefore: number,
): string {
  const total = peakHour * 60 - minutesBefore;
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

export function insertId(): string {
  return randomUUID();
}

export async function insertCalendarDrafts(
  rows: Array<typeof contentCalendarTable.$inferInsert>,
): Promise<ContentCalendarRow[]> {
  if (!rows.length) return [];
  await db.insert(contentCalendarTable).values(rows);
  logger.info(
    { count: rows.length, tenantId: rows[0]?.tenantId },
    "content calendar drafts inserted",
  );
  return listContentCalendar({
    tenantId: rows[0]!.tenantId,
    monthKey: rows[0]!.monthKey,
  });
}

/**
 * Paid orders from evergreen (non-content) surfaces — Page CTA, About, bio.
 * Separate from past_content_performance so CE does not treat them as post wins.
 */
export async function fetchEvergreenSurfaceAttribution(
  tenantId: string,
  lookbackDays = 45,
): Promise<
  Array<{
    src: string;
    surface: "page_cta" | "about" | "bio" | "other_evergreen";
    orders: number;
    revenueCents: number;
  }>
> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - lookbackDays);
  const rows = await db
    .select({
      sourceDetail: ordersTable.sourceDetail,
      totalCents: ordersTable.totalCents,
    })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.tenantId, tenantId),
        eq(ordersTable.paymentStatus, "paid"),
        gte(ordersTable.createdAt, since),
      ),
    );

  const map = new Map<
    string,
    { orders: number; revenueCents: number; surface: "page_cta" | "about" | "bio" | "other_evergreen" }
  >();
  for (const o of rows) {
    const detail = (o.sourceDetail ?? {}) as Record<string, unknown>;
    if (isOpsTestOrderDetail(detail)) continue;
    const src = String(detail.src ?? "")
      .trim()
      .toLowerCase();
    if (!isEvergreenSurfaceSrc(src)) continue;
    let surface: "page_cta" | "about" | "bio" | "other_evergreen" =
      "other_evergreen";
    if (src === "fb-page-cta" || src.startsWith("fb-page-cta-")) surface = "page_cta";
    else if (src === "fb-about" || src.startsWith("fb-about-")) surface = "about";
    else if (src.endsWith("-bio")) surface = "bio";
    const cur = map.get(src) ?? { orders: 0, revenueCents: 0, surface };
    cur.orders += 1;
    cur.revenueCents += o.totalCents || 0;
    map.set(src, cur);
  }
  return [...map.entries()]
    .map(([src, v]) => ({
      src,
      surface: v.surface,
      orders: v.orders,
      revenueCents: v.revenueCents,
    }))
    .sort((a, b) => b.orders - a.orders || b.revenueCents - a.revenueCents);
}

/** Past posted calendar + social_posts performance for AI input (multi-day lookback). */
export async function fetchPastContentPerformance(
  tenantId: string,
  lookbackDays = 45,
): Promise<
  Array<{
    src: string;
    item: string | null;
    clicks: number;
    orders: number;
    revenueCents: number;
    postedAt: string | null;
  }>
> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - lookbackDays);
  const cal = await db
    .select()
    .from(contentCalendarTable)
    .where(
      and(
        eq(contentCalendarTable.tenantId, tenantId),
        eq(contentCalendarTable.status, "posted"),
        gte(contentCalendarTable.postedAt, since),
      ),
    )
    .orderBy(desc(contentCalendarTable.orders))
    .limit(20);

  // Exclude Jul 16–20 attribution-incomplete window so the AI does not
  // treat click→0 gaps (bare FB links / first-touch bug) as real failures.
  return filterPastPerformanceForContentEngine(
    cal.map((r) => ({
      src: r.srcSlug,
      item: r.targetItemName,
      clicks: r.clicks,
      orders: r.orders,
      revenueCents: r.revenueCents,
      postedAt: r.postedAt?.toISOString() ?? null,
      platform: r.platform,
    })),
  );
}

export async function listAvailableMenuItems(tenantId: string): Promise<
  Array<{
    id: string;
    sku: string;
    name: string;
    imageUrl: string | null;
    available: boolean;
  }>
> {
  const items = await db
    .select({
      id: menuItemsTable.id,
      sku: menuItemsTable.sku,
      name: menuItemsTable.name,
      imageUrl: menuItemsTable.imageUrl,
      available: menuItemsTable.available,
    })
    .from(menuItemsTable)
    .where(
      and(
        eq(menuItemsTable.tenantId, tenantId),
        eq(menuItemsTable.available, true),
        eq(menuItemsTable.excludeFromContent, false),
      ),
    );
  return items.map((i) => ({
    id: i.id,
    sku: i.sku,
    name: i.name,
    imageUrl: i.imageUrl?.trim() || null,
    available: i.available,
  }));
}

export async function listMenuItemsWithPhotos(tenantId: string): Promise<
  Array<{
    id: string;
    sku: string;
    name: string;
    imageUrl: string;
    available: boolean;
  }>
> {
  const items = await listAvailableMenuItems(tenantId);
  return items
    .filter((i) => Boolean(i.imageUrl))
    .map((i) => ({
      id: i.id,
      sku: i.sku,
      name: i.name,
      imageUrl: i.imageUrl!,
      available: i.available,
    }));
}

export async function listUnavailableMenuItems(
  tenantId: string,
): Promise<Array<{ id: string; name: string }>> {
  // 86'd items + third-party / exclude_from_content — never promote either.
  const items = await db
    .select({
      id: menuItemsTable.id,
      name: menuItemsTable.name,
      available: menuItemsTable.available,
      excludeFromContent: menuItemsTable.excludeFromContent,
    })
    .from(menuItemsTable)
    .where(eq(menuItemsTable.tenantId, tenantId));
  return items
    .filter((i) => !i.available || i.excludeFromContent)
    .map((i) => ({ id: i.id, name: i.name }));
}
