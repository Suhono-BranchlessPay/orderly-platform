/**
 * Google Search Console OAuth connect (dashboard / ops).
 * GET /api/gsc/oauth/start?tenantId=samurai&siteUrl=https://samurairesto.com/
 * GET /api/gsc/oauth/callback
 */
import { Router } from "express";
import {
  buildGscOauthStartUrl,
  checkGscOauthReadiness,
  finishGscOauth,
  parseGscOauthState,
} from "../lib/gscOauth";
import { findTenantById, findTenantBySlug } from "../lib/tenant";

const router = Router();

router.get("/oauth/start", async (req, res): Promise<void> => {
  const ready = checkGscOauthReadiness();
  if (!ready.ok) {
    res.status(503).json({ error: ready.error });
    return;
  }
  const raw = String(req.query.tenantId || req.query.tenantSlug || "samurai").trim();
  const tenant =
    (await findTenantBySlug(raw)) || (await findTenantById(raw));
  if (!tenant) {
    res.status(404).json({ error: "tenant not found" });
    return;
  }
  const siteUrl = String(
    req.query.siteUrl ||
      `https://${String(tenant.domain || "samurairesto.com")
        .replace(/^https?:\/\//, "")
        .replace(/\/$/, "")}/`,
  ).trim();
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
  const result = await finishGscOauth({
    code,
    tenantId: parsed.tenantId,
    siteUrl: parsed.siteUrl,
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
      <p>Tenant <b>${parsed.tenantId}</b> · property <b>${parsed.siteUrl}</b></p>
      <p>Daily reports will show real query positions when Google has data (4–8 weeks to stabilize).</p>
      </body></html>`,
    );
});

export default router;
