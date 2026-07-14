/** Client-side pickup ETA ranges — heuristic only (not kitchen telemetry). */

export type PickupStage = "pending" | "preparing" | "ready" | "completed" | "cancelled";

export function normalizePickupStage(status?: string | null): PickupStage {
  const s = (status || "pending").toLowerCase();
  if (s === "preparing" || s === "in_progress") return "preparing";
  if (s === "ready") return "ready";
  if (s === "completed") return "completed";
  if (s === "cancelled") return "cancelled";
  return "pending";
}

export function pickupEtaLabel(stage: PickupStage): string {
  switch (stage) {
    case "pending":
      return "Est. ready in 20–30 min";
    case "preparing":
      return "Est. ready in 10–20 min";
    case "ready":
      return "Ready for pickup now";
    case "completed":
      return "Picked up";
    case "cancelled":
      return "Order cancelled";
    default:
      return "Estimating…";
  }
}

export function stageIndex(stage: PickupStage): number {
  switch (stage) {
    case "pending":
      return 0;
    case "preparing":
      return 1;
    case "ready":
      return 2;
    case "completed":
      return 3;
    default:
      return 0;
  }
}

export const PICKUP_STEPS = [
  { key: "pending", label: "Received" },
  { key: "preparing", label: "Preparing" },
  { key: "ready", label: "Ready for pickup" },
] as const;

/** Next hour slots for schedule-ahead UI (local time). */
export function buildPickupSlots(now = new Date(), count = 8): { iso: string; label: string }[] {
  const slots: { iso: string; label: string }[] = [];
  const start = new Date(now);
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);

  for (let i = 0; i < count; i++) {
    const d = new Date(start.getTime() + i * 30 * 60_000);
    // skip late night / early morning
    const h = d.getHours();
    if (h < 10 || h >= 21) continue;
    const label = d.toLocaleString(undefined, {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
    slots.push({ iso: d.toISOString(), label });
    if (slots.length >= count) break;
  }
  return slots;
}
