/**
 * Blok 4.2 — Google Business Profile trial business logic.
 * Same hard rules as social: human draft → approve → gated send;
 * allergy_health / spam never drafted; complaint never sent.
 */
import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  gbpInboxTable,
  gbpReplyAuditTable,
  menuItemsTable,
  type GbpInboxRow,
  type GbpClassification,
  type GbpAuditAction,
  type GbpKind,
} from "@workspace/db";
import { classifySocialMessage } from "./socialClassify";
import { buildDraftReply, buildEscalationNote } from "./socialDraft";
import {
  isGbpAutoDraftEnabled,
  isGbpKillSwitchOn,
  isGbpSendGloballyEnabled,
  resolveGbpAccessToken,
  resolveGbpLocationResource,
} from "./gbpConfig";
import { getBrandVoiceHint } from "./socialConfig";
import { findTenantById } from "./tenant";
import { isAiGatewayEnabled, run as aiRun } from "./ai";
import {
  fetchGbpReviews,
  replyToGbpQuestion,
  replyToGbpReview,
} from "../integrations/gbpReviews";

export type CreateGbpInboxInput = {
  tenantId: string;
  kind: GbpKind;
  externalLocationId?: string | null;
  externalMessageId?: string | null;
  authorName?: string | null;
  body?: string | null;
  starRating?: number | null;
  raw?: Record<string, unknown>;
};

async function writeAudit(input: {
  tenantId: string;
  inboxId: string;
  action: GbpAuditAction;
  actor: string;
  beforeBody?: string | null;
  afterBody?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(gbpReplyAuditTable).values({
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

export async function ingestGbpMessage(
  input: CreateGbpInboxInput,
): Promise<GbpInboxRow | null> {
  const { classification, riskFlags } = classifySocialMessage(input.body);

  const inserted = await db
    .insert(gbpInboxTable)
    .values({
      id: randomUUID(),
      tenantId: input.tenantId,
      kind: input.kind,
      externalLocationId: input.externalLocationId ?? null,
      externalMessageId: input.externalMessageId ?? null,
      authorName: input.authorName ?? null,
      body: input.body ?? null,
      starRating: input.starRating ?? null,
      classification,
      status: "new",
      riskFlags,
      raw: { ...(input.raw ?? {}), source: input.raw?.source ?? "gbp_ingest" },
    })
    .onConflictDoNothing({
      target: [
        gbpInboxTable.tenantId,
        gbpInboxTable.kind,
        gbpInboxTable.externalMessageId,
      ],
    })
    .returning();

  return inserted[0] ?? null;
}

export async function listGbpInbox(params: {
  tenantId: string | null;
  status?: string | null;
  limit?: number;
}): Promise<GbpInboxRow[]> {
  const conditions = [];
  if (params.tenantId) conditions.push(eq(gbpInboxTable.tenantId, params.tenantId));
  if (params.status) conditions.push(eq(gbpInboxTable.status, params.status));
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const query = db.select().from(gbpInboxTable);
  return conditions.length
    ? await query
        .where(and(...conditions))
        .orderBy(desc(gbpInboxTable.createdAt))
        .limit(limit)
    : await query.orderBy(desc(gbpInboxTable.createdAt)).limit(limit);
}

export async function getGbpInboxRow(id: string): Promise<GbpInboxRow | null> {
  const rows = await db
    .select()
    .from(gbpInboxTable)
    .where(eq(gbpInboxTable.id, id))
    .limit(1);
  return rows[0] ?? null;
}

async function updateGbpInboxRow(
  id: string,
  set: Partial<typeof gbpInboxTable.$inferInsert>,
): Promise<GbpInboxRow | null> {
  const rows = await db
    .update(gbpInboxTable)
    .set({ ...set, updatedAt: new Date() })
    .where(eq(gbpInboxTable.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function listGbpAuditForInbox(inboxId: string) {
  return db
    .select()
    .from(gbpReplyAuditTable)
    .where(eq(gbpReplyAuditTable.inboxId, inboxId))
    .orderBy(desc(gbpReplyAuditTable.createdAt))
    .limit(100);
}

export type GbpDraftResult = {
  row: GbpInboxRow;
  escalate: boolean;
  note: string | null;
};

export async function draftGbpReplyForRow(
  id: string,
  tenantName: string,
  actor: string,
): Promise<GbpDraftResult | null> {
  const row = await getGbpInboxRow(id);
  if (!row) return null;

  const classification = row.classification as GbpClassification;

  if (classification === "allergy_health") {
    const updated = await updateGbpInboxRow(id, {
      draftReply: null,
      status: "blocked",
    });
    await writeAudit({
      tenantId: row.tenantId,
      inboxId: id,
      action: "block",
      actor,
      meta: { reason: "allergy_health", note: buildEscalationNote(classification) },
    });
    return {
      row: updated ?? row,
      escalate: true,
      note: buildEscalationNote(classification),
    };
  }

  if (classification === "spam") {
    const updated = await updateGbpInboxRow(id, {
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
    return {
      row: updated ?? row,
      escalate: false,
      note: buildEscalationNote(classification),
    };
  }

  // BAGIAN F hard rule: negative Google reviews (1-3★) always escalate —
  // never draft a public reply automatically. A human must decide.
  if (row.kind === "review" && typeof row.starRating === "number" && row.starRating <= 3) {
    const updated = await updateGbpInboxRow(id, { draftReply: null, status: "blocked" });
    await writeAudit({
      tenantId: row.tenantId,
      inboxId: id,
      action: "block",
      actor,
      meta: { reason: "negative_review", star_rating: row.starRating },
    });
    return {
      row: updated ?? row,
      escalate: true,
      note: `Negative review (${row.starRating}★) escalated for the owner — public replies to negative reviews are never auto-drafted.`,
    };
  }

  // AI draft via the shared gateway (task review_draft = BAGIAN F / Google tone).
  if (isAiGatewayEnabled()) {
    let menuItemNames = "";
    let city = "";
    let state = "";
    let address = "";
    let cuisineType = "restaurant";
    try {
      const menuRows = await db
        .select({ name: menuItemsTable.name })
        .from(menuItemsTable)
        .where(and(eq(menuItemsTable.tenantId, row.tenantId), eq(menuItemsTable.available, true)))
        .limit(80);
      menuItemNames = menuRows.map((r) => r.name).filter(Boolean).join(", ");
      const tenant = await findTenantById(row.tenantId);
      city = tenant?.city ?? "";
      state = tenant?.state ?? "";
      address = tenant?.address ?? "";
      const theme = (tenant?.theme ?? {}) as Record<string, unknown>;
      if (typeof theme.cuisine_type === "string") cuisineType = theme.cuisine_type;
    } catch {
      /* non-fatal — model may escalate if facts missing */
    }

    try {
      const ai = await aiRun({
        task: "review_draft",
        tenantId: row.tenantId,
        input: {
          message_text: row.body ?? "",
          author_name: row.authorName,
          author_first_name: row.authorName?.trim().split(/\s+/)[0] ?? "",
          tenant_name: tenantName,
          heuristic_classification: classification,
          brand_voice: getBrandVoiceHint(row.tenantId),
          platform: "google",
          message_type: row.kind === "question" ? "question" : "review",
          star_rating: row.starRating ?? null,
          engagement_mode: process.env.SOCIAL_ENGAGEMENT_MODE?.trim() || "conservative",
          tenant_languages: "en",
          order_url: process.env.SOCIAL_ORDER_URL?.trim() || "https://samurairesto.com",
          menu_item_names: menuItemNames,
          city,
          state,
          address,
          cuisine_type: cuisineType,
        },
        opts: { responseFormat: "json" },
      });

      const out = ai.ok
        ? (ai.output as { classification?: string; reason?: string; draft?: string })
        : null;

      if (out?.classification === "skip") {
        const updated = await updateGbpInboxRow(id, { draftReply: null, status: "skipped" });
        await writeAudit({
          tenantId: row.tenantId,
          inboxId: id,
          action: "skip",
          actor,
          meta: { reason: out.reason ?? "ai_skip", provider: ai.provider, model: ai.model },
        });
        return {
          row: updated ?? row,
          escalate: false,
          note: `Skipped by AI gateway (${out.reason ?? "no-reply-needed"}).`,
        };
      }

      if (out?.classification === "escalate" && !out.draft) {
        const updated = await updateGbpInboxRow(id, { draftReply: null, status: "blocked" });
        await writeAudit({
          tenantId: row.tenantId,
          inboxId: id,
          action: "block",
          actor,
          meta: { reason: out.reason ?? "ai_escalate", provider: ai.provider, model: ai.model },
        });
        return {
          row: updated ?? row,
          escalate: true,
          note: `Escalated by AI gateway (${out.reason ?? "needs_human"}).`,
        };
      }

      if (out?.classification === "reply" && out.draft?.trim()) {
        const updated = await updateGbpInboxRow(id, {
          draftReply: out.draft.trim(),
          status: "pending_approval",
        });
        await writeAudit({
          tenantId: row.tenantId,
          inboxId: id,
          action: "edit",
          actor,
          afterBody: out.draft.trim(),
          meta: {
            drafted: true,
            classification,
            generator: "ai",
            provider: ai.provider,
            model: ai.model,
          },
        });
        return {
          row: updated ?? row,
          escalate: classification === "complaint",
          note:
            classification === "complaint"
              ? "Complaint drafted for human review — never auto-sent to Google."
              : null,
        };
      }
      // Gateway returned nothing usable → fall through to template.
    } catch {
      /* non-fatal — fall through to deterministic template */
    }
  }

  const draft = buildDraftReply({
    classification,
    authorName: row.authorName,
    tenantName,
    brandVoiceHint: "warm, friendly, concise — sounds like a real staff member, not a bot",
  });

  const updated = await updateGbpInboxRow(id, {
    draftReply: draft,
    status: "pending_approval",
  });
  await writeAudit({
    tenantId: row.tenantId,
    inboxId: id,
    action: "edit",
    actor,
    afterBody: draft,
    meta: { drafted: true, classification, generator: "template" },
  });

  return {
    row: updated ?? row,
    escalate: classification === "complaint",
    note:
      classification === "complaint"
        ? "Complaint drafted for human review — never auto-sent to Google."
        : null,
  };
}

export async function approveGbpInboxRow(
  id: string,
  actor: string,
  editedBody?: string,
): Promise<{ ok: true; row: GbpInboxRow } | { ok: false; status: number; error: string }> {
  const row = await getGbpInboxRow(id);
  if (!row) return { ok: false, status: 404, error: "Inbox row not found" };

  if (row.classification === "allergy_health") {
    return {
      ok: false,
      status: 403,
      error: "allergy_health rows cannot be approved for send (hard rule)",
    };
  }

  if (row.status !== "pending_approval" && row.status !== "drafted") {
    return {
      ok: false,
      status: 409,
      error: `Cannot approve from status "${row.status}" (expected pending_approval or drafted)`,
    };
  }

  const finalBody = editedBody?.trim() ? editedBody.trim() : row.draftReply;
  if (!finalBody?.trim()) {
    return { ok: false, status: 400, error: "No draft body to approve" };
  }

  const updated = await updateGbpInboxRow(id, {
    draftReply: finalBody,
    status: "approved",
  });
  await writeAudit({
    tenantId: row.tenantId,
    inboxId: id,
    action:
      editedBody?.trim() && editedBody.trim() !== row.draftReply ? "edit" : "approve",
    actor,
    beforeBody: row.draftReply,
    afterBody: finalBody,
    meta: { edited: Boolean(editedBody?.trim() && editedBody.trim() !== row.draftReply) },
  });

  return { ok: true, row: updated ?? row };
}

export async function skipGbpInboxRow(
  id: string,
  actor: string,
  reason?: string,
): Promise<GbpInboxRow | null> {
  const row = await getGbpInboxRow(id);
  if (!row) return null;
  const updated = await updateGbpInboxRow(id, { status: "skipped" });
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

export type GbpSendResult =
  | { ok: true; row: GbpInboxRow; sent: "sent"; externalReplyId: string | null }
  | { ok: false; status: number; error: string };

export async function sendApprovedGbpReply(
  id: string,
  actor: string,
): Promise<GbpSendResult> {
  const row = await getGbpInboxRow(id);
  if (!row) return { ok: false, status: 404, error: "Inbox row not found" };

  if (isGbpKillSwitchOn(row.tenantId)) {
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
      error: `Classification "${row.classification}" may never be auto-sent (hard rule)`,
    };
  }

  if (row.status !== "approved") {
    return {
      ok: false,
      status: 409,
      error: `Row must be status "approved" (currently "${row.status}")`,
    };
  }

  if (!isGbpSendGloballyEnabled()) {
    return {
      ok: false,
      status: 501,
      error: "Sending is disabled — set GBP_SEND_ENABLED=1 to allow the send gate to open.",
    };
  }

  const token = await resolveGbpAccessToken(row.tenantId);
  if (!token) {
    return {
      ok: false,
      status: 501,
      error: `No Google access token available for tenant "${row.tenantId}". Set GBP_ACCESS_TOKEN or GBP_REFRESH_TOKEN + GOOGLE_OAUTH_CLIENT_ID/SECRET.`,
    };
  }

  const message = row.draftReply?.trim();
  if (!message) {
    return { ok: false, status: 400, error: "Row has no approved reply body to send." };
  }

  const resourceName = row.externalMessageId?.trim();
  if (!resourceName) {
    return {
      ok: false,
      status: 400,
      error: "Missing external_message_id (Google review/question resource name).",
    };
  }

  const result =
    row.kind === "question"
      ? await replyToGbpQuestion({
          accessToken: token,
          questionName: resourceName,
          comment: message,
        })
      : await replyToGbpReview({
          accessToken: token,
          reviewName: resourceName,
          comment: message,
        });

  if (!result.ok) {
    await writeAudit({
      tenantId: row.tenantId,
      inboxId: id,
      action: "send_failed",
      actor,
      beforeBody: row.draftReply,
      meta: { error: result.error, kind: row.kind },
    });
    return { ok: false, status: result.status, error: result.error };
  }

  const updated = await updateGbpInboxRow(id, { status: "sent" });
  await writeAudit({
    tenantId: row.tenantId,
    inboxId: id,
    action: "send",
    actor,
    afterBody: row.draftReply,
    meta: { external_reply_id: result.externalReplyId, kind: row.kind },
  });

  return {
    ok: true,
    row: updated ?? row,
    sent: "sent",
    externalReplyId: result.externalReplyId,
  };
}

/**
 * Auto-draft a freshly-ingested GBP row (webhook / sync / simulate). Still
 * human-approve before anything is sent to Google — this only fills draftReply
 * so the inbox is not full of "No draft yet". Guardrails inside
 * draftGbpReplyForRow still block allergy_health, skip spam, and escalate every
 * negative review (BAGIAN F). Safe to fire-and-forget.
 */
export async function autoDraftGbpForRow(row: GbpInboxRow): Promise<void> {
  if (!isGbpAutoDraftEnabled()) return;
  if (row.status !== "new") return; // already drafted/handled
  let tenantName = row.tenantId;
  try {
    const tenant = await findTenantById(row.tenantId);
    if (tenant?.name) tenantName = tenant.name;
  } catch {
    /* non-fatal — draft still works with a generic name */
  }
  await draftGbpReplyForRow(row.id, tenantName, "auto-draft");
}

export type GbpSyncResult = {
  ok: boolean;
  fetched: number;
  ingested: number;
  duplicates: number;
  drafted: number;
  error?: string;
};

/**
 * Pull the latest Google reviews for a tenant via the Business Profile API,
 * ingest new ones into the inbox, and auto-draft. Nothing is ever sent here.
 * Requires a valid Google access token + GBP_LOCATION_RESOURCE for the tenant.
 */
export async function syncGbpReviews(input: {
  tenantId: string;
  pageSize?: number;
}): Promise<GbpSyncResult> {
  const { tenantId } = input;
  const token = await resolveGbpAccessToken(tenantId);
  if (!token) {
    return {
      ok: false,
      fetched: 0,
      ingested: 0,
      duplicates: 0,
      drafted: 0,
      error:
        "No Google access token available. Set GBP_ACCESS_TOKEN or GBP_REFRESH_TOKEN + GOOGLE_OAUTH_CLIENT_ID/SECRET.",
    };
  }
  const locationResource = await resolveGbpLocationResource(tenantId);
  if (!locationResource) {
    return {
      ok: false,
      fetched: 0,
      ingested: 0,
      duplicates: 0,
      drafted: 0,
      error: `No GBP location configured for "${tenantId}". Connect Google (OAuth) or set GBP_LOCATION_RESOURCE (accounts/{acc}/locations/{loc}).`,
    };
  }

  const fetched = await fetchGbpReviews({
    accessToken: token,
    locationResource,
    pageSize: input.pageSize ?? 50,
  });
  if (!fetched.ok) {
    return {
      ok: false,
      fetched: 0,
      ingested: 0,
      duplicates: 0,
      drafted: 0,
      error: fetched.error,
    };
  }

  let ingested = 0;
  let duplicates = 0;
  let drafted = 0;
  for (const r of fetched.reviews) {
    const row = await ingestGbpMessage({
      tenantId,
      kind: "review",
      externalLocationId: locationResource,
      externalMessageId: r.reviewName,
      authorName: r.authorName,
      body: r.comment,
      starRating: r.starRating,
      raw: { source: "gbp_sync", updateTime: r.updateTime ?? null },
    });
    if (row) {
      ingested += 1;
      try {
        await autoDraftGbpForRow(row);
        drafted += 1;
      } catch {
        /* non-fatal — row is in inbox, can be drafted manually */
      }
    } else {
      duplicates += 1;
    }
  }

  return { ok: true, fetched: fetched.reviews.length, ingested, duplicates, drafted };
}

export function toPublicGbpRow(row: GbpInboxRow) {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    kind: row.kind,
    author_name: row.authorName,
    body: row.body,
    star_rating: row.starRating,
    classification: row.classification,
    draft_reply: row.draftReply,
    status: row.status,
    risk_flags: row.riskFlags,
    external_message_id: row.externalMessageId,
    external_location_id: row.externalLocationId,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}
