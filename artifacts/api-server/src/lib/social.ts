/**
 * Blok 4.1 — Social media TRIAL skeleton business logic.
 *
 * HARD RULES (enforced here, not just in the docs):
 *  - /send only ever calls the real Meta Graph API after EVERY gate below
 *    passes: kill switch OFF, SOCIAL_SEND_ENABLED=1, status="approved",
 *    classification NOT allergy_health/complaint/spam, and a human already
 *    clicked /approve. Nothing auto-sends.
 *  - allergy_health and spam classifications are never auto-drafted.
 *  - complaint is drafted for human review, never auto-sent.
 *  - Every state change (including failed sends) writes a social_reply_audit
 *    row. The Meta access token is never written to that row.
 * See docs/BLOK4_SOCIAL_TRIAL.md.
 */
import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  socialInboxTable,
  socialReplyAuditTable,
  type SocialInboxRow,
  type SocialClassification,
  type SocialInboxStatus,
  type SocialAuditAction,
} from "@workspace/db";
import { isAiGatewayEnabled, run as aiRun } from "./ai";
import { classifySocialMessage } from "./socialClassify";
import { buildDraftReply, buildEscalationNote } from "./socialDraft";
import {
  getBrandVoiceHint,
  getMetaPageAccessToken,
  isSocialKillSwitchOn,
  isSocialSendGloballyEnabled,
} from "./socialConfig";
import { replyToMetaComment, sendMetaMessengerMessage } from "../integrations/metaGraph";

export type CreateInboxInput = {
  tenantId: string;
  platform: "facebook" | "instagram";
  /** "comment" (Page/IG feed) or "message" (Messenger/IG DM) — stored on
   * `raw.kind` so `sendApprovedReply()` knows which Graph API call to make. */
  kind?: "comment" | "message";
  externalThreadId?: string | null;
  externalMessageId?: string | null;
  authorName?: string | null;
  body?: string | null;
  raw?: Record<string, unknown>;
};

async function writeAudit(input: {
  tenantId: string;
  inboxId: string;
  action: SocialAuditAction;
  actor: string;
  beforeBody?: string | null;
  afterBody?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(socialReplyAuditTable).values({
    id: randomUUID(),
    tenantId: input.tenantId,
    inboxId: input.inboxId,
    action: input.action,
    actor: input.actor,
    beforeBody: input.beforeBody ?? null,
    afterBody: input.afterBody ?? null,
    meta: input.meta ?? {},
  });
}

/**
 * Always creates a row (or is a no-op on webhook retry duplicates). NEVER
 * sends a reply. Classification is heuristic-only and stored for triage.
 */
export async function ingestInboundMessage(
  input: CreateInboxInput,
): Promise<SocialInboxRow | null> {
  const { classification, riskFlags } = classifySocialMessage(input.body);

  const inserted = await db
    .insert(socialInboxTable)
    .values({
      id: randomUUID(),
      tenantId: input.tenantId,
      platform: input.platform,
      externalThreadId: input.externalThreadId ?? null,
      externalMessageId: input.externalMessageId ?? null,
      direction: "in",
      authorName: input.authorName ?? null,
      body: input.body ?? null,
      classification,
      status: "new",
      riskFlags,
      raw: { ...(input.raw ?? {}), kind: input.kind ?? "comment" },
    })
    .onConflictDoNothing({
      target: [
        socialInboxTable.tenantId,
        socialInboxTable.platform,
        socialInboxTable.externalMessageId,
      ],
    })
    .returning();

  return inserted[0] ?? null;
}

export async function listInbox(params: {
  tenantId: string | null;
  status?: string | null;
  limit?: number;
}): Promise<SocialInboxRow[]> {
  const conditions = [];
  if (params.tenantId) conditions.push(eq(socialInboxTable.tenantId, params.tenantId));
  if (params.status) conditions.push(eq(socialInboxTable.status, params.status));

  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);

  const query = db.select().from(socialInboxTable);
  const rows = conditions.length
    ? await query
        .where(and(...conditions))
        .orderBy(desc(socialInboxTable.createdAt))
        .limit(limit)
    : await query.orderBy(desc(socialInboxTable.createdAt)).limit(limit);
  return rows;
}

export async function getInboxRow(id: string): Promise<SocialInboxRow | null> {
  const rows = await db
    .select()
    .from(socialInboxTable)
    .where(eq(socialInboxTable.id, id))
    .limit(1);
  return rows[0] ?? null;
}

async function updateInboxRow(
  id: string,
  set: Partial<typeof socialInboxTable.$inferInsert>,
): Promise<SocialInboxRow | null> {
  const rows = await db
    .update(socialInboxTable)
    .set({ ...set, updatedAt: new Date() })
    .where(eq(socialInboxTable.id, id))
    .returning();
  return rows[0] ?? null;
}

export type DraftResult = {
  row: SocialInboxRow;
  escalate: boolean;
  note: string | null;
};

/**
 * Generates (or refuses to generate) a draft reply based on classification.
 * allergy_health -> blocked, no draft, escalate=true.
 * spam -> skipped, no draft.
 * Prefer AI Gateway (`ai.run("social_draft")`) — peer SKIP + vendor-agnostic.
 * Emergency: AI_GATEWAY_ENABLED=0 → legacy templates only.
 */
export async function draftReplyForRow(
  id: string,
  tenantName: string,
  actor: string,
): Promise<DraftResult | null> {
  const row = await getInboxRow(id);
  if (!row) return null;

  const classification = row.classification as SocialClassification;

  if (classification === "allergy_health") {
    const updated = await updateInboxRow(id, {
      draftReply: null,
      status: "blocked",
    });
    await writeAudit({
      tenantId: row.tenantId,
      inboxId: id,
      action: "block",
      actor,
      meta: { reason: "allergy_health_keyword", note: buildEscalationNote(classification) },
    });
    return { row: updated ?? row, escalate: true, note: buildEscalationNote(classification) };
  }

  if (classification === "spam") {
    const updated = await updateInboxRow(id, {
      draftReply: null,
      status: "skipped",
    });
    await writeAudit({
      tenantId: row.tenantId,
      inboxId: id,
      action: "skip",
      actor,
      meta: { reason: "spam_keyword", note: buildEscalationNote(classification) },
    });
    return { row: updated ?? row, escalate: false, note: buildEscalationNote(classification) };
  }

  if (isAiGatewayEnabled()) {
    const ai = await aiRun({
      task: "social_draft",
      tenantId: row.tenantId,
      input: {
        message_text: row.body ?? "",
        author_name: row.authorName,
        author_first_name: row.authorName?.trim().split(/\s+/)[0] ?? "",
        tenant_name: tenantName,
        heuristic_classification: classification,
        brand_voice: getBrandVoiceHint(row.tenantId),
        platform: row.platform,
        message_type: "comment",
        engagement_mode: process.env.SOCIAL_ENGAGEMENT_MODE?.trim() || "conservative",
        tenant_languages: "en",
        order_url: process.env.SOCIAL_ORDER_URL?.trim() || "https://samurairesto.com",
      },
      opts: { responseFormat: "json" },
    });

    const out = ai.ok
      ? (ai.output as {
          classification?: string;
          reason?: string;
          draft?: string;
          confidence?: number;
        })
      : null;

    if (out?.classification === "skip") {
      const updated = await updateInboxRow(id, {
        draftReply: null,
        status: "skipped",
      });
      await writeAudit({
        tenantId: row.tenantId,
        inboxId: id,
        action: "skip",
        actor,
        meta: {
          reason: out.reason ?? "ai_skip",
          provider: ai.provider,
          model: ai.model,
        },
      });
      return {
        row: updated ?? row,
        escalate: false,
        note: `Skipped by AI gateway (${out.reason ?? "peer/no-reply-needed"}).`,
      };
    }

    if (out?.classification === "escalate" && !out.draft) {
      const updated = await updateInboxRow(id, {
        draftReply: null,
        status: "blocked",
      });
      await writeAudit({
        tenantId: row.tenantId,
        inboxId: id,
        action: "block",
        actor,
        meta: {
          reason: out.reason ?? "ai_escalate",
          provider: ai.provider,
          model: ai.model,
        },
      });
      return {
        row: updated ?? row,
        escalate: true,
        note: `Escalated by AI gateway (${out.reason ?? "needs_human"}).`,
      };
    }

    if (out?.classification === "reply" && out.draft?.trim()) {
      const updated = await updateInboxRow(id, {
        draftReply: out.draft.trim(),
        status: "pending_approval",
      });
      const isComplaint = classification === "complaint";
      return {
        row: updated ?? row,
        escalate: isComplaint,
        note: isComplaint
          ? "Complaint drafted for review only — hard rule forbids auto-sending complaint replies. Alert the owner."
          : null,
      };
    }
    // Gateway failed → fall through to legacy templates.
  }

  const draft = buildDraftReply({
    classification,
    authorName: row.authorName,
    tenantName,
    brandVoiceHint: getBrandVoiceHint(row.tenantId),
  });

  const updated = await updateInboxRow(id, {
    draftReply: draft,
    status: "pending_approval",
  });

  const isComplaint = classification === "complaint";
  return {
    row: updated ?? row,
    escalate: isComplaint,
    note: isComplaint
      ? "Complaint drafted for review only — hard rule forbids auto-sending complaint replies. Alert the owner."
      : null,
  };
}

export type ApproveResult =
  | { ok: true; row: SocialInboxRow }
  | { ok: false; error: string };

export async function approveInboxRow(
  id: string,
  editedBody: string | undefined,
  actor: string,
): Promise<ApproveResult> {
  const row = await getInboxRow(id);
  if (!row) return { ok: false, error: "Inbox row not found" };

  if (row.status !== "pending_approval" && row.status !== "drafted") {
    return {
      ok: false,
      error: `Cannot approve from status "${row.status}" (expected pending_approval or drafted)`,
    };
  }
  if (row.classification === "allergy_health") {
    return { ok: false, error: "Blocked classification (allergy_health) cannot be approved" };
  }

  const finalBody = editedBody?.trim() ? editedBody.trim() : row.draftReply;
  if (!finalBody) {
    return { ok: false, error: "No draft or edited_body to approve" };
  }

  const updated = await updateInboxRow(id, {
    draftReply: finalBody,
    status: "approved",
  });

  await writeAudit({
    tenantId: row.tenantId,
    inboxId: id,
    action: editedBody?.trim() && editedBody.trim() !== row.draftReply ? "edit" : "approve",
    actor,
    beforeBody: row.draftReply,
    afterBody: finalBody,
    meta: { edited: Boolean(editedBody?.trim() && editedBody.trim() !== row.draftReply) },
  });

  return { ok: true, row: updated ?? row };
}

export async function skipInboxRow(
  id: string,
  actor: string,
  reason?: string,
): Promise<SocialInboxRow | null> {
  const row = await getInboxRow(id);
  if (!row) return null;
  const updated = await updateInboxRow(id, { status: "skipped" });
  await writeAudit({
    tenantId: row.tenantId,
    inboxId: id,
    action: "skip",
    actor,
    beforeBody: row.draftReply,
    meta: reason ? { reason } : {},
  });
  return updated ?? row;
}

export type SendResult =
  | { ok: true; row: SocialInboxRow; sent: "sent"; externalReplyId: string | null }
  | { ok: false; status: number; error: string };

type SendTarget =
  | { ok: true; kind: "comment"; commentId: string }
  | { ok: true; kind: "message"; recipientPsid: string }
  | { ok: false; error: string };

/**
 * Decides which Graph API call to make and with which id, using only data
 * already stored on the inbox row (never guesses at a live Meta lookup).
 * Fails honestly with a 400 (via the caller) when the id needed for that
 * kind of reply is missing — this is the "use external_message_id when
 * present; if missing, fail honestly" rule from the trial spec.
 */
function resolveSendTarget(row: SocialInboxRow): SendTarget {
  const raw = (row.raw ?? {}) as Record<string, unknown>;
  const kind = raw.kind === "message" ? "message" : "comment";

  if (kind === "message") {
    const recipientPsid = row.externalThreadId?.trim();
    if (!recipientPsid) {
      return {
        ok: false,
        error:
          "This is a Messenger thread but no external_thread_id (PSID) is stored on the row — cannot send without it.",
      };
    }
    return { ok: true, kind: "message", recipientPsid };
  }

  const commentId = row.externalMessageId?.trim();
  if (!commentId) {
    return {
      ok: false,
      error: "Missing external_message_id (Meta comment id) on this row — cannot reply without it.",
    };
  }
  return { ok: true, kind: "comment", commentId };
}

/**
 * Real, HARD-GATED Meta Graph API send. Every gate below must pass, in
 * order, before any HTTP call is made:
 *   1. Kill switch OFF for this tenant.
 *   2. Classification is not allergy_health / complaint / spam.
 *   3. Row status is "approved" (a human already ran /approve).
 *   4. SOCIAL_SEND_ENABLED=1 (global off-by-default gate).
 *   5. A Page access token is configured for this tenant.
 *   6. The row has the id Graph needs for its kind (comment id or PSID).
 * Every outcome — success or failure — writes a social_reply_audit row.
 * The access token itself is never written to that row or returned.
 */
export async function sendApprovedReply(id: string, actor: string): Promise<SendResult> {
  const row = await getInboxRow(id);
  if (!row) return { ok: false, status: 404, error: "Inbox row not found" };

  if (isSocialKillSwitchOn(row.tenantId)) {
    await writeAudit({
      tenantId: row.tenantId,
      inboxId: id,
      action: "kill_switch",
      actor,
      meta: { blocked_send: true },
    });
    return { ok: false, status: 403, error: `Kill switch is ON for tenant "${row.tenantId}"` };
  }

  if (
    row.classification === "allergy_health" ||
    row.classification === "complaint" ||
    row.classification === "spam"
  ) {
    return {
      ok: false,
      status: 403,
      error: `Classification "${row.classification}" may never be auto-sent through this endpoint (hard rule)`,
    };
  }

  if (row.status !== "approved") {
    return { ok: false, status: 409, error: `Row must be status "approved" (currently "${row.status}")` };
  }

  if (!isSocialSendGloballyEnabled()) {
    return {
      ok: false,
      status: 501,
      error: "Sending is disabled — set SOCIAL_SEND_ENABLED=1 to allow the send gate to open.",
    };
  }

  const token = getMetaPageAccessToken(row.tenantId);
  if (!token) {
    return {
      ok: false,
      status: 501,
      error: `No META_PAGE_ACCESS_TOKEN configured for tenant "${row.tenantId}".`,
    };
  }

  const message = row.draftReply?.trim();
  if (!message) {
    return { ok: false, status: 400, error: "Row has no approved reply body to send." };
  }

  const target = resolveSendTarget(row);
  if (!target.ok) {
    await writeAudit({
      tenantId: row.tenantId,
      inboxId: id,
      action: "send_failed",
      actor,
      beforeBody: row.draftReply,
      meta: { reason: target.error },
    });
    return { ok: false, status: 400, error: target.error };
  }

  const result =
    target.kind === "comment"
      ? await replyToMetaComment(target.commentId, message, token)
      : await sendMetaMessengerMessage(target.recipientPsid, message, token);

  if (!result.ok) {
    await writeAudit({
      tenantId: row.tenantId,
      inboxId: id,
      action: "send_failed",
      actor,
      beforeBody: row.draftReply,
      meta: { kind: target.kind, meta_status: result.status, meta_error: result.error },
    });
    return {
      ok: false,
      status: 502,
      error: `Meta Graph API send failed: ${result.error}`,
    };
  }

  const updated = await updateInboxRow(id, { status: "sent" });
  await writeAudit({
    tenantId: row.tenantId,
    inboxId: id,
    action: "send",
    actor,
    beforeBody: row.draftReply,
    afterBody: row.draftReply,
    meta: { kind: target.kind, external_reply_id: result.externalReplyId, real: true },
  });

  return { ok: true, row: updated ?? row, sent: "sent", externalReplyId: result.externalReplyId };
}

export async function listAuditForInbox(inboxId: string) {
  return db
    .select()
    .from(socialReplyAuditTable)
    .where(eq(socialReplyAuditTable.inboxId, inboxId))
    .orderBy(desc(socialReplyAuditTable.createdAt));
}

export type SocialTenantHealth = {
  tenant_id: string;
  kill_switch: boolean;
  send_globally_enabled: boolean;
  meta_token_configured: boolean;
};

export function buildSocialHealth(tenantIds: string[]): {
  send_globally_enabled: boolean;
  tenants: SocialTenantHealth[];
} {
  return {
    send_globally_enabled: isSocialSendGloballyEnabled(),
    tenants: tenantIds.map((tenantId) => ({
      tenant_id: tenantId,
      kill_switch: isSocialKillSwitchOn(tenantId),
      send_globally_enabled: isSocialSendGloballyEnabled(),
      meta_token_configured: Boolean(getMetaPageAccessToken(tenantId)),
    })),
  };
}

export function toPublicInboxRow(row: SocialInboxRow) {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    platform: row.platform,
    external_thread_id: row.externalThreadId,
    external_message_id: row.externalMessageId,
    direction: row.direction,
    author_name: row.authorName,
    body: row.body,
    classification: row.classification,
    draft_reply: row.draftReply,
    status: row.status as SocialInboxStatus,
    risk_flags: row.riskFlags,
    created_at: row.createdAt?.toISOString?.() ?? row.createdAt,
    updated_at: row.updatedAt?.toISOString?.() ?? row.updatedAt,
  };
}
