import {
  pgTable,
  text,
  timestamp,
  serial,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Anonymous QR scan events for packaging QR codes.
 * No PII — only volume/trend analytics per tenant.
 */
export const qrScansTable = pgTable(
  "qr_scans",
  {
    id: serial("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    slug: text("slug").notNull(),
    scannedAt: timestamp("scanned_at").notNull().defaultNow(),
    userAgent: text("user_agent"),
    referer: text("referer"),
    /** Coarse client IP (optional); do not treat as identity */
    ipHash: text("ip_hash"),
  },
  (table) => [
    index("qr_scans_tenant_scanned_idx").on(table.tenantId, table.scannedAt),
    index("qr_scans_slug_scanned_idx").on(table.slug, table.scannedAt),
  ],
);

export const insertQrScanSchema = createInsertSchema(qrScansTable).omit({
  id: true,
  scannedAt: true,
});

export type QrScan = typeof qrScansTable.$inferSelect;
export type InsertQrScan = z.infer<typeof insertQrScanSchema>;
