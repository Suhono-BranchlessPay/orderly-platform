/**
 * Google Search Console OAuth connect (dashboard / ops).
 * GET /api/gsc/oauth/start?tenantId=samurai&siteUrl=https://samurairesto.com/
 * GET /api/gsc/oauth/callback
 *
 * Auth: GSC_OAUTH_OPS_TOKEN required (?token=… or x-gsc-oauth-token).
 * Unset token = fail-closed (reject all). Local/dev opt-in only via
 * GSC_OAUTH_ALLOW_UNAUTH=1. siteUrl is validated against the tenant domain
 * (https + same host only).
 */
import { timingSafeEqual } from "crypto";
import { Router } from "express";
import {
  buildGscOauthStartUrl,
  checkGscOauthReadiness,
  finishGscOauth,
  parseGscOauthState,
} from "../lib/gscOauth";
import { resolveGscSiteUrlForTenant } from "../lib/gscSiteUrl";
import { findTenantById, findTenantBySlug } from "../lib/tenant";

const router = Router();

function assertGscOpsToken(req: {
  query: Record<string, unknown>;
  headers: Record<string, unknown>;
}): boolean {
  const opsToken = process.env.GSC_OAUTH_OPS_TOKEN?.trim();
  // Unset token must never mean "open door" — fail closed unless explicitly
  // opted in for local/dev (GSC_OAUTH_ALLOW_UNAUTH=1).
  if (!opsToken) {
    return process.env.GSC_OAUTH_ALLOW_UNAUTH === "1";
  }
  const provided = String(
    req.query.token || req.headers["x-gsc-oauth-token"] || "",
  ).trim();
  const a = Buffer.from(provided);
  const b = Buffer.from(opsToken);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

router.get("/oauth/start", async (req, res): Promise<void> => {
  const ready = checkGscOauthReadiness();
  if (!ready.ok) {
    res.status(503).json({ error: ready.error });
    return;
  }
  if (!assertGscOpsToken(req)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const raw = String(req.query.tenantId || req.query.tenantSlug || "samurai").trim();
  const tenant =
    (await findTenantBySlug(raw)) || (await findTenantById(raw));
  if (!tenant) {
    res.status(404).json({ error: "tenant not found" });
    return;
  }
  const siteUrl = resolveGscSiteUrlForTenant(
    req.query.siteUrl != null ? String(req.query.siteUrl) : null,
    String(tenant.domain || "samurairesto.com"),
  );
  if (!siteUrl) {
    res.status(400).json({
      error:
        "siteUrl must be https and match this tenant's domain (e.g. https://samurairesto.com/)",
    });
    return;
  }
  try {
    const url = buildGscOauthStartUrl({ tenantId: tenant.id, siteUrl });
    res.redirect(302, url);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "oauth start failed",
    });
  }
});

router.get("/oauth/callback", async (req, res): Promise<void> => {
  const ready = checkGscOauthReadiness();
  if (!ready.ok) {
    res.status(503).send(ready.error);
    return;
  }
  const err = String(req.query.error || "");
  if (err) {
    res.status(400).send(`Google OAuth error: ${err}`);
    return;
  }
  const code = String(req.query.code || "");
  const state = String(req.query.state || "");
  const parsed = parseGscOauthState(state);
  if (!code || !parsed) {
    res.status(400).send("Invalid OAuth state or missing code");
    return;
  }
  const tenant =
    (await findTenantById(parsed.tenantId)) ||
    (await findTenantBySlug(parsed.tenantId));
  if (!tenant) {
    res.status(400).send("Unknown tenant in OAuth state");
    return;
  }
  const siteUrl = resolveGscSiteUrlForTenant(
    parsed.siteUrl,
    String(tenant.domain || "samurairesto.com"),
  );
  if (!siteUrl) {
    res
      .status(400)
      .send("siteUrl in OAuth state does not match tenant domain");
    return;
  }
  const result = await finishGscOauth({
    code,
    tenantId: tenant.id,
    siteUrl,
  });
  if (!result.ok) {
    res.status(400).send(result.error);
    return;
  }
  res
    .status(200)
    .type("html")
    .send(
      `<!doctype html><html><body style="font-family:system-ui;padding:24px">
      <h1>Search Console connected</h1>
      <p>Tenant <b>${tenant.id}</b> · property <b>${siteUrl}</b></p>
      <p>Daily reports will show real query positions when Google has data (4–8 weeks to stabilize).</p>
      </body></html>`,
    );
});

export default router;
