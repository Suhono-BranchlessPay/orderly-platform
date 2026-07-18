/**
 * AI Social Posting Engine — Stage 1.
 * Manual pick → facts-only draft → human approve → Malik posts manually → measure src.
 * NO Graph publish. Kill switch + require_approval always enforced.
 */
import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import {
  db,
  menuItemsTable,
  ordersTable,
  qrScansTable,
  socialPostingConfigTable,
  socialPostsTable,
  tenantsTable,
  type SocialPost,
  type SocialPostingConfig,
  type SocialPostAngle,
} from "@workspace/db";
import { isAiGatewayEnabled, run as aiRun } from "./ai";
import { getBrandVoiceHint, isSocialKillSwitchOn } from "./socialConfig";
import {
  buildSocialPostDraft,
  buildSrcTag,
  buildTrackedUrl,
  pickNextAngle,
  type SocialPostFacts,
} from "./socialPostDraft";
import { buildItemSales, type ReportRange } from "./dashboardReports";
import { QR_SCAN_BOT_UA_PATTERN } from "./qrScanBotFilter";

export function isSocialPostingEngineEnabled(): boolean {
  const v = process.env.ORDERLY_SOCIAL_POSTING_ENABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export async function getSocialPostingConfig(
  tenantId: string,
): Promise<SocialPostingConfig | null> {
  const rows = await db
    .select()
    .from(socialPostingConfigTable)
    .where(eq(socialPostingConfigTable.tenantId, tenantId))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertSocialPostingConfig(input: {
  tenantId: string;
  enabled?: boolean;
  frequency?: string;
  postTime?: string | null;
  platforms?: string[];
  requireApproval?: boolean;
  minDaysBetweenRepeat?: number;
  brandVoice?: string | null;
  language?: string;
  approvalTtlHours?: number;
}): Promise<SocialPostingConfig> {
  const existing = await getSocialPostingConfig(input.tenantId);
  const now = new Date();
  // Stage 1 product rule: require_approval stays true even if client sends false.
  const requireApproval = true;
  if (!existing) {
    await db.insert(socialPostingConfigTable).values({
      tenantId: input.tenantId,
      enabled: input.enabled ?? false,
      frequency: input.frequency ?? "3x_week",
      postTime: input.postTime ?? null,
      platforms: input.platforms ?? ["facebook"],
      requireApproval,
      minDaysBetweenRepeat: input.minDaysBetweenRepeat ?? 21,
      brandVoice: input.brandVoice ?? null,
      language: input.language ?? "en",
      approvalTtlHours: input.approvalTtlHours ?? 24,
      updatedAt: now,
      createdAt: now,
    });
  } else {
    await db
      .update(socialPostingConfigTable)
      .set({
        enabled: input.enabled ?? existing.enabled,
        frequency: input.frequency ?? existing.frequency,
        postTime:
          input.postTime !== undefined ? input.postTime : existing.postTime,
        platforms: input.platforms ?? existing.platforms,
        requireApproval,
        minDaysBetweenRepeat:
          input.minDaysBetweenRepeat ?? existing.minDaysBetweenRepeat,
        brandVoice:
          input.brandVoice !== undefined
            ? input.brandVoice
            : existing.brandVoice,
        language: input.language ?? existing.language,
        approvalTtlHours: input.approvalTtlHours ?? existing.approvalTtlHours,
        updatedAt: now,
      })
      .where(eq(socialPostingConfigTable.tenantId, input.tenantId));
  }
  const row = await getSocialPostingConfig(input.tenantId);
  if (!row) throw new Error("social posting config upsert failed");
  return row;
}

async function loadTenant(tenantId: string) {
  const rows = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Candidates: available items. Prefer those with photos (sorted first).
 * Stage 1 allows drafting without photo (Malik attaches in FB) but flags needsPhoto.
 */
export async function listSocialPostCandidates(input: {
  tenantId: string;
  range?: ReportRange;
}): Promise<
  Array<{
    menuItemId: string;
    name: string;
    description: string | null;
    category: string;
    price: number;
    imageUrl: string | null;
    needsPhoto: boolean;
    available: boolean;
    salesQty: number;
    salesCents: number;
    lastPostedAt: string | null;
  }>
> {
  const config = await getSocialPostingConfig(input.tenantId);
  const minDays = config?.minDaysBetweenRepeat ?? 21;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - minDays);

  const items = await db
    .select()
    .from(menuItemsTable)
    .where(
      and(
        eq(menuItemsTable.tenantId, input.tenantId),
        eq(menuItemsTable.available, true),
      ),
    );

  const sales = await buildItemSales({
    tenantId: input.tenantId,
    range: input.range ?? "28d",
  });
  const salesById = new Map(
    sales.items.map((s) => [
      s.menu_item_id,
      { qty: s.qty, sales_cents: s.sales_cents },
    ]),
  );

  const recentPosted = await db
    .select({
      menuItemId: socialPostsTable.menuItemId,
      postedAt: socialPostsTable.postedAt,
    })
    .from(socialPostsTable)
    .where(
      and(
        eq(socialPostsTable.tenantId, input.tenantId),
        eq(socialPostsTable.status, "posted"),
        gte(socialPostsTable.postedAt, cutoff),
      ),
    );
  const cooldown = new Set(recentPosted.map((r) => r.menuItemId));

  const lastPostedMap = new Map<string, Date>();
  for (const r of recentPosted) {
    if (!r.postedAt) continue;
    const prev = lastPostedMap.get(r.menuItemId);
    if (!prev || r.postedAt > prev) lastPostedMap.set(r.menuItemId, r.postedAt);
  }

  return items
    .filter((i) => !cooldown.has(i.id))
    .map((i) => {
      const s = salesById.get(i.id);
      const imageUrl = i.imageUrl?.trim() || null;
      return {
        menuItemId: i.id,
        name: i.name,
        description: i.description,
        category: i.category,
        price: i.price,
        imageUrl,
        needsPhoto: !imageUrl,
        available: i.available,
        salesQty: s?.qty ?? 0,
        salesCents: s?.sales_cents ?? 0,
        lastPostedAt: lastPostedMap.get(i.id)?.toISOString() ?? null,
      };
    })
    .sort((a, b) => {
      // Photo-ready first, then by sales
      if (a.needsPhoto !== b.needsPhoto) return a.needsPhoto ? 1 : -1;
      return b.salesCents - a.salesCents;
    });
}

export async function createSocialPostDraft(input: {
  tenantId: string;
  menuItemId: string;
  platform?: string;
  angle?: SocialPostAngle;
  srcTagOverride?: string;
}): Promise<SocialPost> {
  if (isSocialKillSwitchOn(input.tenantId)) {
    throw new Error("Social kill switch is ON for this tenant");
  }
  const tenant = await loadTenant(input.tenantId);
  if (!tenant) throw new Error("Tenant not found");

  const items = await db
    .select()
    .from(menuItemsTable)
    .where(
      and(
        eq(menuItemsTable.tenantId, input.tenantId),
        eq(menuItemsTable.id, input.menuItemId),
      ),
    )
    .limit(1);
  const item = items[0];
  if (!item) throw new Error("Menu item not found");
  if (!item.available) {
    throw new Error("Item is not available (86'd) — do not post");
  }
  // Stage 1: allow missing photo (Malik attaches in Facebook). Stage 2+ should prefer photo-ready.

  const config = await getSocialPostingConfig(input.tenantId);
  const platform = (
    input.platform ||
    config?.platforms?.[0] ||
    "facebook"
  ).toLowerCase();

  const recentAngles = await db
    .select({ angle: socialPostsTable.angle })
    .from(socialPostsTable)
    .where(eq(socialPostsTable.tenantId, input.tenantId))
    .orderBy(desc(socialPostsTable.createdAt))
    .limit(6);
  const angle =
    input.angle ||
    pickNextAngle(recentAngles.map((r) => r.angle));

  const srcTag =
    input.srcTagOverride?.trim().toLowerCase() ||
    buildSrcTag({ platform, itemName: item.name });
  const trackedUrl = buildTrackedUrl({
    domain: tenant.domain,
    tenantSlug: tenant.slug,
    srcTag,
    menuItemId: item.id,
    menuItemName: item.name,
  });

  const brandVoice =
    config?.brandVoice?.trim() || getBrandVoiceHint(input.tenantId);
  const facts: SocialPostFacts = {
    itemName: item.name,
    description: item.description,
    priceDollars: item.price,
    category: item.category,
    restaurantName: tenant.name,
    city: tenant.city,
    state: tenant.state,
    brandVoiceHint: brandVoice,
    language: config?.language || tenant.languages?.[0] || "en",
  };

  // Deterministic template is the guaranteed baseline / fallback.
  const draft = buildSocialPostDraft({ facts, angle, trackedUrl });

  // Prefer an AI-written, warm, local caption via the gateway (writing-strong
  // provider, e.g. Claude). Falls back to the template if the gateway is off,
  // routing fails, or the output is invalid — post creation never breaks.
  let finalCaption = draft.caption;
  let finalHashtags = draft.hashtags;
  let finalCta = draft.cta;
  let finalFullPost = draft.fullPost;
  let generator: "ai" | "template" = "template";
  let aiModel: string | null = null;
  let aiNotes: string | null = null;

  if (isAiGatewayEnabled()) {
    try {
      const theme = (tenant.theme ?? {}) as Record<string, unknown>;
      const cuisineType =
        typeof theme.cuisine_type === "string" ? theme.cuisine_type : "restaurant";
      const ai = await aiRun({
        task: "social_post_draft",
        tenantId: input.tenantId,
        language: facts.language,
        input: {
          restaurant_name: facts.restaurantName,
          cuisine_type: cuisineType,
          city: facts.city ?? "",
          state: facts.state ?? "",
          nearby_towns: "",
          hours: "",
          item_name: facts.itemName,
          item_description: facts.description ?? "",
          price: `$${facts.priceDollars.toFixed(2)}`,
          order_url: trackedUrl,
          brand_voice_notes: facts.brandVoiceHint,
          angle,
          language: facts.language,
        },
        opts: { maxTokens: 400, responseFormat: "json" },
      });
      if (ai.ok && ai.output && typeof ai.output === "object") {
        const out = ai.output as { caption?: string; notes?: string };
        const cap = (out.caption ?? "").trim();
        if (cap) {
          finalCaption = cap;
          // Guarantee the closed-loop tracked link is present.
          finalCta = cap.includes(trackedUrl) ? "" : `Order online → ${trackedUrl}`;
          // AI bakes hashtags into the caption — keep the column empty so the
          // reconstructed fullPost (caption + cta + hashtags) is not duplicated.
          finalHashtags = "";
          finalFullPost = `${finalCaption}${finalCta ? `\n\n${finalCta}` : ""}`.trim();
          generator = "ai";
          aiModel = `${ai.provider}/${ai.model}`;
          aiNotes = (out.notes ?? "").trim() || null;
        }
      }
    } catch {
      /* non-fatal — keep the deterministic template draft */
    }
  }

  const ttlHours = config?.approvalTtlHours ?? 24;
  const expiresAt = new Date(Date.now() + ttlHours * 3600_000);
  const now = new Date();
  const id = `sp_${randomUUID().replace(/-/g, "").slice(0, 22)}`;

  await db.insert(socialPostsTable).values({
    id,
    tenantId: input.tenantId,
    menuItemId: item.id,
    menuItemName: item.name,
    platform,
    status: "pending_approval",
    angle,
    draftCaption: finalCaption,
    hashtags: finalHashtags,
    cta: finalCta,
    trackedUrl,
    srcTag,
    imageUrl: item.imageUrl,
    facts: {
      ...facts,
      fullPost: finalFullPost,
      generator,
      ai_model: aiModel,
      ai_notes: aiNotes,
      rules: [
        "facts_only_from_pos",
        "no_health_claims_invented",
        "no_discounts_invented",
        "no_rankings_invented",
        "human_approval_required",
        "no_auto_post_stage1",
      ],
    },
    expiresAt,
    createdAt: now,
    updatedAt: now,
  });

  const rows = await db
    .select()
    .from(socialPostsTable)
    .where(eq(socialPostsTable.id, id))
    .limit(1);
  return rows[0]!;
}

export async function updateSocialPostCaption(input: {
  tenantId: string;
  postId: string;
  draftCaption?: string;
  hashtags?: string;
  cta?: string;
}): Promise<SocialPost> {
  const rows = await db
    .select()
    .from(socialPostsTable)
    .where(
      and(
        eq(socialPostsTable.id, input.postId),
        eq(socialPostsTable.tenantId, input.tenantId),
      ),
    )
    .limit(1);
  const post = rows[0];
  if (!post) throw new Error("Post not found");
  if (!["draft", "pending_approval", "approved"].includes(post.status)) {
    throw new Error("Post is not editable in current status");
  }
  await db
    .update(socialPostsTable)
    .set({
      draftCaption: input.draftCaption ?? post.draftCaption,
      hashtags: input.hashtags ?? post.hashtags,
      cta: input.cta ?? post.cta,
      updatedAt: new Date(),
    })
    .where(eq(socialPostsTable.id, post.id));
  const updated = await db
    .select()
    .from(socialPostsTable)
    .where(eq(socialPostsTable.id, post.id))
    .limit(1);
  return updated[0]!;
}

export async function approveSocialPost(input: {
  tenantId: string;
  postId: string;
  approvedBy: string;
}): Promise<SocialPost> {
  if (isSocialKillSwitchOn(input.tenantId)) {
    throw new Error("Social kill switch is ON");
  }
  const rows = await db
    .select()
    .from(socialPostsTable)
    .where(
      and(
        eq(socialPostsTable.id, input.postId),
        eq(socialPostsTable.tenantId, input.tenantId),
      ),
    )
    .limit(1);
  const post = rows[0];
  if (!post) throw new Error("Post not found");
  if (post.expiresAt && post.expiresAt < new Date()) {
    await db
      .update(socialPostsTable)
      .set({
        status: "expired",
        skippedReason: "Approval window expired",
        updatedAt: new Date(),
      })
      .where(eq(socialPostsTable.id, post.id));
    throw new Error("Draft expired — generate a fresh one");
  }
  // Re-check availability before approve
  const items = await db
    .select({ available: menuItemsTable.available })
    .from(menuItemsTable)
    .where(eq(menuItemsTable.id, post.menuItemId))
    .limit(1);
  if (items[0] && !items[0].available) {
    throw new Error("Item became unavailable — skip this draft");
  }
  await db
    .update(socialPostsTable)
    .set({
      status: "approved",
      approvedBy: input.approvedBy,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(socialPostsTable.id, post.id));
  const updated = await db
    .select()
    .from(socialPostsTable)
    .where(eq(socialPostsTable.id, post.id))
    .limit(1);
  return updated[0]!;
}

export async function skipSocialPost(input: {
  tenantId: string;
  postId: string;
  reason?: string;
}): Promise<SocialPost> {
  await db
    .update(socialPostsTable)
    .set({
      status: "skipped",
      skippedReason: input.reason?.trim() || "Skipped by reviewer",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(socialPostsTable.id, input.postId),
        eq(socialPostsTable.tenantId, input.tenantId),
      ),
    );
  const updated = await db
    .select()
    .from(socialPostsTable)
    .where(eq(socialPostsTable.id, input.postId))
    .limit(1);
  if (!updated[0]) throw new Error("Post not found");
  return updated[0];
}

/** Stage 1: Malik pasted to Facebook — record posted_at. Does NOT call Meta Graph. */
export async function markSocialPostPosted(input: {
  tenantId: string;
  postId: string;
  postedBy: string;
}): Promise<SocialPost> {
  if (isSocialKillSwitchOn(input.tenantId)) {
    throw new Error("Social kill switch is ON");
  }
  const rows = await db
    .select()
    .from(socialPostsTable)
    .where(
      and(
        eq(socialPostsTable.id, input.postId),
        eq(socialPostsTable.tenantId, input.tenantId),
      ),
    )
    .limit(1);
  const post = rows[0];
  if (!post) throw new Error("Post not found");
  if (post.status !== "approved" && post.status !== "pending_approval") {
    throw new Error("Approve the draft before marking posted");
  }
  // Final availability check — fatal to promote 86'd items
  const items = await db
    .select({ available: menuItemsTable.available })
    .from(menuItemsTable)
    .where(eq(menuItemsTable.id, post.menuItemId))
    .limit(1);
  if (items[0] && !items[0].available) {
    throw new Error("Item is 86'd — do not post");
  }
  const now = new Date();
  await db
    .update(socialPostsTable)
    .set({
      status: "posted",
      postedAt: now,
      postedBy: input.postedBy,
      approvedBy: post.approvedBy || input.postedBy,
      approvedAt: post.approvedAt || now,
      updatedAt: now,
    })
    .where(eq(socialPostsTable.id, post.id));
  const updated = await db
    .select()
    .from(socialPostsTable)
    .where(eq(socialPostsTable.id, post.id))
    .limit(1);
  return updated[0]!;
}

export async function listSocialPosts(input: {
  tenantId: string;
  status?: string;
  limit?: number;
}): Promise<SocialPost[]> {
  const parts = [eq(socialPostsTable.tenantId, input.tenantId)];
  if (input.status) parts.push(eq(socialPostsTable.status, input.status));
  return db
    .select()
    .from(socialPostsTable)
    .where(and(...parts))
    .orderBy(desc(socialPostsTable.createdAt))
    .limit(input.limit ?? 50);
}

/**
 * Closed-loop metrics: human clicks from qr_scans.meta.src + paid orders by
 * source_detail.src. Bot/scraper hits (facebookexternalhit, curl, …) are
 * excluded from `clicks` so ROI isn't inflated by link-preview crawlers.
 * Never invents — empty = zeros.
 */
export async function refreshSocialPostMetrics(
  tenantId: string,
): Promise<
  Array<{
    id: string;
    menuItemName: string;
    srcTag: string;
    platform: string;
    status: string;
    postedAt: Date | null;
    angle: string;
    /** Human clicks only (ROI). */
    clicks: number;
    /** Scraper / preview bots — shown for transparency, not used for ROI. */
    botClicks: number;
    orders: number;
    revenueCents: number;
    trackedUrl: string;
  }>
> {
  const posts = await db
    .select()
    .from(socialPostsTable)
    .where(
      and(
        eq(socialPostsTable.tenantId, tenantId),
        eq(socialPostsTable.status, "posted"),
      ),
    )
    .orderBy(desc(socialPostsTable.postedAt))
    .limit(100);

  const out: Array<{
    id: string;
    menuItemName: string;
    srcTag: string;
    platform: string;
    status: string;
    postedAt: Date | null;
    angle: string;
    clicks: number;
    botClicks: number;
    orders: number;
    revenueCents: number;
    trackedUrl: string;
  }> = [];

  for (const post of posts) {
    const srcMatch = sql`lower(coalesce(${qrScansTable.meta}->>'src','')) = ${post.srcTag}`;
    const botPat = QR_SCAN_BOT_UA_PATTERN;
    const clickRows = await db
      .select({
        human: sql<number>`count(*) filter (where not (coalesce(${qrScansTable.userAgent}, '') ~* ${botPat}))::int`,
        bot: sql<number>`count(*) filter (where (coalesce(${qrScansTable.userAgent}, '') ~* ${botPat}))::int`,
      })
      .from(qrScansTable)
      .where(and(eq(qrScansTable.tenantId, tenantId), srcMatch));
    const clicks = Number(clickRows[0]?.human ?? 0);
    const botClicks = Number(clickRows[0]?.bot ?? 0);

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
          sql`lower(coalesce(${ordersTable.sourceDetail}->>'src','')) = ${post.srcTag}`,
        ),
      );
    const orders = Number(orderRows[0]?.c ?? 0);
    const revenueCents = Number(orderRows[0]?.rev ?? 0);

    await db
      .update(socialPostsTable)
      .set({
        clicks,
        orders,
        revenueCents,
        metricsUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(socialPostsTable.id, post.id));

    out.push({
      id: post.id,
      menuItemName: post.menuItemName,
      srcTag: post.srcTag,
      platform: post.platform,
      status: post.status,
      postedAt: post.postedAt,
      angle: post.angle,
      clicks,
      botClicks,
      orders,
      revenueCents,
      trackedUrl: post.trackedUrl,
    });
  }
  return out;
}

/** Find menu item by name substring (e.g. "steak bento" / "beef bento"). */
export async function findMenuItemByName(
  tenantId: string,
  query: string,
): Promise<typeof menuItemsTable.$inferSelect | null> {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const items = await db
    .select()
    .from(menuItemsTable)
    .where(eq(menuItemsTable.tenantId, tenantId));
  const hit =
    items.find((i) => i.name.toLowerCase() === q) ||
    items.find((i) => i.name.toLowerCase().includes(q)) ||
    items.find((i) => q.includes("beef") && i.name.toLowerCase().includes("steak") && i.name.toLowerCase().includes("bento"));
  return hit ?? null;
}
