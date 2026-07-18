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
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  menuItemsTable,
  socialInboxTable,
  socialReplyAuditTable,
  type SocialInboxRow,
  type SocialClassification,
  type SocialInboxStatus,
  type SocialAuditAction,
} from "@workspace/db";
import { isAiGatewayEnabled, run as aiRun } from "./ai";
import { looksLikePeerConversation } from "./ai/peerChat";
import {
  classifySocialMessage,
  isCommentTooOldForDraft,
  parseExternalCreatedAt,
} from "./socialClassify";
import { buildDraftReply, buildEscalationNote } from "./socialDraft";
import { buildTrackedUrl } from "./socialPostDraft";
import {
  getBrandVoiceHint,
  getMetaPageAccessToken,
  getSocialDraftMaxAgeDays,
  getSocialKnowledgeBase,
  isSocialAutoDraftEnabled,
  isSocialKillSwitchOn,
  isSocialSendGloballyEnabled,
} from "./socialConfig";
import {
  fetchRecentPageComments,
  replyToMetaComment,
  sendMetaMessengerMessage,
} from "../integrations/metaGraph";
import { isMetaGloballyDisabled } from "./metaGuard";
import { findTenantById } from "./tenant";

const AI_LABELS = [
  "praise",
  "question",
  "complaint",
  "allergy_health",
  "spam",
  "menu_suggestion",
  "ordering_interest",
  "off_topic",
  "other",
] as const;

function mapAiLabelToDb(
  label: string | undefined,
  fallback: SocialClassification,
): SocialClassification {
  if (!label) return fallback;
  if (label === "off_topic") return "spam";
  if (label === "other") return fallback === "unknown" ? "unknown" : fallback;
  if ((AI_LABELS as readonly string[]).includes(label) && label !== "off_topic" && label !== "other") {
    return label as SocialClassification;
  }
  return fallback;
}

function formatTenantHours(hours: unknown): string {
  if (!hours) return "";
  if (typeof hours === "string") return hours;
  if (Array.isArray(hours)) {
    return hours
      .map((h) => {
        const row = h as Record<string, unknown>;
        const day = String(row.day ?? row.name ?? "").trim();
        const val = String(row.hours ?? row.open ?? "").trim();
        return day && val ? `${day}: ${val}` : val || day;
      })
      .filter(Boolean)
      .join("; ");
  }
  if (typeof hours === "object") {
    return Object.entries(hours as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join("; ");
  }
  return "";
}

/** Statuses the dashboard can act on (Approve / Send / Draft). */
export const SOCIAL_ACTIONABLE_STATUSES: SocialInboxStatus[] = [
  "new",
  "drafted",
  "pending_approval",
  "approved",
];

/**
 * Outbound draft cleanup: NFC + drop replacement chars / controls.
 * Intentionally keeps emoji — do not ASCII-strip reply text.
 */
export function sanitizeDraftText(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let t = String(raw).normalize("NFC");
  t = t.replace(/\uFFFD/g, "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  t = t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return t || null;
}

export function sanitizeInboundText(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.normalize("NFC");
  s = s.replace(/\uFFFD/g, "");
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  s = s.trim();
  return s.length ? s : null;
}

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
  /** Original platform timestamp (Meta created_time). */
  externalCreatedAt?: Date | string | null;
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
  const body = sanitizeInboundText(input.body);
  const authorName = sanitizeInboundText(input.authorName);
  const { classification, riskFlags } = classifySocialMessage(body);
  const externalCreatedAt =
    parseExternalCreatedAt(input.externalCreatedAt) ??
    parseExternalCreatedAt(input.raw?.createdTime) ??
    null;

  const inserted = await db
    .insert(socialInboxTable)
    .values({
      id: randomUUID(),
      tenantId: input.tenantId,
      platform: input.platform,
      externalThreadId: input.externalThreadId ?? null,
      externalMessageId: input.externalMessageId ?? null,
      direction: "in",
      authorName,
      body,
      classification,
      status: "new",
      riskFlags,
      raw: { ...(input.raw ?? {}), kind: input.kind ?? "comment" },
      externalCreatedAt,
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
  /** When true (and no single status), only return rows waiting for human action. */
  actionableOnly?: boolean;
  limit?: number;
}): Promise<SocialInboxRow[]> {
  const conditions = [];
  if (params.tenantId) conditions.push(eq(socialInboxTable.tenantId, params.tenantId));
  if (params.status) {
    conditions.push(eq(socialInboxTable.status, params.status));
  } else if (params.actionableOnly) {
    conditions.push(inArray(socialInboxTable.status, SOCIAL_ACTIONABLE_STATUSES));
  }

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
 * allergy_health -> blocked; spam/off-topic/peer/stale -> skipped.
 * Prefer AI Gateway. On AI failure: SKIP (silence) — never generic thank-you.
 */
export async function draftReplyForRow(
  id: string,
  tenantName: string,
  actor: string,
): Promise<DraftResult | null> {
  const row = await getInboxRow(id);
  if (!row) return null;

  let classification = row.classification as SocialClassification;

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
      meta: { reason: "spam_or_off_topic", note: buildEscalationNote(classification) },
    });
    return { row: updated ?? row, escalate: false, note: "Skipped — spam/off-topic." };
  }

  const peer = looksLikePeerConversation(row.body ?? "");
  if (peer.peer) {
    const updated = await updateInboxRow(id, {
      draftReply: null,
      status: "skipped",
      classification: classification === "unknown" ? "unknown" : classification,
    });
    await writeAudit({
      tenantId: row.tenantId,
      inboxId: id,
      action: "skip",
      actor,
      meta: { reason: `peer:${peer.reason}` },
    });
    return {
      row: updated ?? row,
      escalate: false,
      note: `Skipped — peer/not-to-restaurant (${peer.reason}).`,
    };
  }

  const maxAge = getSocialDraftMaxAgeDays();
  const externalAt =
    row.externalCreatedAt ??
    parseExternalCreatedAt((row.raw as Record<string, unknown> | null)?.createdTime);
  if (isCommentTooOldForDraft(externalAt, maxAge)) {
    const updated = await updateInboxRow(id, {
      draftReply: null,
      status: "skipped",
    });
    await writeAudit({
      tenantId: row.tenantId,
      inboxId: id,
      action: "skip",
      actor,
      meta: { reason: "stale_comment", max_age_days: maxAge },
    });
    return {
      row: updated ?? row,
      escalate: false,
      note: `Skipped — comment older than ${maxAge} days (no draft for stale backfill).`,
    };
  }

  if (!isAiGatewayEnabled()) {
    const updated = await updateInboxRow(id, {
      draftReply: null,
      status: "skipped",
    });
    await writeAudit({
      tenantId: row.tenantId,
      inboxId: id,
      action: "skip",
      actor,
      meta: { reason: "ai_gateway_disabled_no_generic_fallback" },
    });
    return {
      row: updated ?? row,
      escalate: false,
      note: "Skipped — AI gateway off; refusing generic thank-you fallback.",
    };
  }

  let menuItemNames = "";
  let city = "";
  let state = "";
  let address = "";
  let hours = "";
  let cuisineType = "Japanese hibachi & sushi";
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
    hours = formatTenantHours(tenant?.hours);
    const theme = (tenant?.theme ?? {}) as Record<string, unknown>;
    if (typeof theme.cuisine_type === "string") cuisineType = theme.cuisine_type;
  } catch {
    /* non-fatal */
  }

  const knowledge = getSocialKnowledgeBase(row.tenantId);
  if (!hours && knowledge) {
    const hoursLine = knowledge
      .split("\n")
      .find((l) => /^hours:/i.test(l.trim()));
    if (hoursLine) hours = hoursLine.replace(/^hours:\s*/i, "").trim();
  }

  let tenantSlug = row.tenantId;
  let domain =
    process.env.SOCIAL_ORDER_URL?.trim().replace(/^https?:\/\//, "").replace(/\/$/, "") ||
    "samurairesto.com";
  try {
    const tenant = await findTenantById(row.tenantId);
    if (tenant?.slug) tenantSlug = tenant.slug;
    if (tenant?.domain) {
      domain = tenant.domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    }
  } catch {
    /* non-fatal */
  }
  // Inbox closed-loop: social-reply-YYYYMMDD (not the promoted menu item).
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const trackedOrderUrl = buildTrackedUrl({
    domain,
    tenantSlug,
    srcTag: `social-reply-${ymd}`,
  });

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
      order_url: trackedOrderUrl,
      menu_item_names: menuItemNames,
      city,
      state,
      address,
      hours,
      cuisine_type: cuisineType,
      knowledge_base: knowledge,
    },
    opts: { responseFormat: "json" },
  });

  const out = ai.ok
    ? (ai.output as {
        classification?: string;
        label?: string;
        reason?: string;
        draft?: string;
        confidence?: number;
      })
    : null;

  if (out?.classification === "skip" || out?.label === "off_topic") {
    const label = mapAiLabelToDb(out.label, classification);
    const updated = await updateInboxRow(id, {
      draftReply: null,
      status: "skipped",
      classification: label === "spam" || out.label === "off_topic" ? "spam" : classification,
    });
    await writeAudit({
      tenantId: row.tenantId,
      inboxId: id,
      action: "skip",
      actor,
      meta: {
        reason: out.reason ?? "ai_skip",
        label: out.label,
        provider: ai.provider,
        model: ai.model,
      },
    });
    return {
      row: updated ?? row,
      escalate: false,
      note: `Skipped by AI (${out.reason ?? "not relevant / no reply needed"}).`,
    };
  }

  if (out?.classification === "escalate" && !out.draft) {
    const updated = await updateInboxRow(id, {
      draftReply: null,
      status: "blocked",
      classification: mapAiLabelToDb(out.label, classification),
    });
    await writeAudit({
      tenantId: row.tenantId,
      inboxId: id,
      action: "block",
      actor,
      meta: {
        reason: out.reason ?? "ai_escalate",
        label: out.label,
        provider: ai.provider,
        model: ai.model,
      },
    });
    return {
      row: updated ?? row,
      escalate: true,
      note: `Escalated by AI (${out.reason ?? "needs_human"}).`,
    };
  }

  if (out?.classification === "reply" && out.draft?.trim()) {
    classification = mapAiLabelToDb(out.label, classification);
    // menu_suggestion may still get a warm acknowledgment draft, but keep label.
    if (out.label === "menu_suggestion") classification = "menu_suggestion";
    if (out.label === "ordering_interest") classification = "ordering_interest";
    if (out.label === "praise") classification = "praise";
    if (out.label === "question") classification = "question";

    let draft = sanitizeDraftText(out.draft) ?? out.draft.trim();
    // ordering_interest must carry a tracked short link (closed-loop).
    if (
      classification === "ordering_interest" &&
      !/[?&]src=/i.test(draft)
    ) {
      draft = `${draft.trim()} ${trackedOrderUrl}`.trim();
    }

    const updated = await updateInboxRow(id, {
      draftReply: draft,
      status: "pending_approval",
      classification,
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

  // Heuristic ordering_interest with AI failure — still draft a tracked link.
  if (classification === "ordering_interest") {
    const draft = sanitizeDraftText(
      buildDraftReply({
        classification: "ordering_interest",
        authorName: row.authorName,
        tenantName,
        brandVoiceHint: getBrandVoiceHint(row.tenantId),
        orderUrl: trackedOrderUrl,
      }),
    );
    if (draft) {
      const updated = await updateInboxRow(id, {
        draftReply: draft,
        status: "pending_approval",
        classification: "ordering_interest",
      });
      return { row: updated ?? row, escalate: false, note: null };
    }
  }

  // AI failed or unclear — silence. Never emit generic "thanks for reaching out".
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
      reason: "ai_unavailable_no_generic_fallback",
      provider: ai.provider,
      model: ai.model,
      error: ai.error,
    },
  });
  return {
    row: updated ?? row,
    escalate: false,
    note: "Skipped — AI could not draft safely; refusing generic thank-you fallback.",
  };
}

/**
 * Auto-draft a freshly-ingested inbound row (webhook or backfill). Still
 * human-approve before anything is sent — this only fills draftReply so the
 * inbox is not full of "No draft yet". Guardrails inside draftReplyForRow
 * still skip peer/spam and block allergy_health. Safe to fire-and-forget.
 */
export async function autoDraftForRow(row: SocialInboxRow): Promise<void> {
  if (!isSocialAutoDraftEnabled()) return;
  if (row.direction !== "in") return;
  if (row.status !== "new") return; // already drafted/handled
  let tenantName = "the restaurant";
  try {
    const tenant = await findTenantById(row.tenantId);
    if (tenant?.name) tenantName = tenant.name;
  } catch {
    /* non-fatal — draft still works with a generic name */
  }
  await draftReplyForRow(row.id, tenantName, "auto-draft");
}

export type BackfillResult = {
  ok: boolean;
  fetched: number;
  ingested: number;
  duplicates: number;
  drafted: number;
  error?: string;
};

/**
 * Pull recent Page comments via the Graph API and file any that the webhook
 * missed (e.g. comments posted before the webhook subscription, or on older
 * posts). Idempotent — existing rows are skipped by the unique (tenant,
 * platform, external_message_id) constraint. New rows are auto-drafted.
 *
 * Read-only against Meta (GET only) — never sends a reply.
 */
export async function backfillMetaComments(input: {
  tenantId: string;
  postLimit?: number;
  commentLimit?: number;
}): Promise<BackfillResult> {
  const token = getMetaPageAccessToken(input.tenantId);
  if (!token) {
    return {
      ok: false,
      fetched: 0,
      ingested: 0,
      duplicates: 0,
      drafted: 0,
      error: "META_PAGE_ACCESS_TOKEN not configured for this tenant",
    };
  }

  const fetched = await fetchRecentPageComments(token, {
    postLimit: input.postLimit,
    commentLimit: input.commentLimit,
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
  for (const c of fetched.comments) {
    const row = await ingestInboundMessage({
      tenantId: input.tenantId,
      platform: "facebook",
      kind: "comment",
      externalThreadId: c.postId,
      externalMessageId: c.commentId,
      authorName: c.authorName,
      body: c.message,
      externalCreatedAt: c.createdTime,
      raw: {
        pageId: fetched.pageId,
        authorId: c.authorId,
        createdTime: c.createdTime,
        source: "meta_backfill",
      },
    });
    if (row) {
      ingested += 1;
      try {
        await autoDraftForRow(row);
        drafted += 1;
      } catch {
        /* non-fatal — leave as new for manual draft */
      }
    } else {
      duplicates += 1;
    }
  }

  return {
    ok: true,
    fetched: fetched.comments.length,
    ingested,
    duplicates,
    drafted,
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

  // Global panic button — halts ALL outbound Meta traffic at once while the
  // Business Manager is under Meta restriction/review. Audited so the block is
  // visible in the trail, not silent.
  if (isMetaGloballyDisabled()) {
    await writeAudit({
      tenantId: row.tenantId,
      inboxId: id,
      action: "kill_switch",
      actor,
      meta: { blocked_send: true, reason: "META_GLOBAL_KILL_SWITCH" },
    });
    return {
      ok: false,
      status: 503,
      error: "Meta traffic is globally disabled (META_GLOBAL_KILL_SWITCH).",
    };
  }

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
    external_created_at:
      row.externalCreatedAt?.toISOString?.() ?? row.externalCreatedAt ?? null,
    created_at: row.createdAt?.toISOString?.() ?? row.createdAt,
    updated_at: row.updatedAt?.toISOString?.() ?? row.updatedAt,
  };
}
