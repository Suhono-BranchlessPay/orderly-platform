import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Block 5 seam: a merchant can own many storefronts (tenants).
 * Not wired into any existing flow — `tenants.merchant_id` stays nullable and
 * unpopulated for current restaurant tenants (Samurai / Kirin / Linton).
 */
export const merchantsTable = pgTable("merchants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMerchantSchema = createInsertSchema(merchantsTable).omit({
  createdAt: true,
});

export type Merchant = typeof merchantsTable.$inferSelect;
export type InsertMerchant = z.infer<typeof insertMerchantSchema>;
