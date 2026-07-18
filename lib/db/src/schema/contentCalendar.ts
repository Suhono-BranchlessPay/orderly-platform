import {
  pgTable,
  text,
  date,
  time,
  jsonb,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Content Engine Phase 1 — monthly content calendar (human approve before publish).
 * Distinct from social_posts (single-item draft queue) and social_inbox (replies).
 * Timestamps use timestamptz — naive UTC columns misled ops twice (Jul 2026).
 */

export const CONTENT_PILLARS = [
  "hero_product",
  "customer_voice",
  "menu_education",
  "behind_scenes",
  "community_local",
  "offer_cta",
  "timely",
] as const;
export type ContentPillar = (typeof CONTENT_PILLARS)[number];

export const CONTENT_CTA_TYPES = [
  "order_online",
  "visit",
  "engage",
] as const;
export type ContentCtaType = (typeof CONTENT_CTA_TYPES)[number];

export const CONTENT_PLATFORMS = [
  "facebook",
  "instagram",
  "gbp",
  "blog",
] as const;
export type ContentPlatform = (typeof CONTENT_PLATFORMS)[number];

export const CONTENT_CALENDAR_STATUSES = [
  "draft",
  "approved",
  "scheduled",
  "posted",
  "skipped",
] as const;
export type ContentCalendarStatus = (typeof CONTENT_CALENDAR_STATUSES)[number];

/** Default pillar mix (%). Overridable per tenant via content_calendar_config. */
export const DEFAULT_PILLAR_MIX: Record<ContentPillar, number> = {
  hero_product: 30,
  customer_voice: 15,
  menu_education: 15,
  behind_scenes: 10,
  community_local: 10,
  offer_cta: 15,
  timely: 5,
};

export const contentCalendarConfigTable = pgTable("content_calendar_config", {
  tenantId: text("tenant_id").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  nPosts: integer("n_posts").notNull().default(14),
  pillarMix: jsonb("pillar_mix")
    .$type<Record<string, number>>()
    .notNull()
    .default(DEFAULT_PILLAR_MIX),
  tone: text("tone").notNull().default("warm, local, concrete"),
  language: text("language").notNull().default("en"),
  cuisine: text("cuisine").notNull().default("restaurant"),
  brandVoice: text("brand_voice").notNull().default(""),
  localEvents: jsonb("local_events").$type<string[]>().notNull().default([]),
  prePeakMinutesMin: integer("pre_peak_minutes_min").notNull().default(90),
  prePeakMinutesMax: integer("pre_peak_minutes_max").notNull().default(120),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const contentCalendarTable = pgTable(
  "content_calendar",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    scheduledDate: date("scheduled_date").notNull(),
    suggestedTime: time("suggested_time"),
    pillar: text("pillar").notNull(),
    targetItemId: text("target_item_id"),
    targetItemName: text("target_item_name"),
    hook: text("hook").notNull().default(""),
    caption: text("caption").notNull().default(""),
    hashtags: jsonb("hashtags").$type<string[]>().notNull().default([]),
    ctaType: text("cta_type").notNull().default("order_online"),
    platform: text("platform").notNull().default("facebook"),
    /** Unique attribution tag, e.g. fb-hibachichicken-20260718 */
    srcSlug: text("src_slug").notNull(),
    /** Full tracked URL (/s/{slug}?src=…) */
    shortLink: text("short_link").notNull(),
    /** menu_item id when photo exists; null = needs new photo */
    photoAssetId: text("photo_asset_id"),
    designBrief: jsonb("design_brief")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    status: text("status").notNull().default("draft"),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    skippedReason: text("skipped_reason"),
    /** Human clicks (bots filtered) — refreshed like social_posts. */
    clicks: integer("clicks").notNull().default(0),
    orders: integer("orders").notNull().default(0),
    revenueCents: integer("revenue_cents").notNull().default(0),
    metricsUpdatedAt: timestamp("metrics_updated_at", { withTimezone: true }),
    /** Generation month key YYYY-MM for idempotent regenerate. */
    monthKey: text("month_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("content_calendar_src_slug_uidx").on(t.srcSlug),
    index("content_calendar_tenant_date_idx").on(t.tenantId, t.scheduledDate),
    index("content_calendar_tenant_status_idx").on(t.tenantId, t.status),
    index("content_calendar_tenant_month_idx").on(t.tenantId, t.monthKey),
  ],
);

export type ContentCalendarConfig = typeof contentCalendarConfigTable.$inferSelect;
export type ContentCalendarRow = typeof contentCalendarTable.$inferSelect;
