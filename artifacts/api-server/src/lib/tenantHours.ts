/**
 * Tenant hours + timezone (onboarding Step 3).
 * Timezone lives in tenants.hours.timezone (IANA) — never silently hardcode.
 */
import { eq } from "drizzle-orm";
import { db, tenantsTable, type Tenant } from "@workspace/db";
import {
  hoursSchema,
  hoursToTenantJson,
  isValidIanaTimeZone,
  type WizardHours,
  WEEKDAYS,
} from "./onboardingWizard";

export const TIMEZONE_MISSING = "timezone_required";
export const HOURS_INCOMPLETE = "hours_incomplete";

export function parseHoursFromTenant(
  hours: Record<string, unknown> | null | undefined,
): WizardHours | null {
  if (!hours || typeof hours !== "object") return null;
  const timezone =
    typeof hours.timezone === "string" ? hours.timezone.trim() : "";
  if (!timezone || !isValidIanaTimeZone(timezone)) return null;

  const weeklyRaw = Array.isArray(hours.weekly) ? hours.weekly : [];
  const weekly = WEEKDAYS.map((day) => {
    const row = weeklyRaw.find(
      (r) =>
        r &&
        typeof r === "object" &&
        String((r as { day?: string }).day || "") === day,
    ) as { hours?: string } | undefined;
    return {
      day,
      hours: String(row?.hours || "").trim() || "Closed",
    };
  });

  const parsed = hoursSchema.safeParse({
    timezone,
    timezoneConfirmed: true,
    weekly,
    confirmedAt:
      typeof hours.confirmedAt === "string" ? hours.confirmedAt : null,
  });
  return parsed.success ? parsed.data : null;
}

export function tenantHasTimezone(tenant: Pick<Tenant, "hours">): boolean {
  const tz = (tenant.hours as Record<string, unknown> | null)?.timezone;
  return typeof tz === "string" && isValidIanaTimeZone(tz.trim());
}

export function readTenantTimezone(
  hours: Record<string, unknown> | null | undefined,
): string | null {
  const tz = typeof hours?.timezone === "string" ? hours.timezone.trim() : "";
  return tz && isValidIanaTimeZone(tz) ? tz : null;
}

export async function loadTenantHours(
  tenantId: string,
): Promise<WizardHours | null> {
  if (!tenantId) return null;
  const [row] = await db
    .select({ hours: tenantsTable.hours })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);
  if (!row) return null;
  return parseHoursFromTenant(row.hours as Record<string, unknown>);
}

/** Fail-closed for AI / reports that depend on local calendar day. */
export async function requireTenantTimezone(
  tenantId: string,
): Promise<
  | { ok: true; timezone: string; hours: WizardHours }
  | { ok: false; error: typeof TIMEZONE_MISSING; message: string }
> {
  const hours = await loadTenantHours(tenantId);
  if (!hours?.timezone) {
    return {
      ok: false,
      error: TIMEZONE_MISSING,
      message:
        "Timezone is not configured for this tenant. Complete onboarding Step 3 (hours & timezone) before generating AI content or reports.",
    };
  }
  return { ok: true, timezone: hours.timezone, hours };
}

export function mergeWizardHoursIntoTenantHours(
  existing: Record<string, unknown> | null | undefined,
  wizardHours: WizardHours,
): Record<string, unknown> {
  const next = hoursToTenantJson(wizardHours);
  return {
    ...(existing && typeof existing === "object" ? existing : {}),
    ...next,
    confirmedAt: wizardHours.confirmedAt || new Date().toISOString(),
  };
}
