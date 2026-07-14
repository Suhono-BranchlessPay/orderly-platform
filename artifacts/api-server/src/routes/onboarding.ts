/**
 * Self-serve onboarding — Blok 3.1.
 *
 * Square OAuth (/square/start, /square/callback) is REAL — see
 * docs/SELF_SERVE_ONBOARDING.md. Everything else here is still a skeleton:
 *  - /publish is hard-gated behind ONBOARDING_PUBLISH_ENABLED=1 and, even
 *    then, only ever creates a "draft" (inactive) tenants row.
 *  - menu-draft is opaque JSON — never written to live menu tables.
 *
 * Mounted at /api/onboarding AND /api/dashboard/onboarding (see
 * routes/index.ts — the latter is so Orderly's VPS nginx, which currently
 * only proxies /api/dashboard/*, can reach it too). Marked exempt in
 * middleware/tenant.ts since a prospective restaurant has no tenant yet.
 */
import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import {
  ONBOARDING_VARIANTS,
  getOnboardingSessionPublic,
  createOnboardingSession,
  setSessionTheme,
  setSessionVariant,
  setSessionMenuDraft,
  setSessionDomain,
  setSessionSquareOauthState,
  findOnboardingSessionByOauthState,
  markSessionSquareConnected,
  getOnboardingSessionRow,
  publishDraftTenantShell,
  markSessionPublished,
} from "../lib/onboarding";
import {
  SQUARE_OAUTH_SCOPES,
  buildSquareAuthorizeUrl,
  checkSquareOauthReadiness,
  completeSquareOauthExchange,
  saveSquareOauthConnection,
  squareOauthEnvironment,
} from "../lib/squareOauth";

const router = Router();

function isPublishEnabled(): boolean {
  return process.env.ONBOARDING_PUBLISH_ENABLED === "1";
}

const startSchema = z.object({
  restaurantName: z.string().trim().min(1).max(120),
  address: z.string().trim().max(240).optional(),
  contact: z
    .object({
      email: z.string().trim().email().optional(),
      phone: z.string().trim().max(32).optional(),
      name: z.string().trim().max(120).optional(),
    })
    .partial()
    .optional(),
  cuisine: z.string().trim().max(60).optional(),
});

router.post("/start", async (req, res): Promise<void> => {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const session = await createOnboardingSession(parsed.data);
    res.status(201).json({
      session,
      note: "Skeleton onboarding session (Blok 3.1). Not a live tenant yet.",
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding start failed");
    res.status(500).json({ error: "Failed to start onboarding session" });
  }
});

router.get("/status", async (req, res): Promise<void> => {
  const id = typeof req.query.session === "string" ? req.query.session.trim() : "";
  if (!id) {
    res.status(400).json({ error: "?session=<id> is required" });
    return;
  }
  try {
    const session = await getOnboardingSessionPublic(id);
    if (!session) {
      res.status(404).json({ error: "Onboarding session not found" });
      return;
    }
    res.json({ session });
  } catch (err) {
    req.log?.error({ err }, "Onboarding status lookup failed");
    res.status(500).json({ error: "Failed to load onboarding status" });
  }
});

const themeSchema = z.object({
  logoUrl: z.string().trim().url().max(500).optional(),
});

router.post("/:id/theme", async (req, res): Promise<void> => {
  const parsed = themeSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const session = await setSessionTheme(req.params.id, parsed.data.logoUrl ?? null);
    if (!session) {
      res.status(404).json({ error: "Onboarding session not found" });
      return;
    }
    res.json({
      session,
      note: "Stub theme: deterministic palette from name hash, not ML.",
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding theme step failed");
    res.status(500).json({ error: "Failed to set theme" });
  }
});

const variantSchema = z.object({
  variant: z.string().trim().min(1).max(40),
});

router.post("/:id/variant", async (req, res): Promise<void> => {
  const parsed = variantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  if (!ONBOARDING_VARIANTS.includes(parsed.data.variant as never)) {
    res.status(400).json({
      error: `variant must be one of: ${ONBOARDING_VARIANTS.join(", ")}`,
    });
    return;
  }
  try {
    const session = await setSessionVariant(req.params.id, parsed.data.variant);
    if (!session) {
      res.status(404).json({ error: "Onboarding session not found" });
      return;
    }
    res.json({ session });
  } catch (err) {
    req.log?.error({ err }, "Onboarding variant step failed");
    res.status(500).json({ error: "Failed to set variant" });
  }
});

const menuItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  price: z.number().nonnegative().max(10000).optional(),
  category: z.string().trim().max(80).optional(),
  description: z.string().trim().max(500).optional(),
});

const menuDraftSchema = z.object({
  items: z.array(menuItemSchema).max(200),
});

router.post("/:id/menu-draft", async (req, res): Promise<void> => {
  const parsed = menuDraftSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const session = await setSessionMenuDraft(req.params.id, parsed.data.items);
    if (!session) {
      res.status(404).json({ error: "Onboarding session not found" });
      return;
    }
    res.json({
      session,
      note: "Draft only — not published to the live menu.",
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding menu-draft step failed");
    res.status(500).json({ error: "Failed to save menu draft" });
  }
});

const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

const domainSchema = z.object({
  subdomain: z.string().trim().toLowerCase().max(63).optional(),
  domain: z.string().trim().toLowerCase().max(253).optional(),
});

router.post("/:id/domain", async (req, res): Promise<void> => {
  const parsed = domainSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { subdomain, domain } = parsed.data;
  if (!subdomain && !domain) {
    res.status(400).json({ error: "subdomain or domain is required" });
    return;
  }
  let value: string;
  if (domain) {
    if (!DOMAIN_RE.test(domain)) {
      res.status(400).json({ error: "domain is not a valid hostname" });
      return;
    }
    value = domain;
  } else {
    if (!SUBDOMAIN_RE.test(subdomain!)) {
      res.status(400).json({ error: "subdomain must be lowercase alphanumeric/hyphen" });
      return;
    }
    value = `${subdomain}.orderlyfoods.com`;
  }
  try {
    const session = await setSessionDomain(req.params.id, value);
    if (!session) {
      res.status(404).json({ error: "Onboarding session not found" });
      return;
    }
    res.json({ session });
  } catch (err) {
    req.log?.error({ err }, "Onboarding domain step failed");
    res.status(500).json({ error: "Failed to set domain" });
  }
});

router.get("/:id/preview", async (req, res): Promise<void> => {
  try {
    const session = await getOnboardingSessionPublic(req.params.id);
    if (!session) {
      res.status(404).json({ error: "Onboarding session not found" });
      return;
    }
    const menuItems = Array.isArray(
      (session.menuDraft as Record<string, unknown> | null)?.items,
    )
      ? ((session.menuDraft as Record<string, unknown>).items as unknown[])
      : [];
    res.json({
      preview: {
        restaurantName: session.restaurantName,
        address: session.address,
        cuisine: session.cuisine,
        theme: session.theme,
        variant: session.variant,
        domain: session.domain,
        menuItemCount: menuItems.length,
        status: session.status,
      },
      note: "Preview only — nothing here is live/published.",
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding preview failed");
    res.status(500).json({ error: "Failed to build preview" });
  }
});

/**
 * REAL Square OAuth start. Creates a CSRF `state`, saves it on the session,
 * and returns the authorize URL as JSON — the wizard does
 * `window.location = authorizeUrl` itself rather than us forcing a redirect,
 * so the caller can show a "you're leaving to Square" message first.
 *
 * Platform Square app credentials come from env only
 * (SQUARE_OAUTH_APPLICATION_ID / SQUARE_OAUTH_APPLICATION_SECRET) and the
 * token encryption key (ORDERLY_TOKEN_ENCRYPTION_KEY) must also be set
 * before this will succeed — see docs/SELF_SERVE_ONBOARDING.md.
 */
router.post("/:id/square/start", async (req, res): Promise<void> => {
  const readiness = checkSquareOauthReadiness();
  if (!readiness.ok) {
    res.status(503).json({ error: readiness.error });
    return;
  }
  try {
    const row = await getOnboardingSessionRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: "Onboarding session not found" });
      return;
    }
    const state = randomUUID();
    await setSessionSquareOauthState(req.params.id, state);
    const authorizeUrl = buildSquareAuthorizeUrl(state);
    res.status(200).json({
      authorizeUrl,
      state,
      environment: squareOauthEnvironment(),
      scopes: SQUARE_OAUTH_SCOPES,
      note: "Redirect the browser to authorizeUrl (e.g. window.location = authorizeUrl). The restaurant authorizes Square directly — Orderly never sees their Square password.",
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding square/start failed");
    res.status(500).json({ error: "Failed to start Square OAuth" });
  }
});

function squareCallbackErrorHtml(message: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Square connection failed</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;background:#F5F3EC;color:#16201A;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#fff;border:1px solid #E5E2D8;border-radius:14px;padding:28px;max-width:440px;text-align:center}
h1{font-size:18px;color:#B4453C;margin-bottom:8px}p{color:#5E655D;font-size:14px}</style></head>
<body><div class="card"><h1>Square connection failed</h1><p>${message}</p><p>Close this tab and try again from the onboarding wizard.</p></div></body></html>`;
}

function squareCallbackSuccessHtml(input: {
  restaurantName: string;
  locationName: string | null;
  environment: string;
}): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Square connected</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;background:#F5F3EC;color:#16201A;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#fff;border:1px solid #E5E2D8;border-radius:14px;padding:28px;max-width:440px;text-align:center}
h1{font-size:18px;color:#1E6A4F;margin-bottom:8px}p{color:#5E655D;font-size:14px}
.badge{display:inline-block;background:#E7F0EA;color:#154B39;border-radius:999px;padding:4px 10px;font-size:12px;font-weight:700;margin-top:10px}</style></head>
<body><div class="card"><h1>✅ Square connected</h1><p><strong>${input.restaurantName}</strong> authorized Orderly to read/write orders for <strong>${input.locationName ?? "their Square location"}</strong>.</p>
<span class="badge">${input.environment.toUpperCase()}</span>
<p>You can close this tab and return to the onboarding wizard.</p></div></body></html>`;
}

/**
 * REAL Square OAuth callback. Verifies `state` against
 * onboarding_sessions.square_oauth_state, exchanges the code for tokens,
 * lists locations, picks the first ACTIVE one, and stores encrypted tokens
 * in square_oauth_connections. Redirects to the Orderly wizard host when
 * ONBOARDING_UI_BASE_URL is configured; otherwise renders a small HTML
 * success/error page (this endpoint is hit directly by Square's redirect,
 * not fetched via JS, so it must render *something* browsable either way).
 */
router.get("/square/callback", async (req, res): Promise<void> => {
  const uiBaseUrl = process.env.ONBOARDING_UI_BASE_URL?.trim();

  const squareError =
    typeof req.query.error === "string" ? req.query.error : undefined;
  if (squareError) {
    const description =
      typeof req.query.error_description === "string"
        ? req.query.error_description
        : squareError;
    res.status(400).send(squareCallbackErrorHtml(`Square said: ${description}`));
    return;
  }

  const code = typeof req.query.code === "string" ? req.query.code.trim() : "";
  const state = typeof req.query.state === "string" ? req.query.state.trim() : "";
  if (!code || !state) {
    res.status(400).send(squareCallbackErrorHtml("Missing code or state parameter."));
    return;
  }

  const readiness = checkSquareOauthReadiness();
  if (!readiness.ok) {
    res.status(503).send(squareCallbackErrorHtml(readiness.error));
    return;
  }

  try {
    const session = await findOnboardingSessionByOauthState(state);
    if (!session) {
      res
        .status(400)
        .send(
          squareCallbackErrorHtml(
            "This connection link has expired or was already used. Please restart the Square connection step.",
          ),
        );
      return;
    }

    const exchange = await completeSquareOauthExchange(code);
    await saveSquareOauthConnection({
      onboardingSessionId: session.id,
      exchange,
    });
    await markSessionSquareConnected(
      session.id,
      exchange.merchantId,
      exchange.locationId,
    );

    if (uiBaseUrl) {
      const redirectUrl = new URL("/onboarding", uiBaseUrl);
      redirectUrl.searchParams.set("session", session.id);
      redirectUrl.searchParams.set("square", "connected");
      res.redirect(302, redirectUrl.toString());
      return;
    }

    res.status(200).send(
      squareCallbackSuccessHtml({
        restaurantName: session.restaurantName,
        locationName: exchange.locationName,
        environment: exchange.environment,
      }),
    );
  } catch (err) {
    req.log?.error({ err }, "Square OAuth callback failed");
    res
      .status(502)
      .send(
        squareCallbackErrorHtml(
          "Orderly could not complete the Square connection. No charges were made — please try again.",
        ),
      );
  }
});

router.post("/:id/publish", async (req, res): Promise<void> => {
  if (!isPublishEnabled()) {
    res.status(501).json({
      error: "Publish is disabled in this skeleton.",
      note: "Set ONBOARDING_PUBLISH_ENABLED=1 to allow creating a draft/inactive tenant shell.",
    });
    return;
  }
  try {
    const row = await getOnboardingSessionRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: "Onboarding session not found" });
      return;
    }
    if (row.status === "published") {
      res.status(409).json({ error: "Session already published" });
      return;
    }
    const { tenantId } = await publishDraftTenantShell(row);
    await markSessionPublished(req.params.id);
    res.json({
      ok: true,
      tenantId,
      status: "draft",
      note: "Draft/inactive tenant shell created. A human must activate it via the normal tenant admin path — no money paths touched.",
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding publish failed");
    res.status(500).json({ error: "Failed to publish onboarding session" });
  }
});

export default router;
