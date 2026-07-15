import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Per-tenant kitchen / prep settings.
 *
 * Owner sets these in the /client dashboard; the KDS and the storefront pickup
 * estimate consume them. One row per tenant (tenant_id is the PK). Absent row =
 * defaults (see DEFAULT_KITCHEN_SETTINGS in the api-server lib).
 */
export const kitchenSettingsTable = pgTable("kitchen_settings", {
  tenantId: text("tenant_id").primaryKey(),
  /** Baseline prep time shown to customers ("ready in ~N min"). */
  prepTimeMinutes: integer("prep_time_minutes").notNull().default(15),
  /** When true, add busyExtraMinutes to every estimate. */
  busyMode: boolean("busy_mode").notNull().default(false),
  busyExtraMinutes: integer("busy_extra_minutes").notNull().default(10),
  /** When true, storefront refuses new orders (soft pause; no money-path change). */
  ordersPaused: boolean("orders_paused").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type KitchenSettings = typeof kitchenSettingsTable.$inferSelect;
