import {
  pgTable,
  text,
  real,
  jsonb,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { merchantsTable } from "./merchants";

/**
 * Platform tenant (one restaurant brand / location config).
 * Credentials live in env/secrets (TENANT_{SLUG}_*), not in this table.
 */
export const tenantsTable = pgTable(
  "tenants",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    domain: text("domain").notNull(),
    logoUrl: text("logo_url"),
    faviconUrl: text("favicon_url"),
    theme: jsonb("theme").$type<Record<string, unknown>>().notNull().default({}),
    address: text("address"),
    city: text("city"),
    state: text("state"),
    postcode: text("postcode"),
    lat: real("lat").notNull(),
    lng: real("lng").notNull(),
    hours: jsonb("hours").$type<Record<string, unknown>>().notNull().default({}),
    serviceAreaRadius: real("service_area_radius").notNull().default(12),
    pickupPhone: text("pickup_phone"),
    pickupBusinessName: text("pickup_business_name"),
    posType: text("pos_type").notNull().default("square"),
    dataMode: text("data_mode").notNull().default("pos-full"),
    /** platform = Orderly anchors; pos-native = POS/Square anchors (Samurai). */
    anchorMode: text("anchor_mode").notNull().default("platform"),
    languages: jsonb("languages").$type<string[]>().notNull().default(["en"]),
    serviceFee: jsonb("service_fee")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    processingFeePaidBy: text("processing_fee_paid_by")
      .notNull()
      .default("restaurant"),
    status: text("status").notNull().default("active"),
    /**
     * Block 5 seam (multi-vertical). "restaurant" keeps all existing
     * behavior unchanged; other verticals (retail/grocery/etc.) are not
     * built yet — this column just avoids locking the schema to restaurants.
     */
    businessType: text("business_type").notNull().default("restaurant"),
    /** Block 5 seam: which fulfillment providers this tenant supports. */
    fulfillmentModes: jsonb("fulfillment_modes")
      .$type<string[]>()
      .notNull()
      .default(["pickup"]),
    /**
     * Block 5 seam: optional owning merchant (one merchant → many tenants).
     * Nullable and unpopulated for existing tenants — no 1:1 lock-in.
     */
    merchantId: text("merchant_id").references(() => merchantsTable.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("tenants_slug_idx").on(table.slug),
    uniqueIndex("tenants_domain_idx").on(table.domain),
  ],
);

export const insertTenantSchema = createInsertSchema(tenantsTable).omit({
  createdAt: true,
});

export type Tenant = typeof tenantsTable.$inferSelect;
export type InsertTenant = z.infer<typeof insertTenantSchema>;
