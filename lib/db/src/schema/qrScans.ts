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
 * Dynamic QR landing scans — GET /r/:tenantSlug.
 * Analytics only; never invent historical scan counts without rows here.
 */
export const qrScansTable = pgTable(
  "qr_scans",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    tenantSlug: text("tenant_slug").notNull(),
    redirectUrl: text("redirect_url").notNull(),
    userAgent: text("user_agent"),
    ipHash: text("ip_hash"),
    referer: text("referer"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("qr_scans_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("qr_scans_slug_created_idx").on(table.tenantSlug, table.createdAt),
  ],
);

export const insertQrScanSchema = createInsertSchema(qrScansTable).omit({
  createdAt: true,
});

export type QrScan = typeof qrScansTable.$inferSelect;
export type InsertQrScan = z.infer<typeof insertQrScanSchema>;
