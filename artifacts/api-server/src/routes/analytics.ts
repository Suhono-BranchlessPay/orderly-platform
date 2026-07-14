import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { db } from "@workspace/db";
import { analyticsEventsTable } from "@workspace/db";
import { getTenantId } from "../lib/tenant";
import { enqueueFromAnalytics } from "../lib/metaCapi";

const router = Router();

const EVENT_TYPES = [
  "page_view",
  "menu_view",
  "add_to_cart",
  "checkout_start",
  "paid",
] as const;

const trackSchema = z.object({
  session_id: z.string().min(8).max(128),
  event_type: z.enum(EVENT_TYPES),
  item_id: z.string().max(128).nullable().optional(),
  order_id: z.string().max(128).nullable().optional(),
  /** Stable id for Meta Pixel↔CAPI dedup when browser Pixel is added. */
  event_id: z.string().min(8).max(128).nullable().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Fire-and-forget funnel instrumentation.
 * Storefront/apps POST here; never invent historical funnel without these rows.
 * Optionally mirrors to Meta CAPI outbox when META_CAPI_ENABLED=1 (async).
 */
router.post("/analytics/events", async (req, res): Promise<void> => {
  const parsed = trackSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid analytics event" });
    return;
  }

  const tenantId = req.tenant?.id ?? getTenantId();
  const { session_id, event_type, item_id, order_id, event_id, meta } =
    parsed.data;

  try {
    await db.insert(analyticsEventsTable).values({
      id: randomUUID(),
      tenantId,
      sessionId: session_id,
      eventType: event_type,
      itemId: item_id ?? null,
      orderId: order_id ?? null,
      meta: {
        ...(meta ?? {}),
        ...(event_id ? { event_id } : {}),
      },
    });
    res.status(202).json({ ok: true });
  } catch (err) {
    req.log?.error({ err }, "analytics event insert failed");
    // Do not break UX — acknowledge soft failure
    res.status(202).json({ ok: false });
  }

  // After response path: enqueue Meta CAPI (never throws to client).
  void enqueueFromAnalytics({
    tenantId,
    eventType: event_type,
    eventId: event_id,
    itemId: item_id,
    orderId: order_id,
    meta: meta ?? {},
    clientIp: typeof req.ip === "string" ? req.ip : null,
    userAgent:
      typeof req.headers["user-agent"] === "string"
        ? req.headers["user-agent"]
        : null,
  }).catch((err) => {
    req.log?.warn({ err }, "meta CAPI enqueue from analytics failed");
  });
});

export default router;
