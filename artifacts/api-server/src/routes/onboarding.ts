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
  createOnboardingInvite,
  getInviteByToken,
  invitePublicView,
  startSessionFromInvite,
  saveWizardStep1,
  saveWizardStep2,
  saveWizardStep3,
  saveWizardStep4,
  saveWizardStep5,
  saveWizardStep6,
  saveWizardStep7,
  saveWizardStep8,
  saveWizardStep9,
  saveWizardStep10,
  saveWizardStep11,
  verifyInviteAdminKey,
  inviteAdminKeyConfigured,
} from "../lib/onboarding";
import {
  assertPublishGates,
  evaluateOnboardingReview,
} from "../lib/onboardingReview";
import {
  previewSquareCatalogForSession,
  skuPrefixConflicts,
} from "../lib/onboardingCatalog";
import { getOnboardingGoogleStatus } from "../lib/onboardingGoogle";
import { getOnboardingSocialStatus } from "../lib/onboardingSocial";
import { normalizeSkuPrefix } from "../lib/onboardingWizard";
import {
  SQUARE_OAUTH_SCOPES,
  buildSquareAuthorizeUrl,
  checkSquareOauthReadiness,
  completeSquareOauthExchange,
  getSquareOauthConnectionForSession,
  listSquareLocationsForOnboardingSession,
  saveSquareOauthConnection,
  saveSquareOauthConnectionForTenant,
  setSquareLocationForOnboardingSession,
  squareOauthEnvironment,
  verifySquareTenantOauthState,
} from "../lib/squareOauth";
import { findTenantById } from "../lib/tenant";
import {
  getTenantSlugById,
  syncSquareMenuForTenant,
  triggerMenuSyncForTenantId,
} from "../lib/squareMenuSync";

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

/**
 * Create invite (staff). Requires header:
 *   X-Onboarding-Invite-Key: $ONBOARDING_INVITE_ADMIN_KEY
 * Not public signup — see docs/SELF_SERVE_ONBOARDING_WIZARD.md.
 */
router.post("/invites", async (req, res): Promise<void> => {
  if (!inviteAdminKeyConfigured()) {
    res.status(503).json({
      error:
        "Invite creation disabled — set ONBOARDING_INVITE_ADMIN_KEY on the API host.",
    });
    return;
  }
  if (!verifyInviteAdminKey(req.header("x-onboarding-invite-key") ?? undefined)) {
    res.status(401).json({ error: "Invalid invite admin key" });
    return;
  }
  const schema = z.object({
    label: z.string().trim().max(160).optional(),
    targetSlug: z.string().trim().max(80).optional(),
    contactEmail: z.string().trim().email().optional(),
    createdBy: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(500).optional(),
    expiresInDays: z.number().int().min(1).max(90).optional(),
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const invite = await createOnboardingInvite(parsed.data);
    const base =
      process.env.ONBOARDING_UI_BASE_URL?.replace(/\/$/, "") ||
      "https://orderlyfoods.com";
    res.status(201).json({
      invite: {
        id: invite.id,
        token: invite.token,
        expiresAt: invite.expiresAt,
        url: `${base}/onboarding?invite=${invite.token}`,
      },
      note: "One-time invite. Share the url privately — not a public signup link.",
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding invite create failed");
    res.status(500).json({ error: "Failed to create invite" });
  }
});

router.get("/invite/:token", async (req, res): Promise<void> => {
  try {
    const invite = await getInviteByToken(req.params.token);
    if (!invite) {
      res.status(404).json({ error: "Invite not found" });
      return;
    }
    res.json({ invite: invitePublicView(invite) });
  } catch (err) {
    req.log?.error({ err }, "Onboarding invite lookup failed");
    res.status(500).json({ error: "Failed to load invite" });
  }
});

/** Preferred start path — invite-gated wizard. */
router.post("/start-with-invite", async (req, res): Promise<void> => {
  const schema = z.object({
    inviteToken: z.string().trim().min(16).max(128),
    restaurantName: z.string().trim().min(1).max(160).optional(),
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const result = await startSessionFromInvite(parsed.data);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.status(result.resumed ? 200 : 201).json({
      session: result.session,
      resumed: result.resumed,
      note: "Invite-gated wizard session. Not a live tenant yet.",
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding start-with-invite failed");
    res.status(500).json({ error: "Failed to start onboarding from invite" });
  }
});

/**
 * Legacy open start — disabled when ONBOARDING_REQUIRE_INVITE=1 (default for prod intent).
 */
router.post("/start", async (req, res): Promise<void> => {
  if (process.env.ONBOARDING_REQUIRE_INVITE !== "0") {
    res.status(403).json({
      error:
        "Open signup disabled. Use an invite link (?invite=…) or POST /start-with-invite.",
    });
    return;
  }
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

router.put("/:id/steps/1", async (req, res): Promise<void> => {
  try {
    const result = await saveWizardStep1(req.params.id, req.body ?? {}, {
      complete: false,
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({
      session: result.session,
      note: "Step 1 draft saved. Phone still required before Complete.",
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding step1 draft failed");
    res.status(500).json({ error: "Failed to save Step 1 draft" });
  }
});

router.post("/:id/steps/1/complete", async (req, res): Promise<void> => {
  try {
    const result = await saveWizardStep1(req.params.id, req.body ?? {}, {
      complete: true,
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({
      session: result.session,
      note: "Step 1 complete — identity locked for draft. Continue to Step 2 (service style).",
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding step1 complete failed");
    res.status(500).json({ error: "Failed to complete Step 1" });
  }
});

router.put("/:id/steps/2", async (req, res): Promise<void> => {
  try {
    const result = await saveWizardStep2(req.params.id, req.body ?? {}, {
      complete: false,
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({
      session: result.session,
      note: "Step 2 draft saved. All fields required before Complete (AI gate).",
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding step2 draft failed");
    res.status(500).json({ error: "Failed to save Step 2 draft" });
  }
});

router.post("/:id/steps/2/complete", async (req, res): Promise<void> => {
  try {
    const result = await saveWizardStep2(req.params.id, req.body ?? {}, {
      complete: true,
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({
      session: result.session,
      note: "Step 2 complete — service style locked for AI Gateway. Continue to Step 3 (hours/timezone).",
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding step2 complete failed");
    res.status(500).json({ error: "Failed to complete Step 2" });
  }
});

router.put("/:id/steps/3", async (req, res): Promise<void> => {
  try {
    const result = await saveWizardStep3(req.params.id, req.body ?? {}, {
      complete: false,
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({
      session: result.session,
      note: "Step 3 draft saved. Confirm timezone + all 7 weekdays before Complete.",
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding step3 draft failed");
    res.status(500).json({ error: "Failed to save Step 3 draft" });
  }
});

router.post("/:id/steps/3/complete", async (req, res): Promise<void> => {
  try {
    const result = await saveWizardStep3(req.params.id, req.body ?? {}, {
      complete: true,
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({
      session: result.session,
      note: "Step 3 complete — timezone + hours locked. Continue to Step 4 (Square).",
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding step3 complete failed");
    res.status(500).json({ error: "Failed to complete Step 3" });
  }
});

router.put("/:id/steps/4", async (req, res): Promise<void> => {
  try {
    const result = await saveWizardStep4(req.params.id, req.body ?? {}, {
      complete: false,
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({
      session: result.session,
      note: "Step 4 draft saved. Connect Square, pick location, confirm tax before Complete.",
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding step4 draft failed");
    res.status(500).json({ error: "Failed to save Step 4 draft" });
  }
});

router.post("/:id/steps/4/complete", async (req, res): Promise<void> => {
  try {
    const result = await saveWizardStep4(req.params.id, req.body ?? {}, {
      complete: true,
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({
      session: result.session,
      note: "Step 4 complete — Square + tax locked (fail-closed). Continue to Step 5 (menu).",
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding step4 complete failed");
    res.status(500).json({ error: "Failed to complete Step 4" });
  }
});

router.put("/:id/steps/5", async (req, res): Promise<void> => {
  try {
    const result = await saveWizardStep5(req.params.id, req.body ?? {}, {
      complete: false,
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({
      session: result.session,
      note: "Step 5 draft saved. Confirm SKU prefix + ambiguous names before Complete.",
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding step5 draft failed");
    res.status(500).json({ error: "Failed to save Step 5 draft" });
  }
});

router.post("/:id/steps/5/complete", async (req, res): Promise<void> => {
  try {
    const result = await saveWizardStep5(req.params.id, req.body ?? {}, {
      complete: true,
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({
      session: result.session,
      note: "Step 5 complete — catalog gates locked. Full Square→Orderly sync runs at publish. Continue to Step 6 (photos).",
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding step5 complete failed");
    res.status(500).json({ error: "Failed to complete Step 5" });
  }
});

router.put("/:id/steps/6", async (req, res): Promise<void> => {
  try {
    const result = await saveWizardStep6(req.params.id, req.body ?? {}, {
      complete: false,
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({
      session: result.session,
      note: "Step 6 draft saved. Soft gate — acknowledge coverage (and needs-photo plan if gaps).",
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding step6 draft failed");
    res.status(500).json({ error: "Failed to save Step 6 draft" });
  }
});

router.post("/:id/steps/6/complete", async (req, res): Promise<void> => {
  try {
    const result = await saveWizardStep6(req.params.id, req.body ?? {}, {
      complete: true,
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({
      session: result.session,
      note: "Step 6 complete — photo coverage acknowledged (warn gate). Continue to Step 7 (social).",
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding step6 complete failed");
    res.status(500).json({ error: "Failed to complete Step 6" });
  }
});

router.put("/:id/steps/7", async (req, res): Promise<void> => {
  try {
    const result = await saveWizardStep7(req.params.id, req.body ?? {}, {
      complete: false,
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({
      session: result.session,
      note: "Step 7 draft saved. Default path is contact-us until Meta OAuth is verified.",
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding step7 draft failed");
    res.status(500).json({ error: "Failed to save Step 7 draft" });
  }
});

router.post("/:id/steps/7/complete", async (req, res): Promise<void> => {
  try {
    const result = await saveWizardStep7(req.params.id, req.body ?? {}, {
      complete: true,
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({
      session: result.session,
      note: "Step 7 complete — social path locked. Continue to Step 8 (Google).",
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding step7 complete failed");
    res.status(500).json({ error: "Failed to complete Step 7" });
  }
});

router.put("/:id/steps/8", async (req, res): Promise<void> => {
  try {
    const result = await saveWizardStep8(req.params.id, req.body ?? {}, {
      complete: false,
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({
      session: result.session,
      note: "Step 8 draft saved. GBP may stay manual/pending; GSC verified is fail-closed.",
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding step8 draft failed");
    res.status(500).json({ error: "Failed to save Step 8 draft" });
  }
});

router.post("/:id/steps/8/complete", async (req, res): Promise<void> => {
  try {
    const result = await saveWizardStep8(req.params.id, req.body ?? {}, {
      complete: true,
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({
      session: result.session,
      note: "Step 8 complete — Google gates locked. Continue to Step 9 (reports).",
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding step8 complete failed");
    res.status(500).json({ error: "Failed to complete Step 8" });
  }
});

router.put("/:id/steps/9", async (req, res): Promise<void> => {
  try {
    const result = await saveWizardStep9(req.params.id, req.body ?? {}, {
      complete: false,
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({
      session: result.session,
      note: "Step 9 draft saved. Owner email + local send hour (Step 3 TZ).",
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding step9 draft failed");
    res.status(500).json({ error: "Failed to save Step 9 draft" });
  }
});

router.post("/:id/steps/9/complete", async (req, res): Promise<void> => {
  try {
    const result = await saveWizardStep9(req.params.id, req.body ?? {}, {
      complete: true,
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({
      session: result.session,
      note: "Step 9 complete — daily report ops locked. Continue to Step 10 (compliance).",
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding step9 complete failed");
    res.status(500).json({ error: "Failed to complete Step 9" });
  }
});

router.put("/:id/steps/10", async (req, res): Promise<void> => {
  try {
    const result = await saveWizardStep10(req.params.id, req.body ?? {}, {
      complete: false,
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({
      session: result.session,
      note: "Step 10 draft saved. Health Dept clearance required to continue.",
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding step10 draft failed");
    res.status(500).json({ error: "Failed to save Step 10 draft" });
  }
});

router.post("/:id/steps/10/complete", async (req, res): Promise<void> => {
  try {
    const result = await saveWizardStep10(req.params.id, req.body ?? {}, {
      complete: true,
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({
      session: result.session,
      note: "Step 10 complete — compliance locked. Continue to Step 11 (Review & Go Live).",
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding step10 complete failed");
    res.status(500).json({ error: "Failed to complete Step 10" });
  }
});

router.put("/:id/steps/11", async (req, res): Promise<void> => {
  try {
    const result = await saveWizardStep11(req.params.id, req.body ?? {}, {
      complete: false,
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({
      session: result.session,
      note: "Step 11 draft saved. Mark ready ≠ Go Live / publish.",
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding step11 draft failed");
    res.status(500).json({ error: "Failed to save Step 11 draft" });
  }
});

router.post("/:id/steps/11/complete", async (req, res): Promise<void> => {
  try {
    const result = await saveWizardStep11(req.params.id, req.body ?? {}, {
      complete: true,
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({
      session: result.session,
      note: "Step 11 ready — session marked ready. Go Live is a separate POST /publish (draft/inactive shell only).",
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding step11 complete failed");
    res.status(500).json({ error: "Failed to complete Step 11" });
  }
});

router.get("/:id/review", async (req, res): Promise<void> => {
  try {
    const row = await getOnboardingSessionRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: "Onboarding session not found" });
      return;
    }
    const review = evaluateOnboardingReview(row, {
      publishEnabled: isPublishEnabled(),
    });
    res.json({
      ...review,
      sessionStatus: row.status,
      currentStep: row.currentStep ?? 1,
      note: "Go Live ≠ Save draft. Publish creates a draft/inactive tenant shell only when ONBOARDING_PUBLISH_ENABLED=1.",
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding review failed");
    res.status(500).json({ error: "Failed to load review" });
  }
});

router.get("/:id/google/status", async (req, res): Promise<void> => {
  try {
    const row = await getOnboardingSessionRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: "Onboarding session not found" });
      return;
    }
    const status = await getOnboardingGoogleStatus({ inviteId: row.inviteId });
    res.json({
      ...status,
      domainHint: row.domain || null,
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding google status failed");
    res.status(500).json({ error: "Failed to load Google status" });
  }
});

router.get("/:id/social/status", async (req, res): Promise<void> => {
  try {
    const row = await getOnboardingSessionRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: "Onboarding session not found" });
      return;
    }
    const status = await getOnboardingSocialStatus({ inviteId: row.inviteId });
    res.json({
      ...status,
      identityHints: {
        facebookPageUrl:
          ((row.wizard as { identity?: { facebookPageUrl?: string } } | null)
            ?.identity?.facebookPageUrl) ||
          ((row.contact as { facebookPageUrl?: string } | null)
            ?.facebookPageUrl) ||
          null,
        instagramHandle:
          ((row.wizard as { identity?: { instagramHandle?: string } } | null)
            ?.identity?.instagramHandle) ||
          ((row.contact as { instagramHandle?: string } | null)
            ?.instagramHandle) ||
          null,
      },
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding social status failed");
    res.status(500).json({ error: "Failed to load social status" });
  }
});

router.get("/:id/catalog/preview", async (req, res): Promise<void> => {
  try {
    const row = await getOnboardingSessionRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: "Onboarding session not found" });
      return;
    }
    const result = await previewSquareCatalogForSession(req.params.id);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({
      ...result,
      note: "Read-only preview. Live menu_items sync runs when the draft tenant is published.",
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding catalog preview failed");
    res.status(500).json({ error: "Failed to preview catalog" });
  }
});

router.get("/:id/catalog/sku-prefix", async (req, res): Promise<void> => {
  try {
    const row = await getOnboardingSessionRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: "Onboarding session not found" });
      return;
    }
    const prefix = normalizeSkuPrefix(
      typeof req.query.prefix === "string" ? req.query.prefix : "",
    );
    if (prefix.length < 2) {
      res.status(400).json({ error: "prefix query (2+ chars) is required" });
      return;
    }
    const conflicts = await skuPrefixConflicts(prefix);
    res.json({
      ...conflicts,
      available: !conflicts.reserved && !conflicts.usedInLiveMenu,
      convention: `${prefix}-{CAT}-{NNN}`,
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding sku-prefix check failed");
    res.status(500).json({ error: "Failed to check SKU prefix" });
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

router.get("/:id/square/locations", async (req, res): Promise<void> => {
  try {
    const row = await getOnboardingSessionRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: "Onboarding session not found" });
      return;
    }
    const result = await listSquareLocationsForOnboardingSession(req.params.id);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({
      merchantId: result.merchantId,
      selectedLocationId: result.selectedLocationId,
      locations: result.locations,
      sessionSquare: {
        connected: Boolean(row.squareMerchantId && row.squareLocationId),
        merchantId: row.squareMerchantId,
        locationId: row.squareLocationId,
      },
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding square/locations failed");
    res.status(500).json({ error: "Failed to list Square locations" });
  }
});

router.put("/:id/square/location", async (req, res): Promise<void> => {
  try {
    const locationId =
      typeof req.body?.locationId === "string" ? req.body.locationId.trim() : "";
    if (!locationId) {
      res.status(400).json({ error: "locationId is required" });
      return;
    }
    const row = await getOnboardingSessionRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: "Onboarding session not found" });
      return;
    }
    const result = await setSquareLocationForOnboardingSession(
      req.params.id,
      locationId,
    );
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    const session = await markSessionSquareConnected(
      req.params.id,
      result.merchantId,
      result.locationId,
    );
    res.json({
      ok: true,
      locationId: result.locationId,
      locationName: result.locationName,
      session,
      note: "Square location saved. Confirm tax rate to complete Step 4.",
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding square/location failed");
    res.status(500).json({ error: "Failed to set Square location" });
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
 * REAL Square OAuth callback (shared redirect URI).
 *
 * Two state shapes:
 * 1) Dashboard tenant connect — HMAC-signed (`sq-tenant`) → save for tenant,
 *    bounce to orderlyfoods.com/dashboard
 * 2) Onboarding wizard — UUID in onboarding_sessions.square_oauth_state
 */
router.get("/square/callback", async (req, res): Promise<void> => {
  const uiBaseUrl = process.env.ONBOARDING_UI_BASE_URL?.trim();
  const dashBase =
    process.env.SQUARE_OAUTH_SUCCESS_REDIRECT?.trim() ||
    "https://orderlyfoods.com/dashboard";

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
    const tenantState = verifySquareTenantOauthState(state);
    if (tenantState.ok) {
      const tenant = await findTenantById(tenantState.tenantId);
      if (!tenant) {
        res
          .status(400)
          .send(squareCallbackErrorHtml("Tenant for this Square connect was not found."));
        return;
      }
      const exchange = await completeSquareOauthExchange(code);
      await saveSquareOauthConnectionForTenant({
        tenantId: tenant.id,
        exchange,
      });
      triggerMenuSyncForTenantId(tenant.id, "square_oauth_dashboard_callback");
      const bounce = new URL(dashBase);
      bounce.searchParams.set("square", "connected");
      bounce.searchParams.set("square_tenant", tenant.id);
      bounce.searchParams.set(
        "square_location",
        exchange.locationName || exchange.locationId,
      );
      res.redirect(302, bounce.toString());
      return;
    }

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
    const connection = await saveSquareOauthConnection({
      onboardingSessionId: session.id,
      exchange,
    });
    await markSessionSquareConnected(
      session.id,
      exchange.merchantId,
      exchange.locationId,
    );

    // Blok A — if this session's Square connection is already linked to a
    // real tenant (e.g. an existing restaurant reconnecting Square), pull
    // its menu now. Draft/unpublished sessions have no tenant yet — /publish
    // triggers the initial sync for those instead (see lib/onboarding.ts).
    if (connection.tenantId) {
      triggerMenuSyncForTenantId(connection.tenantId, "square_oauth_callback");
    }

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
    // Fail-closed before insert — surface gate errors as 409, not 500.
    try {
      assertPublishGates(row);
    } catch (gateErr) {
      res.status(409).json({
        error:
          gateErr instanceof Error
            ? gateErr.message
            : "Publish gates not satisfied",
      });
      return;
    }
    const { tenantId } = await publishDraftTenantShell(row);
    await markSessionPublished(req.params.id);
    const published = await getOnboardingSessionPublic(req.params.id);
    res.json({
      ok: true,
      tenantId,
      tenantStatus: "draft",
      session: published,
      note: "Draft/inactive tenant shell created. A human must activate it via the normal tenant admin path — no money paths touched. Paid smoke is post-Go Live ops.",
    });
  } catch (err) {
    req.log?.error({ err }, "Onboarding publish failed");
    const msg = err instanceof Error ? err.message : "";
    if (msg.startsWith("Cannot publish")) {
      res.status(409).json({ error: msg });
      return;
    }
    res.status(500).json({ error: "Failed to publish onboarding session" });
  }
});

/**
 * Blok A — manual "sync menu now" for the onboarding wizard. Only works once
 * this session's Square connection is linked to a real tenant (i.e. after
 * /publish) since Square catalog rows land in Orderly's tenant-scoped
 * menu_items/menu_categories tables, not on the draft session itself.
 */
router.post("/:id/menu/sync", async (req, res): Promise<void> => {
  try {
    const row = await getOnboardingSessionRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: "Onboarding session not found" });
      return;
    }
    const connection = await getSquareOauthConnectionForSession(row.id);
    const tenantId = connection?.tenantId ?? null;
    if (!tenantId) {
      res.status(400).json({
        error:
          "No linked tenant yet for this session — connect Square and publish first.",
      });
      return;
    }
    const slug = await getTenantSlugById(tenantId);
    if (!slug) {
      res.status(404).json({ error: "Linked tenant not found" });
      return;
    }
    const summary = await syncSquareMenuForTenant({
      tenantId,
      slug,
      reason: "manual-onboarding",
    });
    res.json({ ok: summary.ok, summary });
  } catch (err) {
    req.log?.error({ err }, "Onboarding menu sync failed");
    res.status(500).json({ error: "Failed to sync menu" });
  }
});

export default router;
