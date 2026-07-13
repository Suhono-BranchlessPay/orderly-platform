/** Order channel + tip helpers for create-order path. */

export const ORDER_CHANNELS = [
  "web",
  "android",
  "ios",
  "qr",
  "doordash",
  "instagram",
  "tiktok",
  "facebook",
  "other",
] as const;

export type OrderChannel = (typeof ORDER_CHANNELS)[number];

export function normalizeOrderChannel(raw: unknown): OrderChannel | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if ((ORDER_CHANNELS as readonly string[]).includes(v)) {
    return v as OrderChannel;
  }
  return null;
}

export function resolveOrderChannel(input: {
  bodyChannel?: unknown;
  headerChannel?: unknown;
  userAgent?: string;
}): OrderChannel {
  const fromBody = normalizeOrderChannel(input.bodyChannel);
  if (fromBody) return fromBody;
  const fromHeader = normalizeOrderChannel(input.headerChannel);
  if (fromHeader) return fromHeader;

  const ua = (input.userAgent || "").toLowerCase();
  if (ua.includes("orderly-android") || ua.includes("okhttp")) return "android";
  if (ua.includes("orderly-ios") || ua.includes("darwin")) return "ios";
  return "web";
}

/** Tip cents from percent of subtotal or explicit custom cents. Cap at 100% of subtotal (or $200). */
export function resolveTipCents(input: {
  subtotalCents: number;
  tipCents?: number | null;
  tipPercent?: number | null;
}): number {
  const subtotal = Math.max(0, Math.round(input.subtotalCents));
  const maxTip = Math.max(subtotal, 20_000); // at least $200 cap floor for small carts

  if (input.tipCents != null && Number.isFinite(input.tipCents)) {
    return Math.min(maxTip, Math.max(0, Math.round(input.tipCents)));
  }
  if (input.tipPercent != null && Number.isFinite(input.tipPercent)) {
    const pct = Math.min(100, Math.max(0, Number(input.tipPercent)));
    return Math.min(maxTip, Math.round((subtotal * pct) / 100));
  }
  return 0;
}

export function statusTimestampPatch(
  status: string,
  now = new Date(),
): Partial<{
  acceptedAt: Date;
  inProgressAt: Date;
  readyAt: Date;
  completedAt: Date;
}> {
  switch (status) {
    case "preparing":
      return { acceptedAt: now, inProgressAt: now };
    case "ready":
      return { readyAt: now };
    case "completed":
      return { completedAt: now };
    default:
      return {};
  }
}
