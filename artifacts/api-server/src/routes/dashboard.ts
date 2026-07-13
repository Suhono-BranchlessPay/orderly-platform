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

export default router;
export { ensureSeed as ensureDashboardSeed };
