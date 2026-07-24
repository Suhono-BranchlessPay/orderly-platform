/**
 * Service-style context (onboarding Step 2) — required before AI content/reports.
 * Prevents wrong claims like "grilled in front of you" for boxed food-truck menus.
 */
import { eq } from "drizzle-orm";
import { db, tenantsTable, type Tenant } from "@workspace/db";
import {
  serviceStyleSchema,
  type WizardServiceStyle,
  defaultDishTerm,
} from "./onboardingWizard";

export const SERVICE_STYLE_MISSING = "service_style_required";

export function parseServiceStyleFromTheme(
  theme: Record<string, unknown> | null | undefined,
): WizardServiceStyle | null {
  const raw = theme?.serviceStyle;
  if (!raw || typeof raw !== "object") return null;
  const parsed = serviceStyleSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function tenantHasServiceStyle(tenant: Pick<Tenant, "theme">): boolean {
  return Boolean(parseServiceStyleFromTheme(tenant.theme as Record<string, unknown>));
}

export function serviceStylePromptBlock(style: WizardServiceStyle): string {
  const show = style.cookingShow
    ? "YES — cooking show / grilled in front of guests is accurate when true for this visit."
    : "NO — never claim food is grilled/cooked in front of guests, hibachi show, or teppanyaki theater.";
  const presentation =
    style.presentation === "box"
      ? "Served in takeout BOXES (not plated dining-room service)."
      : "Served on PLATES (dine-in / plated presentation).";
  return [
    `Presentation: ${presentation}`,
    `Cooking show in front of guests: ${show}`,
    `Call dishes: "${style.dishTerm}" (use this wording; do not invent "plates" vs "boxes" contrary to this).`,
    `Dine-in available: ${style.dineIn ? "yes" : "no"}.`,
    `Outdoor seating: ${style.outdoorSeating ? "yes" : "no"}.`,
  ].join(" ");
}

export async function loadTenantServiceStyle(
  tenantId: string,
): Promise<WizardServiceStyle | null> {
  if (!tenantId) return null;
  const [row] = await db
    .select({ theme: tenantsTable.theme })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);
  if (!row) return null;
  return parseServiceStyleFromTheme(row.theme as Record<string, unknown>);
}

/** Fail-closed for AI content / report generation. */
export async function requireTenantServiceStyle(
  tenantId: string,
): Promise<
  | { ok: true; style: WizardServiceStyle }
  | { ok: false; error: typeof SERVICE_STYLE_MISSING; message: string }
> {
  const style = await loadTenantServiceStyle(tenantId);
  if (!style) {
    return {
      ok: false,
      error: SERVICE_STYLE_MISSING,
      message:
        "Service style (presentation, cooking show, dine-in) is not configured for this tenant. Complete onboarding Step 2 before generating AI content or reports.",
    };
  }
  return { ok: true, style };
}

export function mergeServiceStyleIntoTheme(
  theme: Record<string, unknown>,
  style: WizardServiceStyle,
): Record<string, unknown> {
  return {
    ...theme,
    serviceStyle: {
      ...style,
      dishTerm: style.dishTerm?.trim() || defaultDishTerm(style.presentation),
      confirmedAt: style.confirmedAt || new Date().toISOString(),
    },
  };
}
