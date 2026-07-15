/**
 * Per-tenant kitchen/prep settings — owner-tunable in /client, consumed by KDS
 * and the storefront pickup estimate. Missing row = DEFAULTS (never invented).
 */
import { eq } from "drizzle-orm";
import { db, kitchenSettingsTable, type KitchenSettings } from "@workspace/db";

export type KitchenSettingsView = {
  tenant_id: string;
  prep_time_minutes: number;
  busy_mode: boolean;
  busy_extra_minutes: number;
  orders_paused: boolean;
  updated_at: string | null;
};

export const DEFAULT_KITCHEN_SETTINGS = {
  prepTimeMinutes: 15,
  busyMode: false,
  busyExtraMinutes: 10,
  ordersPaused: false,
} as const;

/** Allowed prep-time presets from the instruction (10/15/20/25/30). */
export const PREP_TIME_OPTIONS = [10, 15, 20, 25, 30] as const;

function toView(tenantId: string, row: KitchenSettings | undefined): KitchenSettingsView {
  return {
    tenant_id: tenantId,
    prep_time_minutes: row?.prepTimeMinutes ?? DEFAULT_KITCHEN_SETTINGS.prepTimeMinutes,
    busy_mode: row?.busyMode ?? DEFAULT_KITCHEN_SETTINGS.busyMode,
    busy_extra_minutes:
      row?.busyExtraMinutes ?? DEFAULT_KITCHEN_SETTINGS.busyExtraMinutes,
    orders_paused: row?.ordersPaused ?? DEFAULT_KITCHEN_SETTINGS.ordersPaused,
    updated_at: row?.updatedAt ? row.updatedAt.toISOString() : null,
  };
}

export async function getKitchenSettings(
  tenantId: string,
): Promise<KitchenSettingsView> {
  const rows = await db
    .select()
    .from(kitchenSettingsTable)
    .where(eq(kitchenSettingsTable.tenantId, tenantId))
    .limit(1);
  return toView(tenantId, rows[0]);
}

export type KitchenSettingsPatch = {
  prepTimeMinutes?: number;
  busyMode?: boolean;
  busyExtraMinutes?: number;
  ordersPaused?: boolean;
};

function clampInt(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

export async function upsertKitchenSettings(
  tenantId: string,
  patch: KitchenSettingsPatch,
): Promise<KitchenSettingsView> {
  const current = await db
    .select()
    .from(kitchenSettingsTable)
    .where(eq(kitchenSettingsTable.tenantId, tenantId))
    .limit(1);
  const existing = current[0];

  const next = {
    prepTimeMinutes:
      patch.prepTimeMinutes !== undefined
        ? clampInt(patch.prepTimeMinutes, 1, 240)
        : existing?.prepTimeMinutes ?? DEFAULT_KITCHEN_SETTINGS.prepTimeMinutes,
    busyMode:
      patch.busyMode !== undefined
        ? patch.busyMode
        : existing?.busyMode ?? DEFAULT_KITCHEN_SETTINGS.busyMode,
    busyExtraMinutes:
      patch.busyExtraMinutes !== undefined
        ? clampInt(patch.busyExtraMinutes, 0, 240)
        : existing?.busyExtraMinutes ?? DEFAULT_KITCHEN_SETTINGS.busyExtraMinutes,
    ordersPaused:
      patch.ordersPaused !== undefined
        ? patch.ordersPaused
        : existing?.ordersPaused ?? DEFAULT_KITCHEN_SETTINGS.ordersPaused,
    updatedAt: new Date(),
  };

  if (existing) {
    await db
      .update(kitchenSettingsTable)
      .set(next)
      .where(eq(kitchenSettingsTable.tenantId, tenantId));
  } else {
    await db.insert(kitchenSettingsTable).values({ tenantId, ...next });
  }
  return toView(tenantId, { tenantId, ...next } as KitchenSettings);
}

/**
 * Customer-facing pickup estimate as a range ("ready in ~min–max min"),
 * never a false-precision single number. Busy mode adds extra minutes.
 */
export function computePickupEstimate(s: {
  prep_time_minutes: number;
  busy_mode: boolean;
  busy_extra_minutes: number;
}): { min_minutes: number; max_minutes: number; label: string } {
  const base = s.prep_time_minutes + (s.busy_mode ? s.busy_extra_minutes : 0);
  const min = Math.max(1, base - 5);
  const max = base + 5;
  return { min_minutes: min, max_minutes: max, label: `${min}–${max} min` };
}
