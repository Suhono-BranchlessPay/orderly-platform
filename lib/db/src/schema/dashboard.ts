import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Dashboard console users — Master (all tenants) or Manager (one tenant). */
export const dashboardUsersTable = pgTable(
  "dashboard_users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").notNull(),
    /** master | manager */
    role: text("role").notNull(),
    /** Required for manager; null for master. */
    tenantId: text("tenant_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("dashboard_users_email_idx").on(table.email)],
);

export const dashboardSessionsTable = pgTable("dashboard_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => dashboardUsersTable.id),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
