import { pgTable, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Blok 3.1 — REAL Square OAuth connections created by self-serve onboarding.
 * One row per onboarding session that has connected Square. `tenant_id` is
 * nullable until the session is published (see lib/onboarding.ts publish
 * path), then it is set so runtime order/refund code can look tokens up by
 * tenant. Tokens are ALWAYS encrypted at rest (see lib/tokenCrypto.ts,
 * AES-256-GCM) — this table never stores plaintext access/refresh tokens and
 * this migration never touches git-tracked secrets.
 */
export const squareOauthConnectionsTable = pgTable(
  "square_oauth_connections",
  {
    id: text("id").primaryKey(),
    onboardingSessionId: text("onboarding_session_id").notNull(),
    /** Set once the session is published into a real tenants row. */
    tenantId: text("tenant_id"),
    merchantId: text("merchant_id").notNull(),
    locationId: text("location_id").notNull(),
    /** AES-256-GCM ciphertext, see lib/tokenCrypto.ts — never plaintext. */
    accessTokenEnc: text("access_token_enc").notNull(),
    refreshTokenEnc: text("refresh_token_enc"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    scopes: text("scopes").notNull().default(""),
    environment: text("environment").notNull().default("sandbox"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("square_oauth_connections_session_idx").on(
      table.onboardingSessionId,
    ),
    index("square_oauth_connections_tenant_idx").on(table.tenantId),
  ],
);

export const insertSquareOauthConnectionSchema = createInsertSchema(
  squareOauthConnectionsTable,
).omit({ createdAt: true, updatedAt: true });

export type SquareOauthConnection =
  typeof squareOauthConnectionsTable.$inferSelect;
export type InsertSquareOauthConnection = z.infer<
  typeof insertSquareOauthConnectionSchema
>;
