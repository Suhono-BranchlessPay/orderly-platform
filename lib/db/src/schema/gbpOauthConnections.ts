import { pgTable, text, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Blok 4.2 Stage 2 — Google Business Profile OAuth connections (self-serve).
 *
 * One row per tenant that has connected Google via the offline consent flow
 * (`/api/gbp/oauth/start` → Google → `/api/gbp/oauth/callback`). The long-lived
 * refresh token is ALWAYS encrypted at rest (lib/tokenCrypto.ts, AES-256-GCM) —
 * this table never stores a plaintext token. Short-lived access tokens are
 * minted from the refresh token in memory (see lib/gbpConfig.ts) and are not
 * persisted.
 *
 * This mirrors square_oauth_connections but is keyed by tenant_id (GBP is a
 * per-restaurant integration, not tied to an onboarding session).
 */
export const gbpOauthConnectionsTable = pgTable(
  "gbp_oauth_connections",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    /** accounts/{account} — the Google Business Profile account resource. */
    accountResource: text("account_resource"),
    /** accounts/{account}/locations/{location} — used to list reviews. */
    locationResource: text("location_resource"),
    /** Google account email that granted consent (display only). */
    googleEmail: text("google_email"),
    /** AES-256-GCM ciphertext, see lib/tokenCrypto.ts — never plaintext. */
    refreshTokenEnc: text("refresh_token_enc").notNull(),
    scopes: text("scopes").notNull().default(""),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("gbp_oauth_connections_tenant_idx").on(table.tenantId),
  ],
);

export const insertGbpOauthConnectionSchema = createInsertSchema(
  gbpOauthConnectionsTable,
).omit({ createdAt: true, updatedAt: true });

export type GbpOauthConnection =
  typeof gbpOauthConnectionsTable.$inferSelect;
export type InsertGbpOauthConnection = z.infer<
  typeof insertGbpOauthConnectionSchema
>;
