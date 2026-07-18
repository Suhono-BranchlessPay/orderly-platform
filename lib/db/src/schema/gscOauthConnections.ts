import { pgTable, text, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Google Search Console OAuth — one connection per tenant (per restaurant domain).
 * Refresh token encrypted at rest (same pattern as GBP). Never invent rankings.
 */
export const gscOauthConnectionsTable = pgTable(
  "gsc_oauth_connections",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    /** Search Console property, e.g. https://samurairesto.com/ or sc-domain:… */
    siteUrl: text("site_url").notNull(),
    googleEmail: text("google_email"),
    refreshTokenEnc: text("refresh_token_enc").notNull(),
    scopes: text("scopes").notNull().default(""),
    /** First day we saw Search Analytics rows (for honest "warming up" copy). */
    dataSince: text("data_since"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("gsc_oauth_connections_tenant_idx").on(table.tenantId)],
);

export const insertGscOauthConnectionSchema = createInsertSchema(
  gscOauthConnectionsTable,
).omit({ createdAt: true, updatedAt: true });

export type GscOauthConnection = typeof gscOauthConnectionsTable.$inferSelect;
export type InsertGscOauthConnection = z.infer<
  typeof insertGscOauthConnectionSchema
>;
