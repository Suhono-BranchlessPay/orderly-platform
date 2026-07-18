/**
 * Lightweight funnel tracker — posts to /api/analytics/events.
 * Session id is sticky per browser tab for this tenant.
 * Each call generates a stable event_id for future Meta Pixel↔CAPI dedup.
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

function newEventId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return `e_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/** Best-effort Meta cookie / URL capture for Advanced Matching (fbp/fbc). */
function metaClickIds(): { fbp?: string; fbc?: string } {
  try {
    const raw = document.cookie || "";
    const out: { fbp?: string; fbc?: string } = {};
    for (const part of raw.split(";")) {
      const [k, ...rest] = part.trim().split("=");
      const v = rest.join("=");
      if (k === "_fbp" && v) out.fbp = v;
      if (k === "_fbc" && v) out.fbc = v;
    }
    // Facebook often stamps ?fbclid= without setting _fbc yet — synthesize for CAPI.
    if (!out.fbc) {
      const fbclid = new URLSearchParams(window.location.search).get("fbclid");
      if (fbclid?.trim()) {
        out.fbc = `fb.1.${Date.now()}.${fbclid.trim()}`;
      }
    }
    return out;
  } catch {
    return {};
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
  /** Optional override — otherwise a fresh UUID is generated per call. */
  eventId?: string;
}): void {
  const eventId = input.eventId || newEventId();
  const click = metaClickIds();
  const body = {
    session_id: getAnalyticsSessionId(input.tenantId),
    event_type: input.eventType,
    item_id: input.itemId ?? null,
    order_id: input.orderId ?? null,
    event_id: eventId,
    meta: {
      ...(input.meta ?? {}),
      event_id: eventId,
      source_url:
        typeof window !== "undefined" ? window.location.href : undefined,
      ...(click.fbp ? { fbp: click.fbp } : {}),
      ...(click.fbc ? { fbc: click.fbc } : {}),
    },
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
