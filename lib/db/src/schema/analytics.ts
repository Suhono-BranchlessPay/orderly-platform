import {
  pgTable,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Funnel / product analytics — write-only from storefront & apps.
 * Never invent historical funnel metrics without these rows.
 */
export const analyticsEventsTable = pgTable(
  "analytics_events",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    sessionId: text("session_id").notNull(),
    eventType: text("event_type").notNull(),
    itemId: text("item_id"),
    orderId: text("order_id"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("analytics_events_tenant_created_idx").on(
      table.tenantId,
      table.createdAt,
    ),
    index("analytics_events_tenant_type_created_idx").on(
      table.tenantId,
      table.eventType,
      table.createdAt,
    ),
  ],
);

export const insertAnalyticsEventSchema = createInsertSchema(
  analyticsEventsTable,
).omit({ createdAt: true });

export type AnalyticsEvent = typeof analyticsEventsTable.$inferSelect;
export type InsertAnalyticsEvent = z.infer<typeof insertAnalyticsEventSchema>;
