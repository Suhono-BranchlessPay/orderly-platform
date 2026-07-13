/**
 * Lightweight funnel tracker — posts to /api/analytics/events.
 * Session id is sticky per browser tab for this tenant.
 */

const API_BASE = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

function sessionKey(tenantId: string) {
  return `orderly_analytics_session_${tenantId}`;
}

export function getAnalyticsSessionId(tenantId: string): string {
  try {
    const existing = sessionStorage.getItem(sessionKey(tenantId));
    if (existing) return existing;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `s_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(sessionKey(tenantId), id);
    return id;
  } catch {
    return `s_${Date.now()}`;
  }
}

export type AnalyticsEventType =
  | "page_view"
  | "menu_view"
  | "add_to_cart"
  | "checkout_start"
  | "paid";

export function trackAnalyticsEvent(input: {
  tenantId: string;
  eventType: AnalyticsEventType;
  itemId?: string | null;
  orderId?: string | null;
  meta?: Record<string, unknown>;
}): void {
  const body = {
    session_id: getAnalyticsSessionId(input.tenantId),
    event_type: input.eventType,
    item_id: input.itemId ?? null,
    order_id: input.orderId ?? null,
    meta: input.meta ?? {},
  };
  void fetch(`${API_BASE}/api/analytics/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {
    /* never block UX */
  });
}
