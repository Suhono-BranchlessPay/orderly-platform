import {
  pgTable,
  text,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Blok 4.1 — Social media TRIAL skeleton (ONE tenant: Samurai Martinsville).
 * MODE AWAL: every outbound reply needs human approval — nothing here ever
 * auto-sends. See docs/BLOK4_SOCIAL_TRIAL.md for the hard rules.
 */
export const SOCIAL_PLATFORMS = ["facebook", "instagram"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const SOCIAL_DIRECTIONS = ["in", "out"] as const;
export type SocialDirection = (typeof SOCIAL_DIRECTIONS)[number];

/** Heuristic (keyword) classification — NOT ML. See lib/socialClassify.ts. */
export const SOCIAL_CLASSIFICATIONS = [
  "praise",
  "question",
  "complaint",
  "allergy_health",
  "spam",
  "unknown",
] as const;
export type SocialClassification = (typeof SOCIAL_CLASSIFICATIONS)[number];

export const SOCIAL_STATUSES = [
  "new",
  "drafted",
  "pending_approval",
  "approved",
  "sent",
  "skipped",
  "blocked",
] as const;
export type SocialInboxStatus = (typeof SOCIAL_STATUSES)[number];

export const SOCIAL_AUDIT_ACTIONS = [
  "approve",
  "edit",
  "skip",
  "send",
  "send_failed",
  "block",
  "kill_switch",
] as const;
export type SocialAuditAction = (typeof SOCIAL_AUDIT_ACTIONS)[number];

export const socialInboxTable = pgTable(
  "social_inbox",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    platform: text("platform").notNull(),
    externalThreadId: text("external_thread_id"),
    externalMessageId: text("external_message_id"),
    /** in = guest → us (webhook). out = our reply (audit trail only for now). */
    direction: text("direction").notNull().default("in"),
    authorName: text("author_name"),
    body: text("body"),
    /** Heuristic keyword classification — never ML, never a health/legal opinion. */
    classification: text("classification").notNull().default("unknown"),
    draftReply: text("draft_reply"),
    status: text("status").notNull().default("new"),
    /** Human-readable reasons the heuristic flagged this (e.g. "allergy_keyword:peanut"). */
    riskFlags: jsonb("risk_flags").$type<string[]>().notNull().default([]),
    /** Raw webhook payload for this message/comment — for debugging, never sent anywhere. */
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("social_inbox_tenant_status_idx").on(
      table.tenantId,
      table.status,
      table.createdAt,
    ),
    // Postgres treats NULLs as distinct in a unique index, so rows without an
    // external_message_id never collide — this only dedupes real webhook retries.
    uniqueIndex("social_inbox_dedupe_idx").on(
      table.tenantId,
      table.platform,
      table.externalMessageId,
    ),
  ],
);

export const insertSocialInboxSchema = createInsertSchema(
  socialInboxTable,
).omit({ createdAt: true, updatedAt: true });

export type SocialInboxRow = typeof socialInboxTable.$inferSelect;
export type InsertSocialInboxRow = z.infer<typeof insertSocialInboxSchema>;

/** Immutable audit trail — every human action on a social_inbox row. */
export const socialReplyAuditTable = pgTable(
  "social_reply_audit",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    inboxId: text("inbox_id").notNull(),
    action: text("action").notNull(),
    actor: text("actor").notNull(),
    beforeBody: text("before_body"),
    afterBody: text("after_body"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("social_reply_audit_inbox_idx").on(table.inboxId, table.createdAt),
    index("social_reply_audit_tenant_idx").on(
      table.tenantId,
      table.createdAt,
    ),
  ],
);

export const insertSocialReplyAuditSchema = createInsertSchema(
  socialReplyAuditTable,
).omit({ createdAt: true });

export type SocialReplyAudit = typeof socialReplyAuditTable.$inferSelect;
export type InsertSocialReplyAudit = z.infer<
  typeof insertSocialReplyAuditSchema
>;
