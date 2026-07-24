import {
  pgTable,
  text,
  jsonb,
  timestamp,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Invite-only self-serve onboarding (wizard 11 steps).
 * Square OAuth tokens live in square_oauth_connections — never here.
 */
export const onboardingInvitesTable = pgTable("onboarding_invites", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  label: text("label"),
  targetSlug: text("target_slug"),
  contactEmail: text("contact_email"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  claimedSessionId: text("claimed_session_id"),
  createdBy: text("created_by"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Self-serve onboarding sessions.
 * wizard jsonb holds step drafts (identity, serviceStyle, hours, …).
 * /publish still only creates draft tenants behind ONBOARDING_PUBLISH_ENABLED.
 */
export const onboardingSessionsTable = pgTable("onboarding_sessions", {
  id: text("id").primaryKey(),
  /**
   * draft -> … -> ready -> published
   * (published only behind ONBOARDING_PUBLISH_ENABLED)
   */
  status: text("status").notNull().default("draft"),
  restaurantName: text("restaurant_name").notNull(),
  address: text("address"),
  contact: jsonb("contact").$type<Record<string, unknown>>().notNull().default({}),
  cuisine: text("cuisine"),
  theme: jsonb("theme").$type<Record<string, unknown>>().notNull().default({}),
  variant: text("variant"),
  menuDraft: jsonb("menu_draft").$type<Record<string, unknown>>().notNull().default({}),
  domain: text("domain"),
  inviteId: text("invite_id"),
  /** Steps 1–11 draft payload. */
  wizard: jsonb("wizard").$type<Record<string, unknown>>().notNull().default({}),
  currentStep: integer("current_step").notNull().default(1),
  squareOauthState: text("square_oauth_state"),
  squareMerchantId: text("square_merchant_id"),
  squareLocationId: text("square_location_id"),
  squareConnectedAt: timestamp("square_connected_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOnboardingSessionSchema = createInsertSchema(
  onboardingSessionsTable,
).omit({ createdAt: true, updatedAt: true });

export type OnboardingInvite = typeof onboardingInvitesTable.$inferSelect;
export type OnboardingSession = typeof onboardingSessionsTable.$inferSelect;
export type InsertOnboardingSession = z.infer<
  typeof insertOnboardingSessionSchema
>;
