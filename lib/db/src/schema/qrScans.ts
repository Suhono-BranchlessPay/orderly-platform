import {
  pgTable,
  text,
  jsonb,
  timestamp,
  serial,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Dynamic QR landing scans — GET /r/:tenantSlug.
 * Matches production table created by earlier QR work (serial id + scanned_at).
 * Additive columns: redirect_url, meta (src tracking).
 */
export const qrScansTable = pgTable(
  "qr_scans",
  {
    id: serial("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    tenantSlug: text("slug").notNull(),
    redirectUrl: text("redirect_url"),
    userAgent: text("user_agent"),
    ipHash: text("ip_hash"),
    referer: text("referer"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("scanned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("qr_scans_tenant_scanned_idx").on(table.tenantId, table.createdAt),
    index("qr_scans_slug_scanned_idx").on(table.tenantSlug, table.createdAt),
  ],
);

export const insertQrScanSchema = createInsertSchema(qrScansTable).omit({
  id: true,
  createdAt: true,
});

export type QrScan = typeof qrScansTable.$inferSelect;
export type InsertQrScan = z.infer<typeof insertQrScanSchema>;
