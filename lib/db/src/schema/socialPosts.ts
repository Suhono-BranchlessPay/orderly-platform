import {
  pgTable,
  text,
  boolean,
  integer,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * AI Social Posting Engine — Stage 1 (manual-assisted).
 * Outbound drafts for Malik to post manually. NO auto-publish to Meta.
 * Closed loop via src_tag → qr_scans + orders.source_detail.
 * See docs/SOCIAL_POSTING_STAGE1.md.
 */

export const SOCIAL_POST_PLATFORMS = [
  "facebook",
  "instagram",
  "tiktok",
] as const;
export type SocialPostPlatform = (typeof SOCIAL_POST_PLATFORMS)[number];

export const SOCIAL_POST_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "posted",
  "skipped",
  "expired",
] as const;
export type SocialPostStatus = (typeof SOCIAL_POST_STATUSES)[number];

/** Copy angles — rotate so posts don't become AI slop. */
export const SOCIAL_POST_ANGLES = [
  "appetite",
  "value",
  "convenience",
  "story",
  "question",
  "seasonal",
] as const;
export type SocialPostAngle = (typeof SOCIAL_POST_ANGLES)[number];

export const socialPostingConfigTable = pgTable("social_posting_config", {
  tenantId: text("tenant_id").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  /** daily | weekdays | 3x_week — Stage 2 scheduler; Stage 1 ignores. */
  frequency: text("frequency").notNull().default("3x_week"),
  /** Local HH:MM for prime post time (override). Null = derive later. */
  postTime: text("post_time"),
  platforms: jsonb("platforms")
    .$type<string[]>()
    .notNull()
    .default(["facebook"]),
  /** Stage 1 always true in product logic even if flipped. */
  requireApproval: boolean("require_approval").notNull().default(true),
  minDaysBetweenRepeat: integer("min_days_between_repeat").notNull().default(21),
  brandVoice: text("brand_voice"),
  language: text("language").notNull().default("en"),
  /** Hours before an unapproved draft expires (skip). */
  approvalTtlHours: integer("approval_ttl_hours").notNull().default(24),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Draft queue + history (SPEC social_post_history + review queue).
 * status=posted rows are the closed-loop history.
 */
export const socialPostsTable = pgTable(
  "social_posts",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    menuItemId: text("menu_item_id").notNull(),
    menuItemName: text("menu_item_name").notNull(),
    platform: text("platform").notNull().default("facebook"),
    status: text("status").notNull().default("draft"),
    angle: text("angle").notNull().default("appetite"),
    draftCaption: text("draft_caption").notNull().default(""),
    hashtags: text("hashtags").notNull().default(""),
    cta: text("cta").notNull().default(""),
    /** Full tracked URL for the post. */
    trackedUrl: text("tracked_url").notNull(),
    /** Unique attribution tag, e.g. fb-steakbento-20260715 */
    srcTag: text("src_tag").notNull(),
    imageUrl: text("image_url"),
    /** Facts snapshot used for the draft (audit — no invented claims). */
    facts: jsonb("facts").$type<Record<string, unknown>>().notNull().default({}),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at"),
    postedAt: timestamp("posted_at"),
    postedBy: text("posted_by"),
    skippedReason: text("skipped_reason"),
    expiresAt: timestamp("expires_at"),
    /** Cached metrics (refreshed on report load — never invented). */
    clicks: integer("clicks").notNull().default(0),
    orders: integer("orders").notNull().default(0),
    revenueCents: integer("revenue_cents").notNull().default(0),
    metricsUpdatedAt: timestamp("metrics_updated_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("social_posts_tenant_status_idx").on(t.tenantId, t.status),
    index("social_posts_tenant_src_idx").on(t.tenantId, t.srcTag),
    index("social_posts_tenant_item_posted_idx").on(
      t.tenantId,
      t.menuItemId,
      t.postedAt,
    ),
  ],
);

export type SocialPostingConfig = typeof socialPostingConfigTable.$inferSelect;
export type SocialPost = typeof socialPostsTable.$inferSelect;
