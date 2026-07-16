/**
 * Client dashboard (/client) + Kitchen Display System (KDS) API.
 *
 * Owner-facing. EVERY data access is scoped to `req.clientUser.tenantId` taken
 * from the login session — never from a URL/query/body parameter. This is the
 * tenant-isolation guarantee: owner A can never read or mutate tenant B's data,
 * even by hand-crafting a request.
 */
import { Router, type RequestHandler } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, ordersTable, orderLinesTable } from "@workspace/db";
import {
  clientSessionCookieName,
  ensureClientSeedUsers,
  loginClientUser,
  logoutClientSession,
  readClientSessionToken,
  resolveClientSession,
  type ClientUser,
} from "../lib/clientAuth";
import {
  buildLiveOrders,
  buildReportSummary,
  type ReportRange,
} from "../lib/dashboardReports";
import { applyKitchenStatus, isKitchenStatus } from "../lib/kitchenStatus";
import {
  computePickupEstimate,
  getKitchenSettings,
  upsertKitchenSettings,
} from "../lib/kitchenSettings";

declare global {
  namespace Express {
    interface Request {
      clientUser?: ClientUser;
    }
  }
}

const router = Router();

const VALID_RANGES = new Set<ReportRange>(["today", "7d", "28d", "30d"]);
function parseRange(raw: unknown): ReportRange {
  if (typeof raw === "string" && VALID_RANGES.has(raw as ReportRange)) {
    return raw as ReportRange;
  }
  return "today";
}

/**
 * Strict boolean parse. NEVER use Boolean() on request input: Boolean("false")
 * is true, which for orders_paused would silently pause a tenant. Returns
 * undefined for anything we don't clearly recognize (caller rejects with 400).
 */
function parseStrictBool(raw: unknown): boolean | undefined {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw === 1 ? true : raw === 0 ? false : undefined;
  if (typeof raw === "string") {
    const s = raw.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes" || s === "on") return true;
    if (s === "false" || s === "0" || s === "no" || s === "off") return false;
  }
  return undefined;
}

/** Active KDS statuses (what the kitchen still has to act on). */
const KDS_ACTIVE_STATUSES = ["pending", "preparing", "ready"] as const;

function setSessionCookie(
  res: {
    cookie: (n: string, v: string, o: Record<string, unknown>) => void;
  },
  token: string,
  expiresAt: Date,
): void {
  res.cookie(clientSessionCookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

function clearSessionCookie(res: {
  clearCookie: (n: string, o?: Record<string, unknown>) => void;
}): void {
  res.clearCookie(clientSessionCookieName(), { path: "/" });
}

const requireClientAuth: RequestHandler = async (req, res, next) => {
  try {
    const user = await resolveClientSession(readClientSessionToken(req));
    if (!user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    req.clientUser = user;
    next();
  } catch (err) {
    req.log?.error({ err }, "Client auth failed");
    res.status(500).json({ error: "Auth check failed" });
  }
};

let seedPromise: Promise<void> | null = null;
function ensureSeed(): Promise<void> {
  if (!seedPromise) seedPromise = ensureClientSeedUsers();
  return seedPromise;
}

// ---- Auth ----------------------------------------------------------------

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
    const result = await loginClientUser(email, password);
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
    req.log?.error({ err }, "Client login failed");
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/logout", async (req, res): Promise<void> => {
  try {
    const token = readClientSessionToken(req);
    if (token) await logoutClientSession(token);
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (err) {
    req.log?.error({ err }, "Client logout failed");
    clearSessionCookie(res);
    res.status(500).json({ error: "Logout failed" });
  }
});

router.get("/me", requireClientAuth, (req, res): void => {
  const user = req.clientUser!;
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

// ---- Summary (owner landing) --------------------------------------------

router.get("/summary", requireClientAuth, async (req, res): Promise<void> => {
  try {
    const tenantId = req.clientUser!.tenantId; // session-scoped, always
    const range = parseRange(req.query.range);
    const [summary, live] = await Promise.all([
      buildReportSummary({ tenantId, range }),
      buildLiveOrders({ tenantId, range }),
    ]);
    res.json({
      tenant_id: tenantId,
      range,
      totals: summary.totals,
      live_counts: live.counts,
    });
  } catch (err) {
    req.log?.error({ err }, "Client summary failed");
    res.status(500).json({ error: "Summary failed" });
  }
});

// ---- Kitchen settings (prep time / busy / pause) ------------------------

router.get(
  "/settings/kitchen",
  requireClientAuth,
  async (req, res): Promise<void> => {
    try {
      const settings = await getKitchenSettings(req.clientUser!.tenantId);
      res.json({ settings, estimate: computePickupEstimate(settings) });
    } catch (err) {
      req.log?.error({ err }, "Get kitchen settings failed");
      res.status(500).json({ error: "Failed to load settings" });
    }
  },
);

router.patch(
  "/settings/kitchen",
  requireClientAuth,
  async (req, res): Promise<void> => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const patch: {
        prepTimeMinutes?: number;
        busyMode?: boolean;
        busyExtraMinutes?: number;
        ordersPaused?: boolean;
      } = {};
      if (body.prep_time_minutes !== undefined) {
        const n = Number(body.prep_time_minutes);
        if (!Number.isFinite(n)) {
          res.status(400).json({ error: "prep_time_minutes must be a number" });
          return;
        }
        patch.prepTimeMinutes = n;
      }
      if (body.busy_extra_minutes !== undefined) {
        const n = Number(body.busy_extra_minutes);
        if (!Number.isFinite(n)) {
          res.status(400).json({ error: "busy_extra_minutes must be a number" });
          return;
        }
        patch.busyExtraMinutes = n;
      }
      if (body.busy_mode !== undefined) {
        const b = parseStrictBool(body.busy_mode);
        if (b === undefined) {
          res.status(400).json({ error: "busy_mode must be a boolean" });
          return;
        }
        patch.busyMode = b;
      }
      if (body.orders_paused !== undefined) {
        const b = parseStrictBool(body.orders_paused);
        if (b === undefined) {
          res.status(400).json({ error: "orders_paused must be a boolean" });
          return;
        }
        patch.ordersPaused = b;
      }
      const settings = await upsertKitchenSettings(
        req.clientUser!.tenantId,
        patch,
      );
      res.json({ settings, estimate: computePickupEstimate(settings) });
    } catch (err) {
      req.log?.error({ err }, "Update kitchen settings failed");
      res.status(500).json({ error: "Failed to save settings" });
    }
  },
);

// ---- KDS board -----------------------------------------------------------

router.get("/kds/orders", requireClientAuth, async (req, res): Promise<void> => {
  try {
    const tenantId = req.clientUser!.tenantId; // session-scoped, always
    // Only orders belonging to this tenant, still active in the kitchen.
    const orders = await db
      .select()
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.tenantId, tenantId),
          inArray(ordersTable.status, [...KDS_ACTIVE_STATUSES]),
        ),
      )
      .orderBy(desc(ordersTable.createdAt))
      .limit(100);

    const orderIds = orders.map((o) => o.id);
    const lines = orderIds.length
      ? await db
          .select()
          .from(orderLinesTable)
          .where(inArray(orderLinesTable.orderId, orderIds))
      : [];
    const linesByOrder = new Map<string, typeof lines>();
    for (const l of lines) {
      const arr = linesByOrder.get(l.orderId) ?? [];
      arr.push(l);
      linesByOrder.set(l.orderId, arr);
    }

    const settings = await getKitchenSettings(tenantId);
    const estimate = computePickupEstimate(settings);

    res.json({
      tenant_id: tenantId,
      settings,
      estimate,
      orders: orders.map((o) => ({
        id: o.id,
        short_code: o.id.slice(-5).toUpperCase(),
        status: o.status,
        order_type: o.orderType,
        channel: o.channel,
        customer_name: o.customerName,
        total_cents: o.totalCents,
        special_instructions: o.specialInstructions,
        created_at: o.createdAt?.toISOString() ?? null,
        paid_at: o.paidAt?.toISOString() ?? null,
        accepted_at: o.acceptedAt?.toISOString() ?? null,
        ready_at: o.readyAt?.toISOString() ?? null,
        lines: (linesByOrder.get(o.id) ?? []).map((l) => ({
          name: l.menuItemName,
          quantity: l.quantity,
          special_instructions: l.specialInstructions,
        })),
      })),
    });
  } catch (err) {
    req.log?.error({ err }, "KDS board failed");
    res.status(500).json({ error: "Failed to load board" });
  }
});

router.patch(
  "/kds/orders/:id/status",
  requireClientAuth,
  async (req, res): Promise<void> => {
    try {
      const tenantId = req.clientUser!.tenantId;
      const orderId = String(req.params.id);
      const status = typeof req.body?.status === "string" ? req.body.status : "";
      if (!isKitchenStatus(status)) {
        res.status(400).json({ error: "Invalid status" });
        return;
      }
      // Ownership check BEFORE any mutation: the order must belong to the
      // session's tenant. Prevents cross-tenant status changes via a guessed id.
      const rows = await db
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.id, orderId))
        .limit(1);
      const order = rows[0];
      if (!order || order.tenantId !== tenantId) {
        res.status(404).json({ error: "Order not found" });
        return;
      }

      const result = await applyKitchenStatus({
        orderId,
        status,
        tenantId,
        log: req.log,
      });
      if (!result.ok) {
        res.status(result.http ?? 400).json({ error: result.error });
        return;
      }
      res.json({ ok: true, order_id: orderId, status, result });
    } catch (err) {
      req.log?.error({ err }, "KDS status update failed");
      res.status(500).json({ error: "Failed to update status" });
    }
  },
);

export default router;
