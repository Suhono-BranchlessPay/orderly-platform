import { pgTable, text, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Self-serve Meta Page OAuth connections (dev / allow-listed tenants).
 * Page access token encrypted at rest. Do NOT enable for third-party Pages
 * until Meta Advanced Access is approved (META_PAGE_OAUTH_PUBLIC=1).
 */
export const metaOauthConnectionsTable = pgTable(
  "meta_oauth_connections",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    pageId: text("page_id").notNull(),
    pageName: text("page_name"),
    /** AES-256-GCM — never plaintext. */
    pageAccessTokenEnc: text("page_access_token_enc").notNull(),
    scopes: text("scopes").notNull().default(""),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("meta_oauth_connections_tenant_idx").on(table.tenantId),
  ],
);

export const insertMetaOauthConnectionSchema = createInsertSchema(
  metaOauthConnectionsTable,
).omit({ createdAt: true, updatedAt: true });

export type MetaOauthConnection =
  typeof metaOauthConnectionsTable.$inferSelect;
export type InsertMetaOauthConnection = z.infer<
  typeof insertMetaOauthConnectionSchema
>;
