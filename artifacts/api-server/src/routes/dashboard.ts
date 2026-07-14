/**
 * Orderly Internal Dashboard API — Master / Manager console.
 * Frontend never holds Square or DB credentials; all data via these routes.
 */
import { Router, type RequestHandler } from "express";
import {
  ensureDashboardSeedUsers,
  loginDashboardUser,
  logoutDashboardSession,
  resolveDashboardSession,
  resolveScopedTenantId,
  sessionCookieName,
  type DashboardUser,
} from "../lib/dashboardAuth";
import {
  buildAnchorReport,
  buildExportRows,
  buildItemSales,
  buildLiveOrders,
  buildOrdersByHourDay,
  buildPaymentBreakdown,
  buildReportSummary,
  buildQrScanReport,
  buildAnchorHealth,
  listTenantsForMaster,
  ordersToCsv,
  type ReportRange,
} from "../lib/dashboardReports";
import { buildCustomerIntelligence } from "../lib/customerIntelligence";
import { requireOrderlyDashboardHost } from "../lib/dashboardHost";
import { syncMissingAnchorProofs } from "../lib/anchorProof";
import {
  getMenuSyncState,
  getTenantSlugById,
  syncSquareMenuForTenant,
} from "../lib/squareMenuSync";
import { rebuildSeoTagsForTenant } from "../lib/seoTags";
import { rebuildSeoPlacesForTenant } from "../lib/seoPlaces";
import { toTenantContext } from "../lib/tenant";
import {
  applyLoyaltyLedgerEntry,
  getLoyaltyProgram,
  isLoyaltyEngineEnabled,
  upsertLoyaltyProgram,
} from "../lib/loyaltyEngine";
import {
  approveSocialPost,
  createSocialPostDraft,
  findMenuItemByName,
  getSocialPostingConfig,
  isSocialPostingEngineEnabled,
  listSocialPostCandidates,
  listSocialPosts,
  markSocialPostPosted,
  refreshSocialPostMetrics,
  skipSocialPost,
  updateSocialPostCaption,
  upsertSocialPostingConfig,
} from "../lib/socialPosting";
import {
  getGiftCardProgram,
  isGiftCardEngineEnabled,
  listGiftCardsForTenant,
  recordMigratedGiftCard,
  upsertGiftCardProgram,
} from "../lib/giftCardEngine";
import {
  db,
  giftCardsTable,
  loyaltyAccountsTable,
  tenantsTable,
} from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import type { SocialPostAngle } from "@workspace/db";

declare global {
  namespace Express {
    interface Request {
      dashboardUser?: DashboardUser;
    }
  }
}

const router = Router();

/** Never expose console APIs on restaurant client domains. */
router.use(requireOrderlyDashboardHost);

const VALID_RANGES = new Set<ReportRange>(["today", "7d", "28d", "30d"]);

function parseRange(raw: unknown): ReportRange {
  if (typeof raw === "string" && VALID_RANGES.has(raw as ReportRange)) {
    return raw as ReportRange;
  }
  return "7d";
}

function readSessionToken(req: {
  cookies?: Record<string, string>;
  headers: Record<string, unknown>;
}): string | undefined {
  const fromCookie = req.cookies?.[sessionCookieName()];
  if (typeof fromCookie === "string" && fromCookie) return fromCookie;
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim() || undefined;
  }
  return undefined;
}

function setSessionCookie(
  res: {
    cookie: (
      name: string,
      value: string,
      options: Record<string, unknown>,
    ) => void;
  },
  token: string,
  expiresAt: Date,
): void {
  const secure = process.env.NODE_ENV === "production";
  res.cookie(sessionCookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    expires: expiresAt,
    path: "/",
  });
}

function clearSessionCookie(res: {
  clearCookie: (name: string, options?: Record<string, unknown>) => void;
}): void {
  res.clearCookie(sessionCookieName(), { path: "/" });
}

const requireDashboardAuth: RequestHandler = async (req, res, next) => {
  try {
    const user = await resolveDashboardSession(readSessionToken(req));
    if (!user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    req.dashboardUser = user;
    next();
  } catch (err) {
    req.log?.error({ err }, "Dashboard auth failed");
    res.status(500).json({ error: "Auth check failed" });
  }
};

// Seed once on first hit (idempotent). Also called from server boot.
let seedPromise: Promise<void> | null = null;
function ensureSeed(): Promise<void> {
  if (!seedPromise) seedPromise = ensureDashboardSeedUsers();
  return seedPromise;
}

router.post("/login", async (req, res): Promise<void> => {
  try {
    await ensureSeed();
    const email = typeof req.body?.email === "string" ? req.body.email : "";
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";
    if (!email || !password) {
      res.status(400).json({ error: "email and password required" });
      return;
    }
    const result = await loginDashboardUser(email, password);
    if (!result) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    setSessionCookie(res, result.token, result.expiresAt);
    res.json({
      user: {
        id: result.user.id,
        email: result.user.email,
        display_name: result.user.displayName,
        role: result.user.role,
        tenant_id: result.user.tenantId,
      },
    });
  } catch (err) {
    req.log?.error({ err }, "Dashboard login failed");
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/logout", async (req, res): Promise<void> => {
  try {
    const token = readSessionToken(req);
    if (token) await logoutDashboardSession(token);
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (err) {
    req.log?.error({ err }, "Dashboard logout failed");
    clearSessionCookie(res);
    res.status(500).json({ error: "Logout failed" });
  }
});

router.get("/me", requireDashboardAuth, async (req, res): Promise<void> => {
  const user = req.dashboardUser!;
  res.json({
    user: {
      id: user.id,
      email: user.email,
      display_name: user.displayName,
      role: user.role,
      tenant_id: user.tenantId,
    },
  });
});

router.get(
  "/tenants",
  requireDashboardAuth,
  async (req, res): Promise<void> => {
    const user = req.dashboardUser!;
    if (user.role !== "master") {
      res.status(403).json({ error: "Master role required" });
      return;
    }
    try {
      const tenants = await listTenantsForMaster();
      res.json({
        tenants: tenants.map((t) => ({
          id: t.id,
          slug: t.slug,
          name: t.name,
          city: t.city,
          state: t.state,
          status: t.status,
        })),
      });
    } catch (err) {
      req.log?.error({ err }, "Dashboard tenants list failed");
      res.status(500).json({ error: "Failed to list tenants" });
    }
  },
);

function scopedTenant(
  req: { query: Record<string, unknown>; dashboardUser?: DashboardUser },
  res: { status: (code: number) => { json: (body: unknown) => void } },
): string | null | undefined {
  const user = req.dashboardUser!;
  const requested =
    typeof req.query.tenant_id === "string" ? req.query.tenant_id.trim() : null;
  const scope = resolveScopedTenantId(user, requested || null);
  if (!scope.ok) {
    res.status(403).json({ error: scope.error });
    return undefined;
  }
  return scope.tenantId;
}

router.get(
  "/reports/summary",
  requireDashboardAuth,
  async (req, res): Promise<void> => {
    try {
      const tenantId = scopedTenant(req, res);
      if (tenantId === undefined) return;
      const range = parseRange(req.query.range);
      const summary = await buildReportSummary({ tenantId, range });
      res.json(summary);
    } catch (err) {
      req.log?.error({ err }, "Dashboard summary failed");
      res.status(500).json({ error: "Failed to build summary" });
    }
  },
);

router.get(
  "/reports/items",
  requireDashboardAuth,
  async (req, res): Promise<void> => {
    try {
      const tenantId = scopedTenant(req, res);
      if (tenantId === undefined) return;
      const range = parseRange(req.query.range);
      const data = await buildItemSales({ tenantId, range });
      res.json(data);
    } catch (err) {
      req.log?.error({ err }, "Dashboard items report failed");
      res.status(500).json({ error: "Failed to build item sales" });
    }
  },
);

router.get(
  "/reports/by-time",
  requireDashboardAuth,
  async (req, res): Promise<void> => {
    try {
      const tenantId = scopedTenant(req, res);
      if (tenantId === undefined) return;
      const range = parseRange(req.query.range);
      const data = await buildOrdersByHourDay({ tenantId, range });
      res.json(data);
    } catch (err) {
      req.log?.error({ err }, "Dashboard by-time report failed");
      res.status(500).json({ error: "Failed to build time report" });
    }
  },
);

router.get(
  "/reports/anchors",
  requireDashboardAuth,
  async (req, res): Promise<void> => {
    try {
      const tenantId = scopedTenant(req, res);
      if (tenantId === undefined) return;
      const range = parseRange(req.query.range);
      // Never block the report on BP HTTP polls (was ~15–20s per page load).
      // Sync only when explicitly requested: ?sync=1 or POST /anchors/sync.
      const wantSync =
        req.query.sync === "1" ||
        req.query.sync === "true" ||
        req.query.sync === "yes";
      if (wantSync) {
        try {
          await syncMissingAnchorProofs({ tenantId, limit: 10 });
        } catch (syncErr) {
          req.log?.warn({ err: syncErr }, "Anchor optional sync skipped");
        }
      }
      const data = await buildAnchorReport({ tenantId, range });
      res.json(data);
    } catch (err) {
      req.log?.error({ err }, "Dashboard anchors report failed");
      res.status(500).json({ error: "Failed to build anchor report" });
    }
  },
);

router.post(
  "/anchors/sync",
  requireDashboardAuth,
  async (req, res): Promise<void> => {
    try {
      const tenantId = scopedTenant(req, res);
      if (tenantId === undefined) return;
      const limitRaw =
        typeof req.body?.limit === "number"
          ? req.body.limit
          : Number(req.query.limit);
      const result = await syncMissingAnchorProofs({
        tenantId,
        limit: Number.isFinite(limitRaw) ? limitRaw : 50,
      });
      res.json({ ok: true, ...result });
    } catch (err) {
      req.log?.error({ err }, "Dashboard anchor sync failed");
      res.status(500).json({ error: "Failed to sync anchors from BP" });
    }
  },
);

router.get(
  "/reports/export.csv",
  requireDashboardAuth,
  async (req, res): Promise<void> => {
    try {
      const tenantId = scopedTenant(req, res);
      if (tenantId === undefined) return;
      const range = parseRange(req.query.range);
      const rows = await buildExportRows({ tenantId, range });
      const csv = ordersToCsv(rows);
      const stamp = new Date().toISOString().slice(0, 10);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="orderly-orders-${stamp}.csv"`,
      );
      res.send(csv);
    } catch (err) {
      req.log?.error({ err }, "Dashboard CSV export failed");
      res.status(500).json({ error: "Failed to export CSV" });
    }
  },
);

router.get(
  "/reports/live-orders",
  requireDashboardAuth,
  async (req, res): Promise<void> => {
    try {
      const tenantId = scopedTenant(req, res);
      if (tenantId === undefined) return;
      const range = parseRange(req.query.range);
      const data = await buildLiveOrders({ tenantId, range });
      res.json(data);
    } catch (err) {
      req.log?.error({ err }, "Dashboard live orders failed");
      res.status(500).json({ error: "Failed to build live orders" });
    }
  },
);

router.get(
  "/reports/payments",
  requireDashboardAuth,
  async (req, res): Promise<void> => {
    try {
      const tenantId = scopedTenant(req, res);
      if (tenantId === undefined) return;
      const range = parseRange(req.query.range);
      const data = await buildPaymentBreakdown({ tenantId, range });
      res.json(data);
    } catch (err) {
      req.log?.error({ err }, "Dashboard payments report failed");
      res.status(500).json({ error: "Failed to build payment breakdown" });
    }
  },
);

router.get(
  "/reports/customers",
  requireDashboardAuth,
  async (req, res): Promise<void> => {
    try {
      const tenantId = scopedTenant(req, res);
      if (tenantId === undefined) return;
      if (!tenantId) {
        res.status(400).json({
          error: "tenant_id required for customer intelligence (pick a tenant)",
        });
        return;
      }
      const data = await buildCustomerIntelligence({ tenantId });
      res.json(data);
    } catch (err) {
      req.log?.error({ err }, "Dashboard customer intel failed");
      res.status(500).json({ error: "Failed to build customer intelligence" });
    }
  },
);

router.get(
  "/reports/qr-scans",
  requireDashboardAuth,
  async (req, res): Promise<void> => {
    try {
      const tenantId = scopedTenant(req, res);
      if (tenantId === undefined) return;
      const range = parseRange(req.query.range);
      const data = await buildQrScanReport({ tenantId, range });
      res.json(data);
    } catch (err) {
      req.log?.error({ err }, "Dashboard QR scans failed");
      res.status(500).json({ error: "Failed to build QR scan report" });
    }
  },
);

router.get(
  "/reports/anchor-health",
  requireDashboardAuth,
  async (req, res): Promise<void> => {
    try {
      const tenantId = scopedTenant(req, res);
      if (tenantId === undefined) return;
      const data = await buildAnchorHealth({ tenantId });
      res.json(data);
    } catch (err) {
      req.log?.error({ err }, "Dashboard anchor health failed");
      res.status(500).json({ error: "Failed to build anchor health" });
    }
  },
);

/**
 * Blok A — Square is the source of truth for the menu; this only reports
 * the status of the last pull (never writes to Square).
 */
router.get(
  "/menu-sync",
  requireDashboardAuth,
  async (req, res): Promise<void> => {
    try {
      const tenantId = scopedTenant(req, res);
      if (tenantId === undefined) return;
      if (!tenantId) {
        res.json({ state: null, note: "Pick a single tenant to see Square menu sync status." });
        return;
      }
      const state = await getMenuSyncState(tenantId);
      res.json({
        state: state
          ? {
              tenant_id: state.tenantId,
              last_started_at: state.lastStartedAt,
              last_success_at: state.lastSuccessAt,
              last_error_at: state.lastErrorAt,
              last_error: state.lastError,
              last_item_count: state.lastItemCount,
            }
          : null,
      });
    } catch (err) {
      req.log?.error({ err }, "Dashboard menu-sync status failed");
      res.status(500).json({ error: "Failed to load menu sync status" });
    }
  },
);

/** Manual "Sync now" — triggers a real Square catalog pull for one tenant. */
router.post(
  "/menu-sync",
  requireDashboardAuth,
  async (req, res): Promise<void> => {
    try {
      const user = req.dashboardUser!;
      const requested =
        typeof req.body?.tenant_id === "string" ? req.body.tenant_id.trim() : null;
      const scope = resolveScopedTenantId(user, requested || null);
      if (!scope.ok) {
        res.status(403).json({ error: scope.error });
        return;
      }
      const tenantId = scope.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: "tenant_id is required to trigger a sync" });
        return;
      }
      const slug = await getTenantSlugById(tenantId);
      if (!slug) {
        res.status(404).json({ error: "Tenant not found" });
        return;
      }
      const summary = await syncSquareMenuForTenant({
        tenantId,
        slug,
        reason: "manual-dashboard",
      });
      res.json({ ok: summary.ok, summary });
    } catch (err) {
      req.log?.error({ err }, "Dashboard menu sync trigger failed");
      res.status(500).json({ error: "Failed to sync menu" });
    }
  },
);

/**
 * Blok B — Master-only: promote a draft onboarding tenant to active.
 * Does NOT configure DNS/nginx — ops must point the domain first.
 * Never touches Samurai env Square tokens.
 */
router.post(
  "/tenants/:id/activate",
  requireDashboardAuth,
  async (req, res): Promise<void> => {
    try {
      const user = req.dashboardUser!;
      if (user.role !== "master") {
        res.status(403).json({ error: "Master role required to activate tenants" });
        return;
      }
      const id = String(req.params.id || "").trim();
      if (!id) {
        res.status(400).json({ error: "tenant id required" });
        return;
      }
      const rows = await db
        .select({
          id: tenantsTable.id,
          slug: tenantsTable.slug,
          status: tenantsTable.status,
          domain: tenantsTable.domain,
        })
        .from(tenantsTable)
        .where(eq(tenantsTable.id, id))
        .limit(1);
      const row = rows[0];
      if (!row) {
        res.status(404).json({ error: "Tenant not found" });
        return;
      }
      if (row.status === "active") {
        res.json({
          ok: true,
          already_active: true,
          tenant: row,
          note: "Already active. Ensure DNS/nginx points to this API for the domain.",
        });
        return;
      }
      await db
        .update(tenantsTable)
        .set({ status: "active" })
        .where(eq(tenantsTable.id, id));
      res.json({
        ok: true,
        tenant: { ...row, status: "active" },
        note:
          "Tenant marked active. Storefront resolves only active tenants — configure DNS/nginx for the domain if needed, then Sync menu from Square.",
      });
    } catch (err) {
      req.log?.error({ err }, "Dashboard tenant activate failed");
      res.status(500).json({ error: "Failed to activate tenant" });
    }
  },
);

/**
 * Rebuild programmatic SEO tag + place pages for a tenant.
 */
router.post(
  "/seo/rebuild",
  requireDashboardAuth,
  async (req, res): Promise<void> => {
    try {
      const user = req.dashboardUser!;
      const requested =
        typeof req.body?.tenant_id === "string" ? req.body.tenant_id.trim() : null;
      const scope = resolveScopedTenantId(user, requested || null);
      if (!scope.ok) {
        res.status(403).json({ error: scope.error });
        return;
      }
      const tenantId = scope.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: "tenant_id is required" });
        return;
      }
      const rows = await db
        .select()
        .from(tenantsTable)
        .where(eq(tenantsTable.id, tenantId))
        .limit(1);
      const row = rows[0];
      if (!row) {
        res.status(404).json({ error: "Tenant not found" });
        return;
      }
      const ctx = toTenantContext(row);
      const tags = await rebuildSeoTagsForTenant(ctx);
      const places = await rebuildSeoPlacesForTenant(ctx);
      res.json({ ok: true, tenantId, tags, places });
    } catch (err) {
      req.log?.error({ err }, "Dashboard SEO rebuild failed");
      res.status(500).json({ error: "Failed to rebuild SEO pages" });
    }
  },
);

/**
 * Loyalty program config (restaurant-owned). Engine still gated by
 * ORDERLY_LOYALTY_ENABLED on the VPS.
 */
router.get(
  "/loyalty/program",
  requireDashboardAuth,
  async (req, res): Promise<void> => {
    try {
      const user = req.dashboardUser!;
      const requested =
        typeof req.query.tenant_id === "string"
          ? req.query.tenant_id.trim()
          : null;
      const scope = resolveScopedTenantId(user, requested || null);
      if (!scope.ok) {
        res.status(403).json({ error: scope.error });
        return;
      }
      const tenantId = scope.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: "tenant_id required" });
        return;
      }
      const program = await getLoyaltyProgram(tenantId);
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(loyaltyAccountsTable)
        .where(eq(loyaltyAccountsTable.tenantId, tenantId));
      res.json({
        engineEnabled: isLoyaltyEngineEnabled(),
        program,
        accounts: count ?? 0,
      });
    } catch (err) {
      req.log?.error({ err }, "Dashboard loyalty program GET failed");
      res.status(500).json({ error: "Failed to load loyalty program" });
    }
  },
);

router.put(
  "/loyalty/program",
  requireDashboardAuth,
  async (req, res): Promise<void> => {
    try {
      const user = req.dashboardUser!;
      const body = (req.body ?? {}) as {
        tenant_id?: string;
        enabled?: boolean;
        points_per_dollar?: number;
        redemption_rules?: Record<string, unknown>;
        expiry_days?: number | null;
        status?: string;
      };
      const scope = resolveScopedTenantId(user, body.tenant_id || null);
      if (!scope.ok) {
        res.status(403).json({ error: scope.error });
        return;
      }
      const tenantId = scope.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: "tenant_id required" });
        return;
      }
      const program = await upsertLoyaltyProgram({
        tenantId,
        enabled: body.enabled,
        pointsPerDollar: body.points_per_dollar,
        redemptionRules: body.redemption_rules as
          | {
              min_redeem_points?: number;
              points_per_dollar_off?: number;
              max_percent_of_subtotal?: number;
            }
          | undefined,
        expiryDays: body.expiry_days,
        status: body.status,
      });
      res.json({ ok: true, program, engineEnabled: isLoyaltyEngineEnabled() });
    } catch (err) {
      req.log?.error({ err }, "Dashboard loyalty program PUT failed");
      res.status(500).json({ error: "Failed to update loyalty program" });
    }
  },
);

router.get(
  "/loyalty/accounts",
  requireDashboardAuth,
  async (req, res): Promise<void> => {
    try {
      const user = req.dashboardUser!;
      const requested =
        typeof req.query.tenant_id === "string"
          ? req.query.tenant_id.trim()
          : null;
      const scope = resolveScopedTenantId(user, requested || null);
      if (!scope.ok) {
        res.status(403).json({ error: scope.error });
        return;
      }
      const tenantId = scope.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: "tenant_id required" });
        return;
      }
      const rows = await db
        .select()
        .from(loyaltyAccountsTable)
        .where(eq(loyaltyAccountsTable.tenantId, tenantId))
        .orderBy(desc(loyaltyAccountsTable.pointsBalance))
        .limit(100);
      res.json({ accounts: rows });
    } catch (err) {
      req.log?.error({ err }, "Dashboard loyalty accounts failed");
      res.status(500).json({ error: "Failed to list loyalty accounts" });
    }
  },
);

/**
 * Manual ledger entry: adjust | migrate | expire.
 * migrate = Owner.com import audit trail (does NOT auto-pull Owner).
 * Master-only for migrate/adjust large corrections.
 */
router.post(
  "/loyalty/ledger",
  requireDashboardAuth,
  async (req, res): Promise<void> => {
    try {
      const user = req.dashboardUser!;
      const body = (req.body ?? {}) as {
        tenant_id?: string;
        customer_id?: string;
        type?: string;
        points?: number;
        reason?: string;
        external_ref?: string;
      };
      const scope = resolveScopedTenantId(user, body.tenant_id || null);
      if (!scope.ok) {
        res.status(403).json({ error: scope.error });
        return;
      }
      const tenantId = scope.tenantId;
      const customerId = String(body.customer_id || "").trim();
      const type = String(body.type || "").trim();
      const points = Number(body.points);
      const reason = String(body.reason || "").trim();
      if (!tenantId || !customerId || !reason || !Number.isFinite(points)) {
        res.status(400).json({
          error: "tenant_id, customer_id, type, points, reason required",
        });
        return;
      }
      if (!["adjust", "migrate", "expire"].includes(type)) {
        res.status(400).json({ error: "type must be adjust|migrate|expire" });
        return;
      }
      if (type === "migrate" && user.role !== "master") {
        res.status(403).json({ error: "Master role required for migrate" });
        return;
      }
      const slugRow = await db
        .select({ slug: tenantsTable.slug })
        .from(tenantsTable)
        .where(eq(tenantsTable.id, tenantId))
        .limit(1);
      const result = await applyLoyaltyLedgerEntry({
        tenantId,
        customerId,
        type: type as "adjust" | "migrate" | "expire",
        points,
        reason,
        externalRef: body.external_ref,
        tenantSlug: slugRow[0]?.slug,
      });
      res.json(result);
    } catch (err) {
      req.log?.error({ err }, "Dashboard loyalty ledger failed");
      res.status(500).json({
        error: err instanceof Error ? err.message : "Ledger entry failed",
      });
    }
  },
);

/**
 * AI Social Posting — Stage 1 (manual-assisted).
 * Draft → human approve → copy caption/link → mark posted. NO Meta Graph publish.
 */
router.get(
  "/social-posts/config",
  requireDashboardAuth,
  async (req, res): Promise<void> => {
    try {
      const user = req.dashboardUser!;
      const requested =
        typeof req.query.tenant_id === "string"
          ? req.query.tenant_id.trim()
          : null;
      const scope = resolveScopedTenantId(user, requested || null);
      if (!scope.ok) {
        res.status(403).json({ error: scope.error });
        return;
      }
      const tenantId = scope.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: "tenant_id required" });
        return;
      }
      const config = await getSocialPostingConfig(tenantId);
      res.json({
        engineEnabled: isSocialPostingEngineEnabled(),
        stage: 1,
        autoPost: false,
        config,
      });
    } catch (err) {
      req.log?.error({ err }, "social-posts config GET failed");
      res.status(500).json({ error: "Failed to load config" });
    }
  },
);

router.put(
  "/social-posts/config",
  requireDashboardAuth,
  async (req, res): Promise<void> => {
    try {
      const user = req.dashboardUser!;
      const body = (req.body ?? {}) as {
        tenant_id?: string;
        enabled?: boolean;
        frequency?: string;
        post_time?: string | null;
        platforms?: string[];
        brand_voice?: string | null;
        language?: string;
        min_days_between_repeat?: number;
      };
      const scope = resolveScopedTenantId(user, body.tenant_id || null);
      if (!scope.ok) {
        res.status(403).json({ error: scope.error });
        return;
      }
      const tenantId = scope.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: "tenant_id required" });
        return;
      }
      const config = await upsertSocialPostingConfig({
        tenantId,
        enabled: body.enabled,
        frequency: body.frequency,
        postTime: body.post_time,
        platforms: body.platforms,
        brandVoice: body.brand_voice,
        language: body.language,
        minDaysBetweenRepeat: body.min_days_between_repeat,
      });
      res.json({
        ok: true,
        config,
        engineEnabled: isSocialPostingEngineEnabled(),
        note: "Stage 1: require_approval forced true; no auto-post.",
      });
    } catch (err) {
      req.log?.error({ err }, "social-posts config PUT failed");
      res.status(500).json({ error: "Failed to save config" });
    }
  },
);

router.get(
  "/social-posts/candidates",
  requireDashboardAuth,
  async (req, res): Promise<void> => {
    try {
      const user = req.dashboardUser!;
      const requested =
        typeof req.query.tenant_id === "string"
          ? req.query.tenant_id.trim()
          : null;
      const scope = resolveScopedTenantId(user, requested || null);
      if (!scope.ok) {
        res.status(403).json({ error: scope.error });
        return;
      }
      const tenantId = scope.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: "tenant_id required" });
        return;
      }
      const candidates = await listSocialPostCandidates({ tenantId });
      res.json({ candidates });
    } catch (err) {
      req.log?.error({ err }, "social-posts candidates failed");
      res.status(500).json({ error: "Failed to list candidates" });
    }
  },
);

router.get(
  "/social-posts",
  requireDashboardAuth,
  async (req, res): Promise<void> => {
    try {
      const user = req.dashboardUser!;
      const requested =
        typeof req.query.tenant_id === "string"
          ? req.query.tenant_id.trim()
          : null;
      const status =
        typeof req.query.status === "string" ? req.query.status.trim() : undefined;
      const scope = resolveScopedTenantId(user, requested || null);
      if (!scope.ok) {
        res.status(403).json({ error: scope.error });
        return;
      }
      const tenantId = scope.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: "tenant_id required" });
        return;
      }
      const posts = await listSocialPosts({ tenantId, status });
      res.json({ posts });
    } catch (err) {
      req.log?.error({ err }, "social-posts list failed");
      res.status(500).json({ error: "Failed to list posts" });
    }
  },
);

router.post(
  "/social-posts/draft",
  requireDashboardAuth,
  async (req, res): Promise<void> => {
    try {
      const user = req.dashboardUser!;
      const body = (req.body ?? {}) as {
        tenant_id?: string;
        menu_item_id?: string;
        item_name?: string;
        platform?: string;
        angle?: string;
        src_tag?: string;
      };
      const scope = resolveScopedTenantId(user, body.tenant_id || null);
      if (!scope.ok) {
        res.status(403).json({ error: scope.error });
        return;
      }
      const tenantId = scope.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: "tenant_id required" });
        return;
      }
      let menuItemId = String(body.menu_item_id || "").trim();
      if (!menuItemId && body.item_name) {
        const found = await findMenuItemByName(tenantId, body.item_name);
        if (!found) {
          res.status(404).json({
            error: `No menu item matching "${body.item_name}" (try "Steak Bento")`,
          });
          return;
        }
        menuItemId = found.id;
      }
      if (!menuItemId) {
        res.status(400).json({ error: "menu_item_id or item_name required" });
        return;
      }
      const post = await createSocialPostDraft({
        tenantId,
        menuItemId,
        platform: body.platform,
        angle: body.angle as SocialPostAngle | undefined,
        srcTagOverride: body.src_tag,
      });
      const fullPost =
        `${post.draftCaption}\n\n${post.cta}\n\n${post.hashtags}`.trim();
      res.json({
        ok: true,
        post,
        fullPost,
        copyHint:
          "Approve → copy fullPost into Facebook → Mark posted. Do not auto-publish.",
      });
    } catch (err) {
      req.log?.error({ err }, "social-posts draft failed");
      res.status(400).json({
        error: err instanceof Error ? err.message : "Draft failed",
      });
    }
  },
);

router.get(
  "/social-posts/performance",
  requireDashboardAuth,
  async (req, res): Promise<void> => {
    try {
      const user = req.dashboardUser!;
      const requested =
        typeof req.query.tenant_id === "string"
          ? req.query.tenant_id.trim()
          : null;
      const scope = resolveScopedTenantId(user, requested || null);
      if (!scope.ok) {
        res.status(403).json({ error: scope.error });
        return;
      }
      const tenantId = scope.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: "tenant_id required" });
        return;
      }
      const rows = await refreshSocialPostMetrics(tenantId);
      res.json({
        posts: rows,
        note: "Real clicks (qr_scans) + paid orders by source_detail.src. Empty = zero.",
      });
    } catch (err) {
      req.log?.error({ err }, "social-posts performance failed");
      res.status(500).json({ error: "Failed to load performance" });
    }
  },
);

router.patch(
  "/social-posts/:id",
  requireDashboardAuth,
  async (req, res): Promise<void> => {
    try {
      const user = req.dashboardUser!;
      const body = (req.body ?? {}) as {
        tenant_id?: string;
        draft_caption?: string;
        hashtags?: string;
        cta?: string;
      };
      const scope = resolveScopedTenantId(user, body.tenant_id || null);
      if (!scope.ok) {
        res.status(403).json({ error: scope.error });
        return;
      }
      const tenantId = scope.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: "tenant_id required" });
        return;
      }
      const post = await updateSocialPostCaption({
        tenantId,
        postId: String(req.params.id),
        draftCaption: body.draft_caption,
        hashtags: body.hashtags,
        cta: body.cta,
      });
      res.json({ ok: true, post });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "Update failed",
      });
    }
  },
);

router.post(
  "/social-posts/:id/approve",
  requireDashboardAuth,
  async (req, res): Promise<void> => {
    try {
      const user = req.dashboardUser!;
      const body = (req.body ?? {}) as { tenant_id?: string };
      const scope = resolveScopedTenantId(user, body.tenant_id || null);
      if (!scope.ok) {
        res.status(403).json({ error: scope.error });
        return;
      }
      const tenantId = scope.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: "tenant_id required" });
        return;
      }
      const post = await approveSocialPost({
        tenantId,
        postId: String(req.params.id),
        approvedBy: user.email || user.id,
      });
      const fullPost =
        `${post.draftCaption}\n\n${post.cta}\n\n${post.hashtags}`.trim();
      res.json({ ok: true, post, fullPost });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "Approve failed",
      });
    }
  },
);

router.post(
  "/social-posts/:id/skip",
  requireDashboardAuth,
  async (req, res): Promise<void> => {
    try {
      const user = req.dashboardUser!;
      const body = (req.body ?? {}) as { tenant_id?: string; reason?: string };
      const scope = resolveScopedTenantId(user, body.tenant_id || null);
      if (!scope.ok) {
        res.status(403).json({ error: scope.error });
        return;
      }
      const tenantId = scope.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: "tenant_id required" });
        return;
      }
      const post = await skipSocialPost({
        tenantId,
        postId: String(req.params.id),
        reason: body.reason,
      });
      res.json({ ok: true, post });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "Skip failed",
      });
    }
  },
);

router.post(
  "/social-posts/:id/mark-posted",
  requireDashboardAuth,
  async (req, res): Promise<void> => {
    try {
      const user = req.dashboardUser!;
      const body = (req.body ?? {}) as { tenant_id?: string };
      const scope = resolveScopedTenantId(user, body.tenant_id || null);
      if (!scope.ok) {
        res.status(403).json({ error: scope.error });
        return;
      }
      const tenantId = scope.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: "tenant_id required" });
        return;
      }
      const post = await markSocialPostPosted({
        tenantId,
        postId: String(req.params.id),
        postedBy: user.email || user.id,
      });
      res.json({
        ok: true,
        post,
        note: "Recorded as posted. Measure clicks/orders via src for 48h.",
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "Mark posted failed",
      });
    }
  },
);

/**
 * Gift cards (Square-issued). Engine gated by ORDERLY_GIFT_CARDS_ENABLED.
 * Lawyer + CPA sign-off required before enabling in production.
 */
router.get(
  "/gift-cards/program",
  requireDashboardAuth,
  async (req, res): Promise<void> => {
    try {
      const user = req.dashboardUser!;
      const requested =
        typeof req.query.tenant_id === "string"
          ? req.query.tenant_id.trim()
          : null;
      const scope = resolveScopedTenantId(user, requested || null);
      if (!scope.ok) {
        res.status(403).json({ error: scope.error });
        return;
      }
      const tenantId = scope.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: "tenant_id required" });
        return;
      }
      const program = await getGiftCardProgram(tenantId);
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(giftCardsTable)
        .where(eq(giftCardsTable.tenantId, tenantId));
      const tenantRow = await db
        .select({ posType: tenantsTable.posType })
        .from(tenantsTable)
        .where(eq(tenantsTable.id, tenantId))
        .limit(1);
      res.json({
        engineEnabled: isGiftCardEngineEnabled(),
        posType: tenantRow[0]?.posType ?? null,
        program,
        cards: count ?? 0,
      });
    } catch (err) {
      req.log?.error({ err }, "Dashboard gift-cards program GET failed");
      res.status(500).json({ error: "Failed to load gift card program" });
    }
  },
);

router.put(
  "/gift-cards/program",
  requireDashboardAuth,
  async (req, res): Promise<void> => {
    try {
      const user = req.dashboardUser!;
      const body = (req.body ?? {}) as {
        tenant_id?: string;
        enabled?: boolean;
        status?: string;
        allowed_amounts_cents?: number[];
        min_amount_cents?: number;
        max_amount_cents?: number;
        sell_online?: boolean;
      };
      const scope = resolveScopedTenantId(user, body.tenant_id || null);
      if (!scope.ok) {
        res.status(403).json({ error: scope.error });
        return;
      }
      const tenantId = scope.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: "tenant_id required" });
        return;
      }
      const program = await upsertGiftCardProgram({
        tenantId,
        enabled: body.enabled,
        status: body.status,
        allowedAmountsCents: body.allowed_amounts_cents,
        minAmountCents: body.min_amount_cents,
        maxAmountCents: body.max_amount_cents,
        sellOnline: body.sell_online,
      });
      res.json({
        ok: true,
        program,
        engineEnabled: isGiftCardEngineEnabled(),
      });
    } catch (err) {
      req.log?.error({ err }, "Dashboard gift-cards program PUT failed");
      res.status(500).json({ error: "Failed to update gift card program" });
    }
  },
);

router.get(
  "/gift-cards/cards",
  requireDashboardAuth,
  async (req, res): Promise<void> => {
    try {
      const user = req.dashboardUser!;
      const requested =
        typeof req.query.tenant_id === "string"
          ? req.query.tenant_id.trim()
          : null;
      const scope = resolveScopedTenantId(user, requested || null);
      if (!scope.ok) {
        res.status(403).json({ error: scope.error });
        return;
      }
      const tenantId = scope.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: "tenant_id required" });
        return;
      }
      const cards = await listGiftCardsForTenant(tenantId, 100);
      res.json({ cards });
    } catch (err) {
      req.log?.error({ err }, "Dashboard gift-cards list failed");
      res.status(500).json({ error: "Failed to list gift cards" });
    }
  },
);

/**
 * Append-only migrate stub — records a Square gift card already issued.
 * Does NOT pull Owner.com. Master-only. No CrustnRoll until SEO+loyalty+GC ready.
 */
router.post(
  "/gift-cards/migrate",
  requireDashboardAuth,
  async (req, res): Promise<void> => {
    try {
      const user = req.dashboardUser!;
      if (user.role !== "master") {
        res.status(403).json({ error: "Master role required for migrate" });
        return;
      }
      const body = (req.body ?? {}) as {
        tenant_id?: string;
        square_gift_card_id?: string;
        gan?: string;
        balance_cents?: number;
        external_ref?: string;
        reason?: string;
      };
      const scope = resolveScopedTenantId(user, body.tenant_id || null);
      if (!scope.ok) {
        res.status(403).json({ error: scope.error });
        return;
      }
      const tenantId = scope.tenantId;
      const squareGiftCardId = String(body.square_gift_card_id || "").trim();
      const externalRef = String(body.external_ref || "").trim();
      const reason = String(body.reason || "").trim();
      const balanceCents = Number(body.balance_cents);
      if (
        !tenantId ||
        !squareGiftCardId ||
        !externalRef ||
        !reason ||
        !Number.isFinite(balanceCents)
      ) {
        res.status(400).json({
          error:
            "tenant_id, square_gift_card_id, balance_cents, external_ref, reason required",
        });
        return;
      }
      const result = await recordMigratedGiftCard({
        tenantId,
        squareGiftCardId,
        gan: typeof body.gan === "string" ? body.gan : undefined,
        balanceCents,
        externalRef,
        reason,
      });
      res.json(result);
    } catch (err) {
      req.log?.error({ err }, "Dashboard gift-cards migrate failed");
      res.status(500).json({
        error: err instanceof Error ? err.message : "Migrate failed",
      });
    }
  },
);


export default router;
export { ensureSeed as ensureDashboardSeed };
