/**
 * Expo Push Service — notify customer when pickup order is ready.
 * No FCM/APNs secrets in Orderly; Expo handles fan-out when using ExpoPushToken.
 * Kill switch: ORDERLY_PUSH_ENABLED=0
 */
import type { Logger } from "pino";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export function isExpoPushEnabled(): boolean {
  const v = (process.env.ORDERLY_PUSH_ENABLED ?? "1").trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "off";
}

export function isExpoPushToken(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  const t = raw.trim();
  return (
    t.startsWith("ExponentPushToken[") ||
    t.startsWith("ExpoPushToken[")
  );
}

export function extractExpoPushToken(
  sourceDetail: Record<string, unknown> | null | undefined,
): string | null {
  if (!sourceDetail || typeof sourceDetail !== "object") return null;
  const candidates = [
    sourceDetail.expo_push_token,
    sourceDetail.expoPushToken,
    sourceDetail.push_token,
  ];
  for (const c of candidates) {
    if (isExpoPushToken(c)) return c.trim();
  }
  return null;
}

export async function sendExpoPush(input: {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  log?: Logger;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isExpoPushEnabled()) {
    return { ok: false, error: "push_disabled" };
  }
  if (!isExpoPushToken(input.to)) {
    return { ok: false, error: "invalid_token" };
  }

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: input.to.trim(),
        sound: "default",
        title: input.title,
        body: input.body,
        data: input.data ?? {},
        channelId: "pickup-ready",
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      data?: { status?: string; message?: string } | Array<{ status?: string; message?: string }>;
      errors?: unknown;
    };
    if (!res.ok) {
      input.log?.warn({ status: res.status, json }, "Expo push HTTP error");
      return { ok: false, error: `http_${res.status}` };
    }
    const ticket = Array.isArray(json.data) ? json.data[0] : json.data;
    if (ticket && ticket.status === "error") {
      input.log?.warn({ ticket }, "Expo push ticket error");
      return { ok: false, error: ticket.message || "ticket_error" };
    }
    return { ok: true };
  } catch (err) {
    input.log?.error({ err }, "Expo push failed");
    return { ok: false, error: err instanceof Error ? err.message : "push_failed" };
  }
}

/** Fire-and-forget friendly helper for order ready. */
export async function notifyPickupReady(input: {
  orderId: string;
  shortId?: string;
  restaurantName?: string | null;
  sourceDetail?: Record<string, unknown> | null;
  log?: Logger;
}): Promise<void> {
  const token = extractExpoPushToken(input.sourceDetail);
  if (!token) return;
  const short =
    input.shortId ||
    input.orderId.replace(/-/g, "").slice(0, 8).toUpperCase();
  const place = (input.restaurantName || "the restaurant").trim();
  await sendExpoPush({
    to: token,
    title: "Ready for pickup",
    body: `Order #${short} is ready at ${place}.`,
    data: {
      orderId: input.orderId,
      type: "pickup_ready",
    },
    log: input.log,
  });
}
