import {
  pgTable,
  text,
  jsonb,
  timestamp,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import {
  SOCIAL_CLASSIFICATIONS,
  SOCIAL_STATUSES,
  SOCIAL_AUDIT_ACTIONS,
  type SocialClassification,
  type SocialInboxStatus,
  type SocialAuditAction,
} from "./socialInbox";

/**
 * Blok 4.2 — Google Business Profile TRIAL skeleton (ONE tenant: samurai).
 * Reviews + Q&A inbox. Human approve only — nothing auto-sends.
 * See docs/BLOK4_GBP_TRIAL.md.
 */

export const GBP_KINDS = ["review", "question"] as const;
export type GbpKind = (typeof GBP_KINDS)[number];

/** Reuse social heuristic labels so draft/block rules stay identical. */
export const GBP_CLASSIFICATIONS = SOCIAL_CLASSIFICATIONS;
export type GbpClassification = SocialClassification;

export const GBP_STATUSES = SOCIAL_STATUSES;
export type GbpInboxStatus = SocialInboxStatus;

export const GBP_AUDIT_ACTIONS = SOCIAL_AUDIT_ACTIONS;
export type GbpAuditAction = SocialAuditAction;

export const gbpInboxTable = pgTable(
  "gbp_inbox",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    /** review = star review; question = GBP Q&A. */
    kind: text("kind").notNull(),
    externalLocationId: text("external_location_id"),
    externalMessageId: text("external_message_id"),
    authorName: text("author_name"),
    body: text("body"),
    /** 1–5 for reviews; null for questions. */
    starRating: integer("star_rating"),
    classification: text("classification").notNull().default("unknown"),
    draftReply: text("draft_reply"),
    status: text("status").notNull().default("new"),
    riskFlags: jsonb("risk_flags").$type<string[]>().notNull().default([]),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("gbp_inbox_tenant_status_idx").on(
      table.tenantId,
      table.status,
      table.createdAt,
    ),
    uniqueIndex("gbp_inbox_dedupe_idx").on(
      table.tenantId,
      table.kind,
      table.externalMessageId,
    ),
  ],
);

export const insertGbpInboxSchema = createInsertSchema(gbpInboxTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type GbpInboxRow = typeof gbpInboxTable.$inferSelect;
export type InsertGbpInboxRow = z.infer<typeof insertGbpInboxSchema>;

export const gbpReplyAuditTable = pgTable(
  "gbp_reply_audit",
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
    index("gbp_reply_audit_inbox_idx").on(table.inboxId, table.createdAt),
    index("gbp_reply_audit_tenant_idx").on(table.tenantId, table.createdAt),
  ],
);

export const insertGbpReplyAuditSchema = createInsertSchema(
  gbpReplyAuditTable,
).omit({ createdAt: true });

export type GbpReplyAudit = typeof gbpReplyAuditTable.$inferSelect;
export type InsertGbpReplyAudit = z.infer<typeof insertGbpReplyAuditSchema>;
