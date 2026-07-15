/**
 * Client (restaurant owner) auth — the "/client" dashboard + KDS.
 *
 * SECURITY MODEL (tenant isolation is the whole point of this file):
 *   - A client user is a row in `dashboard_users` with role `client_owner`
 *     (or `manager`) and a NON-NULL `tenant_id`.
 *   - Every /client + /kds query is scoped to `session.tenantId` ONLY.
 *     The tenant is NEVER read from a URL/query/body parameter, so an owner
 *     cannot reach another restaurant's data by editing a request.
 *   - `master` (tenant_id = null, sees everything) is intentionally REJECTED
 *     here — master uses /dashboard, not /client. There is no null-aggregate
 *     path in client auth.
 *   - Separate cookie (`orderly_client_session`) from the master console so the
 *     two surfaces never share an ambient credential.
 *
 * Sessions reuse the shared `dashboard_sessions` table; a token is just a token,
 * but role is re-validated on every resolve, so a client token presented to the
 * master console (or vice-versa) is rejected by role.
 */
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { randomUUID } from "crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@workspace/db";
import { dashboardUsersTable, dashboardSessionsTable } from "@workspace/db";

export type ClientRole = "client_owner" | "manager";

/** A logged-in client user is ALWAYS bound to exactly one tenant. */
export type ClientUser = {
  id: string;
  email: string;
  displayName: string;
  role: ClientRole;
  tenantId: string;
};

const SESSION_COOKIE = "orderly_client_session";
const SESSION_DAYS = 7;

export function clientSessionCookieName(): string {
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

function isClientRole(role: string): role is ClientRole {
  return role === "client_owner" || role === "manager";
}

/**
 * Seed a client owner from env (idempotent). Never rotates existing passwords.
 *   ORDERLY_CLIENT_OWNER_EMAIL / _PASSWORD / _NAME / _TENANT_ID
 * Dev fallback only when nothing configured and NODE_ENV !== production.
 */
export async function ensureClientSeedUsers(): Promise<void> {
  const seeds: Array<{
    email: string;
    password: string;
    displayName: string;
    tenantId: string;
  }> = [];

  const email = process.env.ORDERLY_CLIENT_OWNER_EMAIL?.trim();
  const password = process.env.ORDERLY_CLIENT_OWNER_PASSWORD?.trim();
  const tenantId = process.env.ORDERLY_CLIENT_OWNER_TENANT_ID?.trim() || "samurai";
  if (email && password) {
    seeds.push({
      email: email.toLowerCase(),
      password,
      displayName: process.env.ORDERLY_CLIENT_OWNER_NAME?.trim() || "Owner",
      tenantId,
    });
  }

  if (seeds.length === 0 && process.env.NODE_ENV !== "production") {
    seeds.push({
      email: "owner@samurai.local",
      password: "samurai-owner-dev",
      displayName: "Samurai Owner (dev)",
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
      role: "client_owner",
      tenantId: seed.tenantId,
    });
  }
}

export async function loginClientUser(
  email: string,
  password: string,
): Promise<{ user: ClientUser; token: string; expiresAt: Date } | null> {
  const normalized = email.trim().toLowerCase();
  const rows = await db
    .select()
    .from(dashboardUsersTable)
    .where(eq(dashboardUsersTable.email, normalized))
    .limit(1);
  const row = rows[0];
  if (!row || !verifyPassword(password, row.passwordHash)) return null;
  // Only tenant-bound client roles may use /client. No master, no null tenant.
  if (!isClientRole(row.role) || !row.tenantId) return null;

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
      role: row.role,
      tenantId: row.tenantId,
    },
  };
}

export async function logoutClientSession(token: string): Promise<void> {
  await db
    .delete(dashboardSessionsTable)
    .where(eq(dashboardSessionsTable.tokenHash, hashToken(token)));
}

export async function resolveClientSession(
  token: string | undefined | null,
): Promise<ClientUser | null> {
  if (!token) return null;
  const rows = await db
    .select({
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
  // Re-validate role + tenant binding on every request (defense in depth).
  if (!isClientRole(row.role) || !row.tenantId) return null;
  return {
    id: row.userId,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    tenantId: row.tenantId,
  };
}

export function readClientSessionToken(req: {
  cookies?: Record<string, string>;
  headers: Record<string, unknown>;
}): string | undefined {
  const fromCookie = req.cookies?.[clientSessionCookieName()];
  if (typeof fromCookie === "string" && fromCookie) return fromCookie;
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim() || undefined;
  }
  return undefined;
}
