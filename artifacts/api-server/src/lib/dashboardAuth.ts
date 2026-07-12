import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { and, eq, gt } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import {
  dashboardUsersTable,
  dashboardSessionsTable,
} from "@workspace/db";

export type DashboardRole = "master" | "manager";

export type DashboardUser = {
  id: string;
  email: string;
  displayName: string;
  role: DashboardRole;
  tenantId: string | null;
};

const SESSION_COOKIE = "orderly_dashboard_session";
const SESSION_DAYS = 7;

export function sessionCookieName(): string {
  return SESSION_COOKIE;
}

function hashPassword(password: string, salt?: Buffer): string {
  const s = salt ?? randomBytes(16);
  const hash = scryptSync(password, s, 64);
  return `scrypt:${s.toString("hex")}:${hash.toString("hex")}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const actual = scryptSync(password, salt, 64);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function ensureDashboardSeedUsers(): Promise<void> {
  const seeds: Array<{
    email: string;
    password: string;
    displayName: string;
    role: DashboardRole;
    tenantId: string | null;
  }> = [];

  const masterEmail = process.env.ORDERLY_DASHBOARD_MASTER_EMAIL?.trim();
  const masterPass = process.env.ORDERLY_DASHBOARD_MASTER_PASSWORD?.trim();
  if (masterEmail && masterPass) {
    seeds.push({
      email: masterEmail.toLowerCase(),
      password: masterPass,
      displayName: process.env.ORDERLY_DASHBOARD_MASTER_NAME?.trim() || "Master",
      role: "master",
      tenantId: null,
    });
  }

  const mgrEmail = process.env.ORDERLY_DASHBOARD_MANAGER_EMAIL?.trim();
  const mgrPass = process.env.ORDERLY_DASHBOARD_MANAGER_PASSWORD?.trim();
  const mgrTenant =
    process.env.ORDERLY_DASHBOARD_MANAGER_TENANT_ID?.trim() || "samurai";
  if (mgrEmail && mgrPass) {
    seeds.push({
      email: mgrEmail.toLowerCase(),
      password: mgrPass,
      displayName:
        process.env.ORDERLY_DASHBOARD_MANAGER_NAME?.trim() || "Manager",
      role: "manager",
      tenantId: mgrTenant,
    });
  }

  // Dev-only defaults when nothing configured (never use in production without override)
  if (seeds.length === 0 && process.env.NODE_ENV !== "production") {
    seeds.push({
      email: "master@orderly.local",
      password: "orderly-master-dev",
      displayName: "Malik (dev)",
      role: "master",
      tenantId: null,
    });
    seeds.push({
      email: "manager@samurai.local",
      password: "samurai-manager-dev",
      displayName: "Samurai Manager (dev)",
      role: "manager",
      tenantId: "samurai",
    });
  }

  for (const seed of seeds) {
    const existing = await db
      .select()
      .from(dashboardUsersTable)
      .where(eq(dashboardUsersTable.email, seed.email))
      .limit(1);
    if (existing[0]) continue;
    await db.insert(dashboardUsersTable).values({
      id: randomUUID(),
      email: seed.email,
      passwordHash: hashPassword(seed.password),
      displayName: seed.displayName,
      role: seed.role,
      tenantId: seed.tenantId,
    });
  }
}

export async function loginDashboardUser(
  email: string,
  password: string,
): Promise<{ user: DashboardUser; token: string; expiresAt: Date } | null> {
  const normalized = email.trim().toLowerCase();
  const rows = await db
    .select()
    .from(dashboardUsersTable)
    .where(eq(dashboardUsersTable.email, normalized))
    .limit(1);
  const row = rows[0];
  if (!row || !verifyPassword(password, row.passwordHash)) return null;
  if (row.role !== "master" && row.role !== "manager") return null;

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(dashboardSessionsTable).values({
    id: randomUUID(),
    userId: row.id,
    tokenHash: hashToken(token),
    expiresAt,
  });

  return {
    token,
    expiresAt,
    user: {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      role: row.role as DashboardRole,
      tenantId: row.tenantId,
    },
  };
}

export async function logoutDashboardSession(token: string): Promise<void> {
  await db
    .delete(dashboardSessionsTable)
    .where(eq(dashboardSessionsTable.tokenHash, hashToken(token)));
}

export async function resolveDashboardSession(
  token: string | undefined | null,
): Promise<DashboardUser | null> {
  if (!token) return null;
  const rows = await db
    .select({
      sessionId: dashboardSessionsTable.id,
      expiresAt: dashboardSessionsTable.expiresAt,
      userId: dashboardUsersTable.id,
      email: dashboardUsersTable.email,
      displayName: dashboardUsersTable.displayName,
      role: dashboardUsersTable.role,
      tenantId: dashboardUsersTable.tenantId,
    })
    .from(dashboardSessionsTable)
    .innerJoin(
      dashboardUsersTable,
      eq(dashboardSessionsTable.userId, dashboardUsersTable.id),
    )
    .where(
      and(
        eq(dashboardSessionsTable.tokenHash, hashToken(token)),
        gt(dashboardSessionsTable.expiresAt, new Date()),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (row.role !== "master" && row.role !== "manager") return null;
  return {
    id: row.userId,
    email: row.email,
    displayName: row.displayName,
    role: row.role as DashboardRole,
    tenantId: row.tenantId,
  };
}

/**
 * Resolve which tenant_id the caller may query.
 * Manager: forced to their tenant (ignore client tenant_id).
 * Master: may pass tenant_id, or omit for multi-tenant aggregate where supported.
 */
export function resolveScopedTenantId(
  user: DashboardUser,
  requestedTenantId: string | undefined | null,
): { ok: true; tenantId: string | null } | { ok: false; error: string } {
  if (user.role === "manager") {
    if (!user.tenantId) {
      return { ok: false, error: "Manager account missing tenant binding" };
    }
    if (requestedTenantId && requestedTenantId !== user.tenantId) {
      return { ok: false, error: "Forbidden: cannot access other tenants" };
    }
    return { ok: true, tenantId: user.tenantId };
  }
  // master
  if (requestedTenantId) return { ok: true, tenantId: requestedTenantId };
  return { ok: true, tenantId: null };
}
