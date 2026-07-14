/**
 * Blok 4.1 — Social media TRIAL skeleton (ONE tenant: samurai).
 *
 * MODE AWAL: every reply needs human approval. Nothing here auto-sends.
 * See docs/BLOK4_SOCIAL_TRIAL.md for setup + hard rules.
 *
 * Mounted at /api/social (see routes/index.ts) and exempted from
 * middleware/tenant.ts (it is a cross-tenant/internal API + Meta webhook,
 * not a restaurant storefront route).
 */
import { Router, type Request, type RequestHandler } from "express";
import { z } from "zod";
import {
  resolveDashboardSession,
  readDashboardSessionToken,
  resolveScopedTenantId,
} from "../lib/dashboardAuth";
import { findTenantById } from "../lib/tenant";
import {
  SOCIAL_TRIAL_TENANT_IDS,
  getMetaWebhookVerifyToken,
  resolveTenantIdForPageId,
} from "../lib/socialConfig";
import { parseMetaWebhookBody } from "../lib/socialWebhook";
import {
  approveInboxRow,
  buildSocialHealth,
  draftReplyForRow,
  getInboxRow,
  ingestInboundMessage,
  listAuditForInbox,
  listInbox,
  sendApprovedReply,
  skipInboxRow,
  toPublicInboxRow,
} from "../lib/social";
import { SOCIAL_STATUSES } from "@workspace/db";

declare global {
  namespace Express {
    interface Request {
      socialActor?: { label: string; role: "master" | "manager"; tenantId: string | null };
    }
  }
}

const router = Router();

/**
 * Dashboard session (preferred) OR a shared internal key for curl testing.
 * SOCIAL_INTERNAL_API_KEY is documented as INTERNAL ONLY — never expose it to
 * a browser or a restaurant. Prefer the dashboard login whenever possible.
 */
const requireSocialAccess: RequestHandler = async (req, res, next) => {
  try {
    const internalKey = process.env.SOCIAL_INTERNAL_API_KEY?.trim();
    const headerKey = req.headers["x-social-internal-key"];
    if (internalKey && typeof headerKey === "string" && headerKey === internalKey) {
      req.socialActor = { label: "internal-key", role: "master", tenantId: null };
      next();
      return;
    }

    const user = await resolveDashboardSession(readDashboardSessionToken(req));
    if (user) {
      req.socialActor = { label: user.email, role: user.role, tenantId: user.tenantId };
      next();
      return;
    }

    res.status(401).json({
      error:
        "Not authenticated. Sign in via /api/dashboard/login (cookie) or send X-Social-Internal-Key.",
    });
  } catch (err) {
    req.log?.error({ err }, "Social auth check failed");
    res.status(500).json({ error: "Auth check failed" });
  }
};

/** Master may pass any tenant_id; manager is force-scoped to their own tenant. */
function assertTenantAccess(
  actor: NonNullable<Request["socialActor"]>,
  tenantId: string,
): { ok: true } | { ok: false; error: string } {
  const scope = resolveScopedTenantId({ role: actor.role, tenantId: actor.tenantId }, tenantId);
  return scope.ok ? { ok: true } : { ok: false, error: scope.error };
}

function scopedTenantOrRespond(
  req: { query: Record<string, unknown>; socialActor?: Request["socialActor"] },
  res: { status: (c: number) => { json: (b: unknown) => void } },
): string | null | undefined {
  const actor = req.socialActor!;
  const requested =
    typeof req.query.tenant_id === "string" ? req.query.tenant_id.trim() : null;
  const scope = resolveScopedTenantId(
    { role: actor.role, tenantId: actor.tenantId },
    requested || null,
  );
  if (!scope.ok) {
    res.status(403).json({ error: scope.error });
    return undefined;
  }
  return scope.tenantId;
}

// ---------------------------------------------------------------------------
// Meta webhook (verify + receive). NEVER sends a reply from here.
// ---------------------------------------------------------------------------

router.get("/webhooks/meta", (req, res): void => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  const expected = getMetaWebhookVerifyToken();
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      res.status(501).json({ error: "META_WEBHOOK_VERIFY_TOKEN not configured" });
      return;
    }
    req.log?.warn(
      "META_WEBHOOK_VERIFY_TOKEN not set — accepting webhook verify in non-production only",
    );
  }

  if (mode === "subscribe" && (!expected || token === expected) && typeof challenge === "string") {
    res.status(200).send(challenge);
    return;
  }
  res.status(403).json({ error: "Webhook verification failed" });
});

router.post("/webhooks/meta", async (req, res): Promise<void> => {
  try {
    const messages = parseMetaWebhookBody(req.body);
    let ingested = 0;
    let duplicates = 0;

    for (const msg of messages) {
      const tenantId = resolveTenantIdForPageId(msg.pageId);
      const row = await ingestInboundMessage({
        tenantId,
        platform: msg.platform,
        kind: msg.kind,
        externalThreadId: msg.externalThreadId,
        externalMessageId: msg.externalMessageId,
        authorName: msg.authorName,
        body: msg.body,
        raw: { pageId: msg.pageId ?? null, source: "meta_webhook" },
      });
      if (row) ingested += 1;
      else duplicates += 1;
    }

    // Always 200 quickly — Meta retries aggressively on non-2xx/slow responses.
    // NEVER send a reply from this handler.
    res.status(200).json({ ok: true, ingested, duplicates, note: "receive-only — no reply sent" });
  } catch (err) {
    req.log?.error({ err }, "Meta webhook receive failed");
    // Still 200 so Meta doesn't hammer retries for a parsing bug on our side —
    // the message is simply lost this one time (skeleton trade-off, logged above).
    res.status(200).json({ ok: false, note: "receive failed — see server logs" });
  }
});

// ---------------------------------------------------------------------------
// Health — flags only, never token values.
// ---------------------------------------------------------------------------

router.get("/health", (_req, res): void => {
  res.json({ ok: true, service: "orderly-social-trial", ...buildSocialHealth(SOCIAL_TRIAL_TENANT_IDS) });
});

// ---------------------------------------------------------------------------
// Inbox — dashboard-auth (or internal key) protected.
// ---------------------------------------------------------------------------

router.use(requireSocialAccess);

router.get("/inbox", async (req, res): Promise<void> => {
  try {
    const tenantId = scopedTenantOrRespond(req, res);
    if (tenantId === undefined) return;

    const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
    const status =
      statusRaw && (SOCIAL_STATUSES as readonly string[]).includes(statusRaw)
        ? statusRaw
        : undefined;
    if (statusRaw && !status) {
      res.status(400).json({ error: `status must be one of: ${SOCIAL_STATUSES.join(", ")}` });
      return;
    }

    const rows = await listInbox({ tenantId, status });
    res.json({ tenant_id: tenantId, status: status ?? null, inbox: rows.map(toPublicInboxRow) });
  } catch (err) {
    req.log?.error({ err }, "Social inbox list failed");
    res.status(500).json({ error: "Failed to list social inbox" });
  }
});

router.get("/inbox/:id", async (req, res): Promise<void> => {
  try {
    const row = await getInboxRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const scope = assertTenantAccess(req.socialActor!, row.tenantId);
    if (!scope.ok) {
      res.status(403).json({ error: scope.error });
      return;
    }
    const audit = await listAuditForInbox(row.id);
    res.json({ inbox: toPublicInboxRow(row), audit });
  } catch (err) {
    req.log?.error({ err }, "Social inbox get failed");
    res.status(500).json({ error: "Failed to load inbox row" });
  }
});

router.post("/inbox/:id/draft", async (req, res): Promise<void> => {
  try {
    const row = await getInboxRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const scope = assertTenantAccess(req.socialActor!, row.tenantId);
    if (!scope.ok) {
      res.status(403).json({ error: scope.error });
      return;
    }
    let tenantName = "the restaurant";
    try {
      const tenant = await findTenantById(row.tenantId);
      if (tenant?.name) tenantName = tenant.name;
    } catch (tenantErr) {
      // Non-fatal — draft template still works with a generic name.
      req.log?.warn({ err: tenantErr }, "Social draft: tenant lookup failed, using generic name");
    }
    const result = await draftReplyForRow(row.id, tenantName, req.socialActor!.label);
    if (!result) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({
      inbox: toPublicInboxRow(result.row),
      escalate: result.escalate,
      note: result.note,
    });
  } catch (err) {
    req.log?.error({ err }, "Social draft failed");
    res.status(500).json({ error: "Failed to draft reply" });
  }
});

const approveSchema = z.object({ edited_body: z.string().max(2000).optional() });

router.post("/inbox/:id/approve", async (req, res): Promise<void> => {
  try {
    const row = await getInboxRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const scope = assertTenantAccess(req.socialActor!, row.tenantId);
    if (!scope.ok) {
      res.status(403).json({ error: scope.error });
      return;
    }
    const parsed = approveSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const result = await approveInboxRow(row.id, parsed.data.edited_body, req.socialActor!.label);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({
      inbox: toPublicInboxRow(result.row),
      send: "deferred_until_token_and_human_mode_proven",
    });
  } catch (err) {
    req.log?.error({ err }, "Social approve failed");
    res.status(500).json({ error: "Failed to approve reply" });
  }
});

router.post("/inbox/:id/skip", async (req, res): Promise<void> => {
  try {
    const row = await getInboxRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const scope = assertTenantAccess(req.socialActor!, row.tenantId);
    if (!scope.ok) {
      res.status(403).json({ error: scope.error });
      return;
    }
    const reason = typeof req.body?.reason === "string" ? req.body.reason.slice(0, 300) : undefined;
    const updated = await skipInboxRow(row.id, req.socialActor!.label, reason);
    res.json({ inbox: updated ? toPublicInboxRow(updated) : null });
  } catch (err) {
    req.log?.error({ err }, "Social skip failed");
    res.status(500).json({ error: "Failed to skip inbox row" });
  }
});

router.post("/inbox/:id/send", async (req, res): Promise<void> => {
  try {
    const row = await getInboxRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const scope = assertTenantAccess(req.socialActor!, row.tenantId);
    if (!scope.ok) {
      res.status(403).json({ error: scope.error });
      return;
    }
    const result = await sendApprovedReply(row.id, req.socialActor!.label);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({
      inbox: toPublicInboxRow(result.row),
      sent: result.sent,
      external_reply_id: result.externalReplyId,
    });
  } catch (err) {
    req.log?.error({ err }, "Social send failed");
    res.status(500).json({ error: "Failed to send reply" });
  }
});

export default router;
