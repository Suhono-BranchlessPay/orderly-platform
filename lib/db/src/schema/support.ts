import {
  pgTable,
  text,
  jsonb,
  timestamp,
  real,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Blok 3.2 — Automated support (knowledge base + chat + human escalate).
 * Answers come from KB retrieval only — never invents money/health/legal advice.
 */

export const SUPPORT_ESCALATION_STATUSES = [
  "open",
  "acknowledged",
  "resolved",
  "closed",
] as const;
export type SupportEscalationStatus =
  (typeof SUPPORT_ESCALATION_STATUSES)[number];

/** Platform-wide articles use tenant_id = "__platform__". */
export const SUPPORT_PLATFORM_TENANT_ID = "__platform__";

export const supportKbArticlesTable = pgTable(
  "support_kb_articles",
  {
    id: text("id").primaryKey(),
    /** "__platform__" = shared FAQ; otherwise a real tenant id. */
    tenantId: text("tenant_id").notNull(),
    slug: text("slug").notNull(),
    locale: text("locale").notNull().default("en"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("support_kb_tenant_locale_idx").on(table.tenantId, table.locale),
    index("support_kb_slug_idx").on(table.slug),
  ],
);

export const supportEscalationsTable = pgTable(
  "support_escalations",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    askedBy: text("asked_by"),
    question: text("question").notNull(),
    kbHitIds: jsonb("kb_hit_ids").$type<string[]>().notNull().default([]),
    confidence: real("confidence"),
    status: text("status").notNull().default("open"),
    note: text("note"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("support_escalations_tenant_status_idx").on(
      table.tenantId,
      table.status,
    ),
  ],
);

export const insertSupportKbArticleSchema = createInsertSchema(
  supportKbArticlesTable,
).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertSupportKbArticle = z.infer<
  typeof insertSupportKbArticleSchema
>;

export const insertSupportEscalationSchema = createInsertSchema(
  supportEscalationsTable,
).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertSupportEscalation = z.infer<
  typeof insertSupportEscalationSchema
>;
