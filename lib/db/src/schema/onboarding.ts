import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Self-serve onboarding (Blok 3.1). Theme/menu-draft/domain steps here are
 * still a skeleton (deterministic stub theme, JSON draft only). Square OAuth
 * IS real (see square_oauth_connections in squareOauthConnections.ts) — the
 * restaurant authorizes Square themselves; encrypted tokens live in that
 * table, never here and never in git. Nothing in this file touches the live
 * `tenants` table or money paths until an explicit, gated /publish step.
 */
export const onboardingSessionsTable = pgTable("onboarding_sessions", {
  id: text("id").primaryKey(),
  /**
   * draft -> theme_set -> variant_set -> menu_draft -> domain_set -> ready
   * -> published (published only reachable behind ONBOARDING_PUBLISH_ENABLED)
   */
  status: text("status").notNull().default("draft"),
  restaurantName: text("restaurant_name").notNull(),
  address: text("address"),
  contact: jsonb("contact").$type<Record<string, unknown>>().notNull().default({}),
  cuisine: text("cuisine"),
  /** Stub auto theme — deterministic palette from name hash, not ML. */
  theme: jsonb("theme").$type<Record<string, unknown>>().notNull().default({}),
  variant: text("variant"),
  /** JSON draft only — never written to live menu_items/menu_categories. */
  menuDraft: jsonb("menu_draft").$type<Record<string, unknown>>().notNull().default({}),
  domain: text("domain"),
  /** Square OAuth CSRF-state — verified against on /square/callback, then cleared. */
  squareOauthState: text("square_oauth_state"),
  /** Set once /square/callback exchanges a real code — see square_oauth_connections for tokens. */
  squareMerchantId: text("square_merchant_id"),
  squareLocationId: text("square_location_id"),
  squareConnectedAt: timestamp("square_connected_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOnboardingSessionSchema = createInsertSchema(
  onboardingSessionsTable,
).omit({ createdAt: true, updatedAt: true });

export type OnboardingSession = typeof onboardingSessionsTable.$inferSelect;
export type InsertOnboardingSession = z.infer<
  typeof insertOnboardingSessionSchema
>;
