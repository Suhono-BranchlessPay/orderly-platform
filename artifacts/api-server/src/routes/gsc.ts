/**
 * Google Search Console OAuth connect (dashboard / ops).
 * GET /api/gsc/oauth/start?tenantId=samurai&siteUrl=https://samurairesto.com/
 * GET /api/gsc/oauth/callback
 *
 * Auth note: no admin session yet. Optional gate: set GSC_OAUTH_OPS_TOKEN and
 * pass ?token=… or header x-gsc-oauth-token. siteUrl is validated against the
 * tenant domain (https + same host only).
 */
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
  if (!opsToken) return true;
  const provided = String(
    req.query.token || req.headers["x-gsc-oauth-token"] || "",
  ).trim();
  return provided === opsToken;
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
