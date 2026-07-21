/**
 * Meta Page OAuth — allow-listed tenants only until Advanced Access.
 * GET /api/meta/oauth/start?tenant_id=
 * GET /api/meta/oauth/callback
 * GET /api/meta/oauth/status?tenant_id=
 * Dual-mount: /api/dashboard/meta/*
 */
import { Router, type RequestHandler } from "express";
import {
  buildMetaAuthorizeUrl,
  checkMetaPageOauthReadiness,
  completeMetaPageOauth,
  getMetaOauthConnectionForTenant,
  isMetaPageOauthEnabled,
  isMetaPageOauthPublic,
  isTenantAllowedForMetaPageOauth,
  metaPageOauthAllowlist,
  signMetaPageOauthState,
  verifyMetaPageOauthState,
} from "../lib/metaOauth";
import {
  readDashboardSessionToken,
  resolveDashboardSession,
  resolveScopedTenantId,
} from "../lib/dashboardAuth";

declare global {
  namespace Express {
    interface Request {
      metaOauthActor?: {
        label: string;
        role: "master" | "manager";
        tenantId: string | null;
      };
    }
  }
}

const router = Router();

const requireDashAccess: RequestHandler = async (req, res, next) => {
  try {
    const internalKey =
      process.env.META_OAUTH_INTERNAL_API_KEY?.trim() ||
      process.env.SOCIAL_INTERNAL_API_KEY?.trim();
    const headerKey =
      req.headers["x-meta-oauth-internal-key"] ||
      req.headers["x-social-internal-key"];
    if (internalKey && typeof headerKey === "string" && headerKey === internalKey) {
      req.metaOauthActor = {
        label: "internal-key",
        role: "master",
        tenantId: null,
      };
      next();
      return;
    }
    const user = await resolveDashboardSession(readDashboardSessionToken(req));
    if (user) {
      req.metaOauthActor = {
        label: user.email,
        role: user.role,
        tenantId: user.tenantId,
      };
      next();
      return;
    }
    res.status(401).json({
      error:
        "Not authenticated. Sign in via /api/dashboard/login or send X-Meta-Oauth-Internal-Key.",
    });
  } catch (err) {
    req.log?.error({ err }, "Meta OAuth auth failed");
    res.status(500).json({ error: "Auth check failed" });
  }
};

router.get("/oauth/callback", async (req, res): Promise<void> => {
  const successBase =
    process.env.META_PAGE_OAUTH_SUCCESS_REDIRECT?.trim() ||
    "https://orderlyfoods.com/dashboard";
  const bounce = (params: Record<string, string>): void => {
    const url = new URL(successBase);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    res.redirect(url.toString());
  };

  try {
    const ready = checkMetaPageOauthReadiness();
    if (!ready.ok) {
      bounce({ meta: "error", meta_error: ready.error });
      return;
    }
    if (typeof req.query.error === "string") {
      bounce({ meta: "error", meta_error: `Meta denied: ${req.query.error}` });
      return;
    }
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const verified = verifyMetaPageOauthState(state);
    if (!verified.ok) {
      bounce({ meta: "error", meta_error: verified.error });
      return;
    }
    if (!isTenantAllowedForMetaPageOauth(verified.tenantId)) {
      bounce({
        meta: "error",
        meta_error: "Tenant not allow-listed for Meta Page OAuth.",
      });
      return;
    }
    const preferred =
      typeof req.query.page_id === "string" ? req.query.page_id.trim() : null;
    const row = await completeMetaPageOauth({
      code,
      tenantId: verified.tenantId,
      preferredPageId: preferred,
    });
    bounce({
      meta: "connected",
      meta_tenant: row.tenantId,
      meta_page: row.pageId,
      meta_page_name: row.pageName || "",
    });
  } catch (err) {
    req.log?.error({ err }, "Meta Page OAuth callback failed");
    bounce({
      meta: "error",
      meta_error: err instanceof Error ? err.message : "OAuth callback failed",
    });
  }
});

router.use(requireDashAccess);

router.get("/oauth/status", async (req, res): Promise<void> => {
  try {
    const actor = req.metaOauthActor!;
    const requested =
      typeof req.query.tenant_id === "string" ? req.query.tenant_id.trim() : null;
    const scope = resolveScopedTenantId(
      { role: actor.role, tenantId: actor.tenantId },
      requested,
    );
    if (!scope.ok) {
      res.status(403).json({ error: scope.error });
      return;
    }
    const tenantId = scope.tenantId;
    if (!tenantId) {
      res.status(400).json({ error: "Pick a single tenant_id." });
      return;
    }
    const ready = checkMetaPageOauthReadiness();
    const row = await getMetaOauthConnectionForTenant(tenantId);
    res.json({
      ok: true,
      tenant_id: tenantId,
      enabled: isMetaPageOauthEnabled(),
      public_third_party: isMetaPageOauthPublic(),
      allowlist: metaPageOauthAllowlist(),
      tenant_allowed: isTenantAllowedForMetaPageOauth(tenantId),
      oauth_app_ready: ready.ok,
      oauth_app_error: ready.ok ? null : ready.error,
      oauth_connected: Boolean(row),
      page_id: row?.pageId ?? null,
      page_name: row?.pageName ?? null,
      note: isMetaPageOauthPublic()
        ? "PUBLIC mode — third-party Pages allowed (Advanced Access assumed)."
        : "DEV/allow-list only — do not connect client Pages until Advanced Access.",
    });
  } catch (err) {
    req.log?.error({ err }, "Meta OAuth status failed");
    res.status(500).json({ error: "Status failed" });
  }
});

router.get("/oauth/start", async (req, res): Promise<void> => {
  try {
    const ready = checkMetaPageOauthReadiness();
    if (!ready.ok) {
      res.status(503).json({ error: ready.error });
      return;
    }
    const actor = req.metaOauthActor!;
    const requested =
      typeof req.query.tenant_id === "string" ? req.query.tenant_id.trim() : null;
    const scope = resolveScopedTenantId(
      { role: actor.role, tenantId: actor.tenantId },
      requested,
    );
    if (!scope.ok) {
      res.status(403).json({ error: scope.error });
      return;
    }
    const tenantId = scope.tenantId;
    if (!tenantId) {
      res.status(400).json({ error: "Pick a single tenant_id." });
      return;
    }
    if (!isTenantAllowedForMetaPageOauth(tenantId)) {
      res.status(403).json({
        error: `Tenant "${tenantId}" is not allow-listed. Default allowlist: ${metaPageOauthAllowlist().join(", ")}. Third-party Pages require Advanced Access + META_PAGE_OAUTH_PUBLIC=1.`,
      });
      return;
    }
    const authorizeUrl = buildMetaAuthorizeUrl(signMetaPageOauthState(tenantId));
    if (req.query.json === "1") {
      res.json({ ok: true, authorize_url: authorizeUrl, tenant_id: tenantId });
      return;
    }
    res.redirect(authorizeUrl);
  } catch (err) {
    req.log?.error({ err }, "Meta OAuth start failed");
    res.status(500).json({ error: "Could not start Meta OAuth." });
  }
});

export default router;
