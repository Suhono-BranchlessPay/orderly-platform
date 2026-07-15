/**
 * Anchor health checks + optional outbound alerts.
 * Set ORDERLY_ALERT_WEBHOOK_URL (Slack/Discord/compatible POST JSON) to notify.
 * Without it, we only log — never invent success when alerting is disabled.
 */
import { and, eq, gte, or } from "drizzle-orm";
import { db, ordersTable } from "@workspace/db";
import { logger } from "./logger";

const RATE_FLOOR = Number(process.env.ORDERLY_ANCHOR_RATE_ALERT_PCT || "90");
const PENDING_HOURS = Number(process.env.ORDERLY_ANCHOR_STALE_HOURS || "1");

let lastWebhookFailAlertAt = 0;
let lastRateAlertAt = 0;
let lastStaleAlertAt = 0;
let webhookFailStreak = 0;

export function noteAnchorWebhookFailure(): void {
  webhookFailStreak += 1;
  if (webhookFailStreak < 3) return;
  const now = Date.now();
  if (now - lastWebhookFailAlertAt < 30 * 60_000) return;
  lastWebhookFailAlertAt = now;
  void fireAlert({
    type: "anchor_webhook_failures",
    message: `Anchor callback failed ${webhookFailStreak}+ times recently`,
    webhookFailStreak,
  });
}

export function noteAnchorWebhookSuccess(): void {
  webhookFailStreak = 0;
}

export function noteBpAuthFailure(detail: string): void {
  void fireAlert({
    type: "bp_license_auth",
    message: `BranchlessPay auth error: ${detail}`,
  });
}

async function fireAlert(payload: Record<string, unknown>): Promise<void> {
  const url = process.env.ORDERLY_ALERT_WEBHOOK_URL?.trim();
  logger.warn({ alert: payload }, "Orderly anchor alert");
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `[Orderly] ${payload.message || payload.type}`,
        ...payload,
      }),
    });
  } catch (err) {
    logger.error({ err }, "ORDERLY_ALERT_WEBHOOK_URL post failed");
  }
}

export async function buildAnchorHealth(input: {
  tenantId: string | null;
}): Promise<{
  paid_24h: number;
  anchored_24h: number;
  rate_24h: number;
  pending_over_1h: number;
  pending_samples: Array<{ id: string; status: string | null; paid_at: string | null }>;
  alert_rate_below_floor: boolean;
  rate_floor_pct: number;
}> {
  const since = new Date(Date.now() - 24 * 60 * 60_000);
  const staleBefore = new Date(Date.now() - PENDING_HOURS * 60 * 60_000);

  const paidParts = [
    eq(ordersTable.paymentStatus, "paid"),
    gte(ordersTable.createdAt, since),
  ];
  if (input.tenantId) paidParts.push(eq(ordersTable.tenantId, input.tenantId));

  const paid24 = await db
    .select({
      id: ordersTable.id,
      chainTxHash: ordersTable.chainTxHash,
      bpAnchorStatus: ordersTable.bpAnchorStatus,
      paidAt: ordersTable.paidAt,
      createdAt: ordersTable.createdAt,
    })
    .from(ordersTable)
    .where(and(...paidParts));

  const anchored24h = paid24.filter((o) => Boolean(o.chainTxHash)).length;
  const paid_24h = paid24.length;
  const rate_24h =
    paid_24h > 0 ? Math.round((anchored24h / paid_24h) * 1000) / 10 : 100;

  const staleCandidates = await db
    .select({
      id: ordersTable.id,
      bpAnchorStatus: ordersTable.bpAnchorStatus,
      paidAt: ordersTable.paidAt,
      createdAt: ordersTable.createdAt,
      chainTxHash: ordersTable.chainTxHash,
    })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.paymentStatus, "paid"),
        ...(input.tenantId ? [eq(ordersTable.tenantId, input.tenantId)] : []),
        or(
          eq(ordersTable.bpAnchorStatus, "pending"),
          eq(ordersTable.bpAnchorStatus, "queued"),
        ),
      ),
    )
    .limit(200);

  const stale = staleCandidates.filter((o) => {
    if (o.chainTxHash) return false;
    const ts = o.paidAt ?? o.createdAt;
    return ts != null && ts < staleBefore;
  });

  const alert_rate_below_floor = paid_24h >= 3 && rate_24h < RATE_FLOOR;
  if (alert_rate_below_floor) {
    const now = Date.now();
    if (now - lastRateAlertAt > 60 * 60_000) {
      lastRateAlertAt = now;
      void fireAlert({
        type: "anchor_rate_low",
        message: `Anchor rate ${rate_24h}% over last 24h (floor ${RATE_FLOOR}%, n=${paid_24h})`,
        rate_24h,
        paid_24h,
        tenant_id: input.tenantId,
      });
    }
  }

  if (stale.length > 0) {
    const now = Date.now();
    if (now - lastStaleAlertAt > 60 * 60_000) {
      lastStaleAlertAt = now;
      void fireAlert({
        type: "anchor_pending_stale",
        message: `${stale.length} paid order(s) pending proof > ${PENDING_HOURS}h`,
        pending_over_1h: stale.length,
        tenant_id: input.tenantId,
      });
    }
  }

  return {
    paid_24h,
    anchored_24h: anchored24h,
    rate_24h,
    pending_over_1h: stale.length,
    pending_samples: stale.slice(0, 5).map((o) => ({
      id: o.id,
      status: o.bpAnchorStatus,
      paid_at: (o.paidAt ?? o.createdAt)?.toISOString() ?? null,
    })),
    alert_rate_below_floor,
    rate_floor_pct: RATE_FLOOR,
  };
}
