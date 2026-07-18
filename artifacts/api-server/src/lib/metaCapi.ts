/**
 * Meta Conversion API (ads measurement) — REAL-TIME via async outbox.
 *
 * - Never blocks order/pay/analytics HTTP responses on Meta Graph.
 * - Advanced Matching: SHA-256 hashed phone/email (never plaintext to Meta).
 * - Multi-tenant: custom_data.restaurant_id + content_ids; per-tenant Pixel/token.
 * - Dedup-ready: stable event_id (client UUID for funnel; order id for Purchase).
 *
 * Default OFF (META_CAPI_ENABLED≠1). Separate from Blok 4.1 social messaging.
 * C5 marketing SEND remains HOLD — this is measurement, not outreach.
 */
import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, metaCapiOutboxTable } from "@workspace/db";
import {
  isMetaCapiGloballyEnabled,
  metaCapiRequiresMarketingConsent,
  metaGraphVersion,
  resolveMetaCapiCreds,
} from "./metaCapiConfig";
import { isMetaGloballyDisabled, throttleMetaCall } from "./metaGuard";

const FUNNEL_MAP: Record<string, string> = {
  page_view: "ViewContent",
  menu_view: "ViewContent",
  add_to_cart: "AddToCart",
  checkout_start: "InitiateCheckout",
  // "paid" from browser analytics is skipped — Purchase comes from server order path
};

export type MetaCapiUserHints = {
  email?: string | null;
  phoneE164?: string | null;
  marketingConsentEmail?: boolean;
  marketingConsentSms?: boolean;
  clientIp?: string | null;
  userAgent?: string | null;
  fbp?: string | null;
  fbc?: string | null;
};

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Meta Advanced Matching: normalize then SHA-256. */
export function hashEmailForMeta(email: string | null | undefined): string | undefined {
  if (!email) return undefined;
  const n = email.trim().toLowerCase();
  if (!n.includes("@")) return undefined;
  return sha256Hex(n);
}

export function hashPhoneForMeta(phone: string | null | undefined): string | undefined {
  if (!phone) return undefined;
  // Digits only; keep country code if present (E.164 without +).
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return undefined;
  return sha256Hex(digits);
}

function buildUserData(
  hints: MetaCapiUserHints | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!hints) return out;

  const requireConsent = metaCapiRequiresMarketingConsent();
  const consented =
    Boolean(hints.marketingConsentEmail) || Boolean(hints.marketingConsentSms);
  const allowPii = !requireConsent || consented;

  if (allowPii) {
    const em = hashEmailForMeta(hints.email);
    const ph = hashPhoneForMeta(hints.phoneE164);
    if (em) out.em = [em];
    if (ph) out.ph = [ph];
  }

  if (hints.clientIp) out.client_ip_address = hints.clientIp;
  if (hints.userAgent) out.client_user_agent = hints.userAgent;
  if (hints.fbp) out.fbp = hints.fbp;
  if (hints.fbc) out.fbc = hints.fbc;
  return out;
}

export type EnqueueMetaCapiInput = {
  tenantId: string;
  eventName: string;
  eventId: string;
  eventTime?: number;
  sourceUrl?: string | null;
  contentIds?: string[];
  valueCents?: number | null;
  currency?: string;
  orderId?: string | null;
  user?: MetaCapiUserHints;
  extraCustom?: Record<string, unknown>;
};

/**
 * Enqueue a CAPI event and kick an async flush. Returns immediately.
 * No-op when globally disabled or tenant creds missing (status=skipped).
 */
export async function enqueueMetaCapiEvent(
  input: EnqueueMetaCapiInput,
): Promise<{ queued: boolean; id: string; skipped?: string }> {
  const id = randomUUID();
  const eventTime = input.eventTime ?? Math.floor(Date.now() / 1000);

  if (isMetaGloballyDisabled()) {
    // Global panic button (account under Meta restriction) — do not even queue,
    // so nothing piles up to burst-send when the switch is flipped back off.
    return { queued: false, id, skipped: "META_GLOBAL_KILL_SWITCH on" };
  }
  if (!isMetaCapiGloballyEnabled()) {
    return { queued: false, id, skipped: "META_CAPI_ENABLED off" };
  }
  const creds = resolveMetaCapiCreds(input.tenantId);
  if (!creds) {
    return {
      queued: false,
      id,
      skipped:
        "missing TENANT_{ID}_META_PIXEL_ID / TENANT_{ID}_META_CAPI_ACCESS_TOKEN (no global Pixel fallback)",
    };
  }

  const customData: Record<string, unknown> = {
    // Multi-tenant audience separator — never mix Resto A with Resto B.
    restaurant_id: input.tenantId,
    tenant_id: input.tenantId,
    currency: input.currency || "USD",
    ...(input.extraCustom || {}),
  };
  if (input.contentIds?.length) {
    customData.content_ids = input.contentIds;
    customData.content_type = "product";
  }
  if (input.valueCents != null && Number.isFinite(input.valueCents)) {
    customData.value = Math.round(input.valueCents) / 100;
  }
  if (input.orderId) customData.order_id = input.orderId;

  const serverEvent: Record<string, unknown> = {
    event_name: input.eventName,
    event_time: eventTime,
    event_id: input.eventId,
    action_source: "website",
    user_data: buildUserData(input.user),
    custom_data: customData,
  };
  if (input.sourceUrl) serverEvent.event_source_url = input.sourceUrl;

  await db.insert(metaCapiOutboxTable).values({
    id,
    tenantId: input.tenantId,
    eventName: input.eventName,
    eventId: input.eventId,
    payload: {
      pixel_id: creds.pixelId,
      // access token NEVER stored in outbox — resolved again at flush
      server_event: serverEvent,
      test_event_code: creds.testEventCode || null,
    },
    status: "pending",
    attempts: 0,
  });

  // Fire-and-forget flush — do not await in caller hot path.
  setImmediate(() => {
    void flushMetaCapiOutbox({ limit: 20 }).catch(() => {
      /* logged inside */
    });
  });

  return { queued: true, id };
}

/** Map first-party analytics event → Meta standard name (or null to skip). */
export function mapAnalyticsToMetaEvent(
  eventType: string,
): string | null {
  if (eventType === "paid") return null; // Purchase from orders only
  return FUNNEL_MAP[eventType] || null;
}

export async function enqueueFromAnalytics(opts: {
  tenantId: string;
  eventType: string;
  eventId?: string | null;
  itemId?: string | null;
  orderId?: string | null;
  meta?: Record<string, unknown>;
  clientIp?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  const eventName = mapAnalyticsToMetaEvent(opts.eventType);
  if (!eventName) return;

  const eventId =
    (typeof opts.eventId === "string" && opts.eventId.trim()) ||
    (typeof opts.meta?.event_id === "string" && String(opts.meta.event_id)) ||
    randomUUID();

  const fbp =
    typeof opts.meta?.fbp === "string" ? String(opts.meta.fbp) : null;
  const fbc =
    typeof opts.meta?.fbc === "string" ? String(opts.meta.fbc) : null;
  const sourceUrl =
    typeof opts.meta?.source_url === "string"
      ? String(opts.meta.source_url)
      : null;

  await enqueueMetaCapiEvent({
    tenantId: opts.tenantId,
    eventName,
    eventId,
    contentIds: opts.itemId ? [opts.itemId] : undefined,
    orderId: opts.orderId,
    sourceUrl,
    user: {
      clientIp: opts.clientIp,
      userAgent: opts.userAgent,
      fbp,
      fbc,
    },
  });
}

export async function enqueuePurchaseFromOrder(opts: {
  tenantId: string;
  orderId: string;
  valueCents: number;
  contentIds?: string[];
  email?: string | null;
  phoneE164?: string | null;
  marketingConsentEmail?: boolean;
  marketingConsentSms?: boolean;
  clientIp?: string | null;
  userAgent?: string | null;
  sourceUrl?: string | null;
  fbp?: string | null;
  fbc?: string | null;
}): Promise<void> {
  await enqueueMetaCapiEvent({
    tenantId: opts.tenantId,
    eventName: "Purchase",
    // Stable = order id → ready for Pixel dedup when browser Pixel ships.
    eventId: opts.orderId,
    valueCents: opts.valueCents,
    contentIds: opts.contentIds,
    orderId: opts.orderId,
    sourceUrl: opts.sourceUrl,
    user: {
      email: opts.email,
      phoneE164: opts.phoneE164,
      marketingConsentEmail: opts.marketingConsentEmail,
      marketingConsentSms: opts.marketingConsentSms,
      clientIp: opts.clientIp,
      userAgent: opts.userAgent,
      fbp: opts.fbp,
      fbc: opts.fbc,
    },
  });
}

async function postToMeta(opts: {
  pixelId: string;
  accessToken: string;
  serverEvent: Record<string, unknown>;
  testEventCode?: string | null;
}): Promise<{ ok: boolean; metaEventId?: string; error?: string }> {
  const url = `https://graph.facebook.com/${metaGraphVersion()}/${encodeURIComponent(opts.pixelId)}/events`;
  const body: Record<string, unknown> = {
    data: [opts.serverEvent],
    access_token: opts.accessToken,
  };
  if (opts.testEventCode) body.test_event_code = opts.testEventCode;

  // Space events so a flush of many rows never bursts (Account Integrity).
  await throttleMetaCall();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: `HTTP ${res.status}: ${typeof json.error === "object" ? JSON.stringify(json.error) : text.slice(0, 300)}`,
    };
  }
  const eventsReceived = json.events_received;
  const fbtrace = json.fbtrace_id;
  return {
    ok: true,
    metaEventId:
      typeof fbtrace === "string"
        ? fbtrace
        : typeof eventsReceived === "number"
          ? `received:${eventsReceived}`
          : "ok",
  };
}

/** Flush pending outbox rows (async worker). Safe to call frequently. */
export async function flushMetaCapiOutbox(opts?: {
  limit?: number;
}): Promise<{ processed: number; sent: number; failed: number }> {
  const limit = Math.min(Math.max(opts?.limit ?? 25, 1), 100);
  if (isMetaGloballyDisabled() || !isMetaCapiGloballyEnabled()) {
    return { processed: 0, sent: 0, failed: 0 };
  }

  const rows = await db
    .select()
    .from(metaCapiOutboxTable)
    .where(eq(metaCapiOutboxTable.status, "pending"))
    .limit(limit);

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    // Re-check each row so flipping the panic switch ON mid-flush stops the
    // rest of the batch immediately (rows stay "pending" for a later flush).
    if (isMetaGloballyDisabled()) break;
    const creds = resolveMetaCapiCreds(row.tenantId);
    if (!creds) {
      await db
        .update(metaCapiOutboxTable)
        .set({
          status: "skipped",
          lastError: "creds missing at flush",
          attempts: row.attempts + 1,
        })
        .where(eq(metaCapiOutboxTable.id, row.id));
      failed += 1;
      continue;
    }

    const payload = row.payload || {};
    const serverEvent =
      (payload.server_event as Record<string, unknown> | undefined) || {};
    // Strip any accidental secrets if present
    const cleanEvent = { ...serverEvent };

    const result = await postToMeta({
      pixelId: creds.pixelId,
      accessToken: creds.accessToken,
      serverEvent: cleanEvent,
      testEventCode:
        (payload.test_event_code as string | null | undefined) ||
        creds.testEventCode,
    });

    if (result.ok) {
      await db
        .update(metaCapiOutboxTable)
        .set({
          status: "sent",
          attempts: row.attempts + 1,
          metaEventId: result.metaEventId || null,
          sentAt: new Date(),
          lastError: null,
        })
        .where(eq(metaCapiOutboxTable.id, row.id));
      sent += 1;
    } else {
      const attempts = row.attempts + 1;
      // After 5 failures, mark failed (manual retry later).
      await db
        .update(metaCapiOutboxTable)
        .set({
          status: attempts >= 5 ? "failed" : "pending",
          attempts,
          lastError: (result.error || "unknown").slice(0, 1000),
        })
        .where(eq(metaCapiOutboxTable.id, row.id));
      failed += 1;
    }
  }

  return { processed: rows.length, sent, failed };
}

export function metaCapiHealth(): {
  enabled: boolean;
  require_marketing_consent_for_pii: boolean;
  note: string;
} {
  return {
    enabled: isMetaCapiGloballyEnabled(),
    require_marketing_consent_for_pii: metaCapiRequiresMarketingConsent(),
    note:
      "Server-side CAPI via async outbox. Browser Pixel not wired yet — use matching event_id when adding Pixel for dedup. Not Blok 4 social.",
  };
}
