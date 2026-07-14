import { Router } from "express";
import { db } from "@workspace/db";
import { ordersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  mapDoordashEventToOrderStatus,
} from "../integrations/doordash";
import {
  isSquareConfigured,
  syncSquareOrderFromOwnerStatus,
} from "../integrations/square";
import {
  applyAnchorProof,
  parseAnchorCallbackBody,
} from "../lib/anchorProof";
import {
  noteAnchorWebhookFailure,
  noteAnchorWebhookSuccess,
} from "../lib/anchorAlerts";

const router = Router();

const WEBHOOK_USER = process.env.DOORDASH_WEBHOOK_BASIC_USER;
const WEBHOOK_PASS = process.env.DOORDASH_WEBHOOK_BASIC_PASSWORD;

function verifyWebhookAuth(authHeader: string | undefined): boolean {
  if (!WEBHOOK_USER || !WEBHOOK_PASS) return true;
  if (!authHeader?.startsWith("Basic ")) return false;
  const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf8");
  const [user, pass] = decoded.split(":");
  return user === WEBHOOK_USER && pass === WEBHOOK_PASS;
}

function verifyBpWebhookAuth(req: {
  headers: import("express").Request["headers"];
}): boolean {
  const secret = process.env.BRANCHLESSPAY_WEBHOOK_SECRET?.trim();
  if (!secret) {
    // Dev/sandbox only — production must set BRANCHLESSPAY_WEBHOOK_SECRET.
    return process.env.NODE_ENV !== "production";
  }

  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    if (auth.slice(7).trim() === secret) return true;
  }

  const headerCandidates = [
    req.headers["x-branchlesspay-secret"],
    req.headers["x-webhook-secret"],
    req.headers["x-bp-webhook-secret"],
  ];
  for (const h of headerCandidates) {
    if (typeof h === "string" && h.trim() === secret) return true;
  }

  return false;
}

router.post("/webhooks/doordash", async (req, res): Promise<void> => {
  if (!verifyWebhookAuth(req.headers.authorization)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const eventRaw =
    body.event_name ?? body.event ?? body.type ?? "";
  const eventType = String(eventRaw).trim().toLowerCase().replace(/_/g, ".");
  const externalDeliveryId = String(
    body.external_delivery_id ?? body.externalDeliveryId ?? "",
  );

  if (!externalDeliveryId) {
    res.status(400).json({ error: "missing external_delivery_id" });
    return;
  }

  const trackingUrl =
    typeof body.tracking_url === "string" ? body.tracking_url : undefined;

  const rows = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.doordashExternalDeliveryId, externalDeliveryId));

  const order = rows[0];
  if (!order) {
    res.status(200).json({ ok: true, note: "order not found" });
    return;
  }

  const mappedStatus = mapDoordashEventToOrderStatus(eventType);
  const updates: Partial<typeof ordersTable.$inferInsert> = {
    doordashStatus: eventType,
    ...(trackingUrl ? { doordashTrackingUrl: trackingUrl } : {}),
    ...(mappedStatus ? { status: mappedStatus } : {}),
  };

  await db
    .update(ordersTable)
    .set(updates)
    .where(eq(ordersTable.id, order.id));

  if (
    mappedStatus === "completed" &&
    order.squareOrderId &&
    (await isSquareConfigured(order.tenantId))
  ) {
    try {
      await syncSquareOrderFromOwnerStatus(
        order.squareOrderId,
        "completed",
        order.tenantId,
      );
    } catch (err) {
      req.log.error({ err }, "Square complete sync from DoorDash webhook failed");
    }
  }

  res.status(200).json({ ok: true });
});

/**
 * BP → Orderly proof-back (pos-native + queued platform anchors).
 * Spec: BRANCHLESSPAY_WEBHOOK_SECRET; reference_id = Orderly order UUID.
 */
async function handleAnchorCallback(
  req: import("express").Request,
  res: import("express").Response,
): Promise<void> {
  if (!verifyBpWebhookAuth(req)) {
    noteAnchorWebhookFailure();
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const body =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>)
      : {};
  const parsed = parseAnchorCallbackBody(body);
  if (!parsed) {
    noteAnchorWebhookFailure();
    res.status(400).json({ error: "missing reference_id" });
    return;
  }

  const result = await applyAnchorProof(parsed);
  if (!result.ok) {
    // 200 for unknown order — BP retries are noisy; log and ack.
    if (result.error === "order not found") {
      req.log.warn(
        { referenceId: parsed.referenceId },
        "Anchor callback: order not found",
      );
      res.status(200).json({ ok: true, note: "order not found" });
      return;
    }
    noteAnchorWebhookFailure();
    res.status(400).json({ error: result.error ?? "apply failed" });
    return;
  }

  noteAnchorWebhookSuccess();
  req.log.info(
    {
      orderId: result.orderId,
      status: parsed.status,
      txHash: parsed.txHash,
    },
    "Anchor proof applied from BP callback",
  );
  res.status(200).json({ ok: true, order_id: result.orderId });
}

router.post("/anchor-callback", async (req, res): Promise<void> => {
  await handleAnchorCallback(req, res);
});

router.post("/webhooks/branchlesspay", async (req, res): Promise<void> => {
  await handleAnchorCallback(req, res);
});

router.post("/webhooks/anchor-callback", async (req, res): Promise<void> => {
  await handleAnchorCallback(req, res);
});

export default router;
