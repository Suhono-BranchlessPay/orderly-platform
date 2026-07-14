/**
 * Blok 4.2 — Google Business Profile TRIAL skeleton (samurai only).
 * Human approve only. See docs/BLOK4_GBP_TRIAL.md.
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
  GBP_TRIAL_TENANT_IDS,
  buildGbpHealth,
  resolveTenantIdForGbpLocation,
} from "../lib/gbpConfig";
import { parseGbpWebhookBody } from "../lib/gbpWebhook";
import {
  approveGbpInboxRow,
  draftGbpReplyForRow,
  getGbpInboxRow,
  ingestGbpMessage,
  listGbpAuditForInbox,
  listGbpInbox,
  sendApprovedGbpReply,
  skipGbpInboxRow,
  toPublicGbpRow,
} from "../lib/gbp";
import { GBP_STATUSES } from "@workspace/db";

declare global {
  namespace Express {
    interface Request {
      gbpActor?: { label: string; role: "master" | "manager"; tenantId: string | null };
    }
  }
}

const router = Router();

const requireGbpAccess: RequestHandler = async (req, res, next) => {
  try {
    const internalKey =
      process.env.GBP_INTERNAL_API_KEY?.trim() ||
      process.env.SOCIAL_INTERNAL_API_KEY?.trim();
    const headerKey =
      req.headers["x-gbp-internal-key"] || req.headers["x-social-internal-key"];
    if (internalKey && typeof headerKey === "string" && headerKey === internalKey) {
      req.gbpActor = { label: "internal-key", role: "master", tenantId: null };
      next();
      return;
    }

    const user = await resolveDashboardSession(readDashboardSessionToken(req));
    if (user) {
      req.gbpActor = { label: user.email, role: user.role, tenantId: user.tenantId };
      next();
      return;
    }

    res.status(401).json({
      error:
        "Not authenticated. Sign in via /api/dashboard/login or send X-Gbp-Internal-Key.",
    });
  } catch (err) {
    req.log?.error({ err }, "GBP auth check failed");
    res.status(500).json({ error: "Auth check failed" });
  }
};

function scopedTenantOrRespond(
  req: { query: Record<string, unknown>; gbpActor?: Request["gbpActor"] },
  res: { status: (c: number) => { json: (b: unknown) => void } },
): string | null | undefined {
  const actor = req.gbpActor!;
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

/** Pub/Sub / future Google notifications — receive-only, always 200. */
router.post("/webhooks/gbp", async (req, res): Promise<void> => {
  try {
    const messages = parseGbpWebhookBody(req.body);
    let ingested = 0;
    let duplicates = 0;
    for (const msg of messages) {
      const tenantId = resolveTenantIdForGbpLocation(msg.locationId);
      const row = await ingestGbpMessage({
        tenantId,
        kind: msg.kind,
        externalLocationId: msg.locationId ?? null,
        externalMessageId: msg.externalMessageId,
        authorName: msg.authorName,
        body: msg.body,
        starRating: msg.starRating,
        raw: { locationId: msg.locationId ?? null, source: "gbp_webhook" },
      });
      if (row) ingested += 1;
      else duplicates += 1;
    }
    res.status(200).json({
      ok: true,
      ingested,
      duplicates,
      note: "receive-only — no reply sent",
    });
  } catch (err) {
    req.log?.error({ err }, "GBP webhook receive failed");
    res.status(200).json({ ok: false, note: "receive failed — see server logs" });
  }
});

router.get("/health", (_req, res): void => {
  res.json({
    ok: true,
    service: "orderly-gbp-trial",
    ...buildGbpHealth(GBP_TRIAL_TENANT_IDS),
  });
});

router.use(requireGbpAccess);

/** Authenticated simulate — same shape as webhook, for console/curl smoke. */
router.post("/simulate", async (req, res): Promise<void> => {
  try {
    const schema = z.object({
      kind: z.enum(["review", "question"]).default("review"),
      tenant_id: z.string().optional(),
      location_id: z.string().optional(),
      author_name: z.string().optional(),
      body: z.string().min(1),
      star_rating: z.number().int().min(1).max(5).optional(),
      external_message_id: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const d = parsed.data;
    const tenantId =
      d.tenant_id?.trim() ||
      resolveTenantIdForGbpLocation(d.location_id) ||
      "samurai";

    if (!(GBP_TRIAL_TENANT_IDS as readonly string[]).includes(tenantId)) {
      res.status(403).json({
        error: `Tenant "${tenantId}" is not in the GBP trial allow-list (samurai only).`,
      });
      return;
    }

    const access = resolveScopedTenantId(
      { role: req.gbpActor!.role, tenantId: req.gbpActor!.tenantId },
      tenantId,
    );
    if (!access.ok) {
      res.status(403).json({ error: access.error });
      return;
    }

    const externalMessageId =
      d.external_message_id?.trim() ||
      `sim_${d.kind}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const row = await ingestGbpMessage({
      tenantId,
      kind: d.kind,
      externalLocationId: d.location_id ?? null,
      externalMessageId,
      authorName: d.author_name ?? "Simulated Guest",
      body: d.body,
      starRating: d.kind === "review" ? (d.star_rating ?? 5) : null,
      raw: { source: "gbp_simulate", actor: req.gbpActor!.label },
    });

    if (!row) {
      res.status(200).json({ ok: true, ingested: 0, duplicates: 1 });
      return;
    }
    res.status(200).json({ ok: true, ingested: 1, duplicates: 0, row: toPublicGbpRow(row) });
  } catch (err) {
    req.log?.error({ err }, "GBP simulate failed");
    res.status(500).json({ error: "Simulate failed" });
  }
});

router.get("/inbox", async (req, res): Promise<void> => {
  try {
    const tenantId = scopedTenantOrRespond(req, res);
    if (tenantId === undefined) return;

    const statusRaw =
      typeof req.query.status === "string" ? req.query.status.trim() : null;
    if (
      statusRaw &&
      !(GBP_STATUSES as readonly string[]).includes(statusRaw)
    ) {
      res.status(400).json({ error: `status must be one of: ${GBP_STATUSES.join(", ")}` });
      return;
    }

    const rows = await listGbpInbox({
      tenantId: tenantId || "samurai",
      status: statusRaw,
    });
    // Trial UI is samurai-scoped; if master passes another tenant, still filter trial.
    const filtered = rows.filter((r) =>
      (GBP_TRIAL_TENANT_IDS as readonly string[]).includes(r.tenantId),
    );
    res.json({ ok: true, inbox: filtered.map(toPublicGbpRow) });
  } catch (err) {
    req.log?.error({ err }, "GBP list inbox failed");
    res.status(500).json({ error: "Failed to list GBP inbox" });
  }
});

router.get("/inbox/:id", async (req, res): Promise<void> => {
  try {
    const row = await getGbpInboxRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const scope = resolveScopedTenantId(
      { role: req.gbpActor!.role, tenantId: req.gbpActor!.tenantId },
      row.tenantId,
    );
    if (!scope.ok) {
      res.status(403).json({ error: scope.error });
      return;
    }
    const audit = await listGbpAuditForInbox(row.id);
    res.json({ ok: true, row: toPublicGbpRow(row), audit });
  } catch (err) {
    req.log?.error({ err }, "GBP get inbox failed");
    res.status(500).json({ error: "Failed to load row" });
  }
});

router.post("/inbox/:id/draft", async (req, res): Promise<void> => {
  try {
    const row = await getGbpInboxRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const scope = resolveScopedTenantId(
      { role: req.gbpActor!.role, tenantId: req.gbpActor!.tenantId },
      row.tenantId,
    );
    if (!scope.ok) {
      res.status(403).json({ error: scope.error });
      return;
    }
    const tenant = await findTenantById(row.tenantId);
    const tenantName = tenant?.name || row.tenantId;
    const result = await draftGbpReplyForRow(
      row.id,
      tenantName,
      req.gbpActor!.label,
    );
    if (!result) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({
      ok: true,
      row: toPublicGbpRow(result.row),
      escalate: result.escalate,
      note: result.note,
    });
  } catch (err) {
    req.log?.error({ err }, "GBP draft failed");
    res.status(500).json({ error: "Draft failed" });
  }
});

router.post("/inbox/:id/approve", async (req, res): Promise<void> => {
  try {
    const body = z
      .object({ edited_body: z.string().optional() })
      .safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: body.error.flatten() });
      return;
    }
    const existing = await getGbpInboxRow(req.params.id);
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const scope = resolveScopedTenantId(
      { role: req.gbpActor!.role, tenantId: req.gbpActor!.tenantId },
      existing.tenantId,
    );
    if (!scope.ok) {
      res.status(403).json({ error: scope.error });
      return;
    }
    const result = await approveGbpInboxRow(
      existing.id,
      req.gbpActor!.label,
      body.data.edited_body,
    );
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ ok: true, status: result.row.status, row: toPublicGbpRow(result.row) });
  } catch (err) {
    req.log?.error({ err }, "GBP approve failed");
    res.status(500).json({ error: "Approve failed" });
  }
});

router.post("/inbox/:id/skip", async (req, res): Promise<void> => {
  try {
    const reason =
      typeof req.body?.reason === "string" ? req.body.reason : undefined;
    const existing = await getGbpInboxRow(req.params.id);
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const scope = resolveScopedTenantId(
      { role: req.gbpActor!.role, tenantId: req.gbpActor!.tenantId },
      existing.tenantId,
    );
    if (!scope.ok) {
      res.status(403).json({ error: scope.error });
      return;
    }
    const row = await skipGbpInboxRow(existing.id, req.gbpActor!.label, reason);
    res.json({ ok: true, row: row ? toPublicGbpRow(row) : null });
  } catch (err) {
    req.log?.error({ err }, "GBP skip failed");
    res.status(500).json({ error: "Skip failed" });
  }
});

router.post("/inbox/:id/send", async (req, res): Promise<void> => {
  try {
    const existing = await getGbpInboxRow(req.params.id);
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const scope = resolveScopedTenantId(
      { role: req.gbpActor!.role, tenantId: req.gbpActor!.tenantId },
      existing.tenantId,
    );
    if (!scope.ok) {
      res.status(403).json({ error: scope.error });
      return;
    }
    const result = await sendApprovedGbpReply(existing.id, req.gbpActor!.label);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({
      ok: true,
      status: result.row.status,
      external_reply_id: result.externalReplyId,
      row: toPublicGbpRow(result.row),
    });
  } catch (err) {
    req.log?.error({ err }, "GBP send failed");
    res.status(500).json({ error: "Send failed" });
  }
});

export default router;
